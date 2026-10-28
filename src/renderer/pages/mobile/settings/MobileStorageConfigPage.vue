<template>
  <ion-page>
    <MobileNavBar
      :title="isNew ? t('mobileSettings.sync.newStorage') : t('mobileSettings.sync.editStorage')"
      leading="none"
      solid
    >
      <template #start>
        <button type="button" class="m-btn storage-cancel" @click="close">{{ t('common.cancel') }}</button>
      </template>
      <template #end>
        <button type="button" class="m-save" :disabled="!isValid || busy.save" @click="saveConfig">{{ t('common.save') }}</button>
      </template>
    </MobileNavBar>

    <ion-content class="m-page-content">
      <div class="m-body storage-body">
        <!-- 移动端只支持 WebDAV：iCloud 在移动端没有真正的跨设备同步能力，不提供类型切换 -->
        <p v-if="existingConfig && existingConfig.type !== 'webdav'" class="m-note storage-unsupported">
          <ion-icon :icon="warningOutline" aria-hidden="true" />
          <span>{{ t('cloudBackup.mobileICloudUnsupported') }}</span>
        </p>

        <MobileGroup title="WebDAV" :icons="false" :footer="t('cloudBackup.webdavInfo')">
          <label class="m-field">
            <span>{{ t('dataSync.configName') }}</span>
            <input
              v-model="form.name"
              :placeholder="t('dataSync.configNamePlaceholder')"
              autocapitalize="off"
              enterkeyhint="next"
            />
          </label>
          <label class="m-field">
            <span>{{ t('dataSync.serverUrl') }}</span>
            <input
              v-model="form.url"
              class="storage-url"
              type="url"
              inputmode="url"
              placeholder="https://your-webdav-server.com"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              enterkeyhint="next"
            />
          </label>
          <label class="m-field">
            <span>{{ t('dataSync.username') }}</span>
            <input
              v-model="form.username"
              :placeholder="t('dataSync.usernamePlaceholder')"
              autocomplete="username"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              enterkeyhint="next"
            />
          </label>
          <div class="m-field">
            <label for="storage-password">{{ t('dataSync.password') }}</label>
            <span class="storage-password">
              <input
                id="storage-password"
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                :placeholder="t('dataSync.passwordPlaceholder')"
                autocomplete="current-password"
                autocapitalize="off"
                autocorrect="off"
                spellcheck="false"
                enterkeyhint="done"
              />
              <button
                type="button"
                class="storage-password__toggle"
                :aria-label="showPassword ? t('mobileSettings.sync.hidePassword') : t('mobileSettings.sync.showPassword')"
                :aria-pressed="showPassword"
                @click="showPassword = !showPassword"
              >
                <ion-icon :icon="showPassword ? eyeOffOutline : eyeOutline" aria-hidden="true" />
              </button>
            </span>
          </div>
        </MobileGroup>

        <MobileGroup>
          <MobileRow static :title="t('dataSync.enableConfig')" :icon="powerOutline" tone="green">
            <template #end>
              <ion-toggle
                :checked="form.enabled"
                :aria-label="t('dataSync.enableConfig')"
                @ionChange="form.enabled = $event.detail.checked"
              />
            </template>
          </MobileRow>
        </MobileGroup>

        <div class="storage-actions">
          <button type="button" class="m-cta m-cta-2" :disabled="!isValid || busy.test" @click="testConnection">
            <ion-spinner v-if="busy.test" name="crescent" aria-hidden="true" />
            <ion-icon v-else :icon="pulseOutline" aria-hidden="true" />
            {{ t('dataSync.testConnection') }}
          </button>
          <p v-if="testResult" class="storage-test-result" :class="`storage-test-result--${testResult.tone}`" role="status">
            <ion-icon :icon="testResultIcon" aria-hidden="true" />
            <span>{{ testResult.message }}</span>
          </p>

          <button
            v-if="!isNew"
            type="button"
            class="m-cta m-cta-2"
            :disabled="!form.enabled || busy.sync"
            @click="syncNow"
          >
            <ion-spinner v-if="busy.sync" name="crescent" aria-hidden="true" />
            <ion-icon v-else :icon="syncOutline" aria-hidden="true" />
            {{ t('mobileSettings.sync.syncThisStorage') }}
          </button>
        </div>

        <button v-if="!isNew" type="button" class="m-danger" :disabled="busy.delete" @click="deleteConfig">
          {{ t('mobileSettings.sync.deleteStorage') }}
        </button>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Capacitor } from '@capacitor/core'
import {
  IonPage,
  IonContent,
  IonIcon,
  IonSpinner,
  IonToggle,
  onIonViewWillEnter
} from '@ionic/vue'
import {
  alertCircleOutline,
  checkmarkCircleOutline,
  eyeOffOutline,
  eyeOutline,
  powerOutline,
  pulseOutline,
  syncOutline,
  warningOutline
} from 'ionicons/icons'
import MobileNavBar from '~/components/mobile/ui/MobileNavBar.vue'
import MobileGroup from '~/components/mobile/ui/MobileGroup.vue'
import MobileRow from '~/components/mobile/ui/MobileRow.vue'
import { useI18n } from '~/composables/useI18n'
import { CloudBackupAPI } from '~/lib/api/cloud-backup.api'
import {
  cloudSyncService,
  getCloudSyncResultMessage
} from '~/lib/services/cloud-sync.service'
import type { CloudStorageConfig } from '@shared/types/cloud-backup'
import { confirmAction, getDeviceLabel, presentSyncErrorDetails, showToast, withLoading } from './shared'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const platform = Capacitor.getPlatform()

const configId = computed(() => String(route.params.id || 'new'))
const isNew = computed(() => configId.value === 'new')
const existingConfig = ref<CloudStorageConfig | null>(null)

const form = reactive({
  name: '',
  url: '',
  username: '',
  password: '',
  enabled: true
})

const busy = reactive({ save: false, test: false, sync: false, delete: false })
const showPassword = ref(false)
// 测试连接的结果直接显示在按钮下方；表单一改就清掉，避免显示过期的结论
const testResult = ref<{ tone: 'success' | 'warning' | 'error'; message: string } | null>(null)

const testResultIcon = computed(() => testResult.value?.tone === 'success'
  ? checkmarkCircleOutline
  : testResult.value?.tone === 'warning' ? warningOutline : alertCircleOutline)

watch(() => [form.url, form.username, form.password], () => {
  testResult.value = null
})

const isValid = computed(() =>
  Boolean(form.name.trim() && form.url.trim() && form.username.trim() && form.password))

const buildConfigPayload = () => ({
  name: form.name.trim(),
  type: 'webdav' as const,
  enabled: form.enabled,
  url: form.url.trim(),
  username: form.username.trim(),
  password: form.password
})

const close = () => {
  if (window.history.length > 1) router.back()
  else void router.replace('/mobile/settings/data-sync')
}

const loadConfig = async () => {
  showPassword.value = false
  testResult.value = null
  if (isNew.value) {
    existingConfig.value = null
    Object.assign(form, { name: '', url: '', username: '', password: '', enabled: true })
    return
  }

  try {
    const configs = await CloudBackupAPI.getStorageConfigs()
    const config = configs.find(item => item.id === configId.value)
    if (!config) {
      await showToast(t('cloudBackup.noStorageSelected'), 'danger')
      router.back()
      return
    }
    existingConfig.value = config
    const webdav = config as { url?: string; username?: string; password?: string }
    Object.assign(form, {
      name: config.name,
      url: webdav.url || '',
      username: webdav.username || '',
      password: webdav.password || '',
      enabled: config.enabled
    })
    testResult.value = null
  } catch (error) {
    console.error('加载存储配置失败:', error)
    await showToast(t('dataSync.loadConfigsFailed'), 'danger')
  }
}

const saveConfig = async () => {
  if (!isValid.value || busy.save) return
  busy.save = true

  try {
    const payload = buildConfigPayload()
    const result = await withLoading(t('common.loading'), () => isNew.value
      ? CloudBackupAPI.addStorageConfig(payload)
      : CloudBackupAPI.updateStorageConfig(configId.value, payload))

    if (!result.success) {
      await showToast(result.error || t('dataSync.saveFailed'), 'danger')
      return
    }

    await showToast(t(isNew.value ? 'dataSync.addSuccess' : 'dataSync.updateSuccess'))
    // 保存后立刻排一次同步，让用户马上看到配置是否真的可用。
    if (result.config?.enabled) {
      cloudSyncService.scheduleSync('config-change', { storageId: result.config.id, delayMs: 0 })
    }
    router.back()
  } catch (error) {
    console.error('保存存储配置失败:', error)
    await showToast(t('dataSync.saveFailed'), 'danger')
  } finally {
    busy.save = false
  }
}

const testConnection = async () => {
  if (!isValid.value || busy.test) return
  busy.test = true
  testResult.value = null

  try {
    const result = await CloudBackupAPI.testStorageConnection({
      id: existingConfig.value?.id || 'draft',
      createdAt: existingConfig.value?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...buildConfigPayload()
    } as CloudStorageConfig)

    // 移动端实现会在连接可用但目录需要初始化时附带 warning，桌面端类型里没有这个字段。
    const warning = (result as { warning?: string }).warning
    if (result.success) {
      testResult.value = warning
        ? { tone: 'warning', message: warning }
        : { tone: 'success', message: t('dataSync.connectionTestSuccess') }
    } else {
      testResult.value = { tone: 'error', message: result.error || t('dataSync.connectionTestFailed') }
    }
  } catch (error) {
    console.error('测试存储连接失败:', error)
    testResult.value = { tone: 'error', message: t('dataSync.connectionTestFailed') }
  } finally {
    busy.test = false
  }
}

const syncNow = async () => {
  if (isNew.value || busy.sync) return
  busy.sync = true
  const storageId = configId.value

  try {
    const result = await withLoading(t('cloudBackup.syncing'), () =>
      cloudSyncService.syncNow(storageId, {
        platform,
        deviceName: getDeviceLabel(),
        reason: 'manual'
      }))

    if (result.success && result.action === 'conflict-pending') {
      // 冲突在数据同步页处理，这里只提示
      await showToast(getCloudSyncResultMessage(result.action), 'warning')
    } else if (result.success) {
      await showToast([
        getCloudSyncResultMessage(result.action, result.conflicts.length),
        ...(result.warnings || [])
      ].join('; '))
    } else {
      await presentSyncErrorDetails(result, { storageId })
    }
  } catch (error) {
    await presentSyncErrorDetails(
      error instanceof Error ? error.message : String(error),
      { storageId }
    )
  } finally {
    busy.sync = false
  }
}

const deleteConfig = async () => {
  const confirmed = await confirmAction({
    header: t('common.confirm'),
    message: t('dataSync.confirmDeleteConfig'),
    confirmText: t('common.delete'),
    destructive: true
  })
  if (!confirmed) return

  busy.delete = true
  try {
    const result = await CloudBackupAPI.deleteStorageConfig(configId.value)
    if (!result.success) {
      await showToast(result.error || t('dataSync.deleteFailed'), 'danger')
      return
    }
    await showToast(t('dataSync.deleteSuccess'))
    router.back()
  } catch (error) {
    console.error('删除存储配置失败:', error)
    await showToast(t('dataSync.deleteFailed'), 'danger')
  } finally {
    busy.delete = false
  }
}

onIonViewWillEnter(loadConfig)
</script>

<style scoped>
.m-body.storage-body {
  gap: 18px;
}

.m-btn.storage-cancel {
  color: var(--content-secondary);
}

.m-note.storage-unsupported {
  color: var(--accent-warning);
}

.m-field input.storage-url {
  font-size: var(--m-font-sub);
}

.storage-password {
  display: flex;
  align-items: center;
  gap: 8px;
}

.storage-password input {
  flex: 1;
}

.storage-password__toggle {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin: -12px -12px -12px 0;
  border: 0;
  background: transparent;
  color: var(--content-tertiary);
  font-size: 18px;
  cursor: pointer;
}

.storage-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.storage-actions .m-cta ion-icon {
  font-size: 18px;
}

.storage-actions .m-cta ion-spinner {
  width: 18px;
  height: 18px;
}

.storage-test-result {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 6px;
  margin: 0;
  padding: 0 6px;
  font-size: var(--m-font-sub);
  line-height: 1.5;
  text-align: center;
}

.storage-test-result ion-icon {
  flex: none;
  margin-top: 2px;
  font-size: 16px;
}

.storage-test-result--success {
  color: var(--accent-success);
}

.storage-test-result--warning {
  color: var(--accent-warning);
}

.storage-test-result--error {
  color: var(--accent-error);
}

.m-danger:disabled {
  opacity: 0.5;
}
</style>
