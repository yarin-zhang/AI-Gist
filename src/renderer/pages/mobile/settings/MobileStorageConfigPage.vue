<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :text="t('common.back')" default-href="/mobile/settings/data-sync"></ion-back-button>
        </ion-buttons>
        <ion-title>
          {{ isNew ? t('mobileSettings.sync.newStorage') : t('mobileSettings.sync.editStorage') }}
        </ion-title>
        <ion-buttons slot="end">
          <ion-button :disabled="!isValid || busy.save" @click="saveConfig">{{ t('common.save') }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-list>
        <ion-list-header>
          <ion-label>{{ t('dataSync.storageType') }}</ion-label>
        </ion-list-header>

        <ion-item lines="none">
          <ion-label class="ion-text-wrap">
            <h3>WebDAV</h3>
            <p>{{ t('cloudBackup.webdavInfo') }}</p>
          </ion-label>
        </ion-item>
      </ion-list>

      <ion-list>
        <ion-item>
          <ion-input
            :label="t('dataSync.configName')"
            label-placement="stacked"
            :placeholder="t('dataSync.configNamePlaceholder')"
            :value="form.name"
            autocapitalize="off"
            @ionInput="form.name = String($event.detail.value ?? '')"
          ></ion-input>
        </ion-item>

        <ion-item>
          <ion-input
            :label="t('dataSync.serverUrl')"
            label-placement="stacked"
            placeholder="https://your-webdav-server.com"
            type="url"
            inputmode="url"
            autocapitalize="off"
            autocorrect="off"
            :value="form.url"
            @ionInput="form.url = String($event.detail.value ?? '')"
          ></ion-input>
        </ion-item>

        <ion-item>
          <ion-input
            :label="t('dataSync.username')"
            label-placement="stacked"
            :placeholder="t('dataSync.usernamePlaceholder')"
            autocapitalize="off"
            autocorrect="off"
            :value="form.username"
            @ionInput="form.username = String($event.detail.value ?? '')"
          ></ion-input>
        </ion-item>

        <ion-item>
          <ion-input
            :label="t('dataSync.password')"
            label-placement="stacked"
            :placeholder="t('dataSync.passwordPlaceholder')"
            type="password"
            :value="form.password"
            @ionInput="form.password = String($event.detail.value ?? '')"
          ></ion-input>
        </ion-item>

        <ion-item>
          <ion-toggle :checked="form.enabled" @ionChange="form.enabled = $event.detail.checked">
            {{ t('dataSync.enableConfig') }}
          </ion-toggle>
        </ion-item>
      </ion-list>

      <div class="stacked-actions">
        <ion-button
          expand="block"
          fill="outline"
          :disabled="!isValid || busy.test"
          @click="testConnection"
        >
          <ion-spinner v-if="busy.test" slot="start" name="crescent"></ion-spinner>
          {{ t('dataSync.testConnection') }}
        </ion-button>

        <ion-button
          v-if="!isNew"
          expand="block"
          fill="outline"
          :disabled="!form.enabled || busy.sync"
          @click="syncNow"
        >
          <ion-spinner v-if="busy.sync" slot="start" name="crescent"></ion-spinner>
          {{ t('mobileSettings.sync.syncThisStorage') }}
        </ion-button>

        <ion-button
          v-if="!isNew"
          expand="block"
          fill="outline"
          color="danger"
          :disabled="busy.delete"
          @click="deleteConfig"
        >
          {{ t('mobileSettings.sync.deleteStorage') }}
        </ion-button>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Capacitor } from '@capacitor/core'
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonButton,
  IonContent,
  IonList,
  IonListHeader,
  IonItem,
  IonLabel,
  IonInput,
  IonToggle,
  IonSpinner,
  onIonViewWillEnter
} from '@ionic/vue'
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

const loadConfig = async () => {
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
    Object.assign(form, {
      name: config.name,
      url: (config as any).url || '',
      username: (config as any).username || '',
      password: (config as any).password || '',
      enabled: config.enabled
    })
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
      await showToast(warning || t('dataSync.connectionTestSuccess'), warning ? 'warning' : 'success')
    } else {
      await showToast(result.error || t('dataSync.connectionTestFailed'), 'danger')
    }
  } catch (error) {
    console.error('测试存储连接失败:', error)
    await showToast(t('dataSync.connectionTestFailed'), 'danger')
  } finally {
    busy.test = false
  }
}

const syncNow = async () => {
  if (isNew.value || busy.sync) return
  busy.sync = true

  try {
    const result = await withLoading(t('cloudBackup.syncing'), () =>
      cloudSyncService.syncNow(configId.value, {
        platform,
        deviceName: getDeviceLabel(),
        reason: 'manual'
      }))

    if (result.success) {
      await showToast([
        getCloudSyncResultMessage(result.action, result.conflicts.length),
        ...(result.warnings || [])
      ].join('; '))
    } else {
      await presentSyncErrorDetails(result, { storageId: configId.value })
    }
  } catch (error) {
    await presentSyncErrorDetails(
      error instanceof Error ? error.message : String(error),
      { storageId: configId.value }
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
/* ion-list-header 与字号阶梯的统一样式见 assets/styles/mobile.css */

.stacked-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 16px 24px;
}
</style>
