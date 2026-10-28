<template>
  <ion-page>
    <MobileNavBar :title="t('dataSync.title')" fallback="/tabs/settings" />

    <ion-content class="m-page-content">
      <div class="m-body sync-body">
        <!-- 状态卡：标题和颜色与桌面端共用 resolveDataSyncStatusKind 的判断 -->
        <div class="m-card sync-hero">
          <span class="sync-hero__icon" :class="`sync-hero__icon--${syncView.tone}`" aria-hidden="true">
            <ion-icon :icon="syncView.icon" />
          </span>
          <span class="sync-hero__title">{{ syncView.title }}</span>
          <span class="sync-hero__sub">{{ heroSubtitle }}</span>
          <span v-if="lastSyncCaption" class="sync-hero__caption">{{ lastSyncCaption }}</span>

          <button v-if="syncView.kind === 'conflict'" type="button" class="m-cta sync-hero__cta" @click="openConflictSheet">
            <ion-icon :icon="gitMergeOutline" aria-hidden="true" />{{ t('mobileSettings.sync.resolveConflicts') }}
          </button>
          <button v-else-if="storageConfigs.length === 0" type="button" class="m-cta sync-hero__cta" @click="openStorage('new')">
            <ion-icon :icon="addOutline" aria-hidden="true" />{{ t('mobileSettings.sync.addStorage') }}
          </button>
          <button
            v-else-if="primaryStorage && !isRestorePaused"
            type="button"
            class="m-cta sync-hero__cta"
            :disabled="isSyncing"
            @click="syncNow(primaryStorage.id)"
          >
            <ion-spinner v-if="isSyncing" name="crescent" aria-hidden="true" />
            <ion-icon v-else :icon="syncOutline" aria-hidden="true" />
            {{ isSyncing ? t('dataSync.statusSyncing') : t('dataSync.syncNow') }}
          </button>

          <button v-if="canViewErrorDetails" type="button" class="sync-hero__link" @click="showCurrentError">
            {{ t('dataSync.viewErrorDetails') }}
          </button>
        </div>

        <!-- 本地恢复后云端同步会暂停，必须由用户决定合并还是覆盖 -->
        <section v-if="restoreSuspensions.length > 0" class="m-section">
          <span class="m-gt">{{ t('cloudBackup.restoreDecisionTitle') }}</span>
          <div class="sync-decisions">
            <div v-for="suspension in restoreSuspensions" :key="suspension.storageId" class="m-card sync-decision">
              <div class="sync-decision__head">
                <span class="m-tile m-tile--warning" aria-hidden="true"><ion-icon :icon="pauseCircleOutline" /></span>
                <span class="sync-decision__text">
                  <span class="sync-decision__name">{{ getStorageName(suspension.storageId) }}</span>
                  <span class="sync-decision__desc">{{ t('cloudBackup.restoreDecisionDescription') }}</span>
                </span>
              </div>
              <button
                type="button"
                class="m-cta m-cta-2 sync-decision__merge"
                :disabled="busy.restoreDecision"
                @click="resolveRestoreDecision(suspension.storageId, 'merge')"
              >
                <ion-icon :icon="gitMergeOutline" aria-hidden="true" />{{ t('cloudBackup.mergeWithCloud') }}
              </button>
              <button
                type="button"
                class="m-danger"
                :disabled="busy.restoreDecision"
                @click="confirmRestoreOverwrite(suspension.storageId)"
              >
                {{ t('cloudBackup.overwriteCloud') }}
              </button>
            </div>
          </div>
        </section>

        <MobileGroup :title="t('dataSync.storageConfiguration')" :footer="t('mobileSettings.sync.storageSectionDescription')">
          <template #action>
            <button type="button" class="sync-add-link" @click="openStorage('new')">{{ t('mobileSettings.sync.add') }}</button>
          </template>
          <MobileRow
            v-for="config in storageConfigs"
            :key="config.id"
            class="sync-row-tall"
            :title="config.name"
            :sub="getConfigDescription(config)"
            :icon="serverOutline"
            :tone="config.enabled ? 'blue' : 'grey'"
            show-chevron
            @click="openStorage(config.id)"
          >
            <template #end>
              <span class="m-pill" :class="{ 'm-pill-ok': config.enabled }">
                {{ config.enabled ? t('dataSync.enabled') : t('dataSync.disabled') }}
              </span>
            </template>
          </MobileRow>
          <MobileRow
            v-if="storageConfigs.length === 0"
            class="sync-row-tall"
            :title="t('mobileSettings.sync.addStorage')"
            :sub="t('dataSync.noStorageConfig')"
            :icon="addOutline"
            tone="soft"
            show-chevron
            @click="openStorage('new')"
          />
        </MobileGroup>

        <!-- 同步不保留历史版本这件事容易被误解，放在页面底部作为收尾提示 -->
        <MobileGroup :title="t('mobileSettings.sync.autoSyncSection')" :footer="t('mobileSettings.sync.historyHint')">
          <MobileRow
            static
            class="sync-row-tall"
            :title="t('dataSync.enableAutoSync')"
            :sub="t('mobileSettings.sync.autoSyncSub')"
            :icon="flashOutline"
            tone="green"
          >
            <template #end>
              <ion-toggle
                :checked="autoSyncEnabled"
                :aria-label="t('dataSync.enableAutoSync')"
                @ionChange="handleAutoSyncToggle"
              />
            </template>
          </MobileRow>
          <MobileRow
            :class="{ 'is-disabled': !autoSyncEnabled }"
            :title="t('dataSync.syncInterval')"
            :icon="timerOutline"
            tone="violet"
            :value="formatIntervalMinutes(syncIntervalMinutes)"
            show-chevron
            :aria-disabled="!autoSyncEnabled"
            @click="pickSyncInterval"
          />
        </MobileGroup>
      </div>
    </ion-content>

    <SyncConflictSheet :is-open="conflictSheetOpen" :storage-id="conflictStorageId || undefined"
      @close="conflictSheetOpen = false" />
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
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
  addOutline,
  flashOutline,
  gitMergeOutline,
  pauseCircleOutline,
  serverOutline,
  syncOutline,
  timerOutline
} from 'ionicons/icons'
import MobileNavBar from '~/components/mobile/ui/MobileNavBar.vue'
import MobileGroup from '~/components/mobile/ui/MobileGroup.vue'
import MobileRow from '~/components/mobile/ui/MobileRow.vue'
import SyncConflictSheet from '~/components/mobile/settings/SyncConflictSheet.vue'
import { useI18n } from '~/composables/useI18n'
import { CloudBackupAPI } from '~/lib/api/cloud-backup.api'
import {
  cloudSyncService,
  getCloudSyncResultMessage,
  MAX_CLOUD_SYNC_INTERVAL_MINUTES,
  MIN_CLOUD_SYNC_INTERVAL_MINUTES,
  type CloudSyncRestoreSuspension,
  type CloudSyncStatus
} from '~/lib/services/cloud-sync.service'
import type { CloudStorageConfig } from '@shared/types/cloud-backup'
import {
  confirmAction,
  consumeConflictSheetRequest,
  describeSyncStatus,
  formatIntervalMinutes,
  formatRelative,
  getDeviceLabel,
  pickOption,
  presentSyncErrorDetails,
  showToast,
  withLoading
} from './shared'

const router = useRouter()
const { t } = useI18n()
const platform = Capacitor.getPlatform()

const storageConfigs = ref<CloudStorageConfig[]>([])
const syncStatus = ref<CloudSyncStatus>(cloudSyncService.getStatus())
const restoreSuspensions = ref<CloudSyncRestoreSuspension[]>(cloudSyncService.getRestoreSuspensions())
const autoSyncEnabled = ref(true)
const syncIntervalMinutes = ref(MIN_CLOUD_SYNC_INTERVAL_MINUTES)
const busy = reactive({ sync: false, restoreDecision: false })
// 相对时间（「2 分钟前」）在每次进入页面和状态变化时刷新
const now = ref(new Date())
let unsubscribeSyncStatus: (() => void) | null = null

// 移动端用固定档位代替自由输入的分钟数，省掉一个额外的「保存」按钮。
const INTERVAL_PRESETS = [5, 10, 15, 30, 60, 120, 360, 720, 1440]
  .filter(minutes => minutes >= MIN_CLOUD_SYNC_INTERVAL_MINUTES && minutes <= MAX_CLOUD_SYNC_INTERVAL_MINUTES)

const intervalOptions = computed(() => {
  const values = INTERVAL_PRESETS.includes(syncIntervalMinutes.value)
    ? INTERVAL_PRESETS
    : [...INTERVAL_PRESETS, syncIntervalMinutes.value].sort((a, b) => a - b)
  return values.map(value => ({ value, label: formatIntervalMinutes(value) }))
})

const isRestorePaused = computed(() => restoreSuspensions.value.length > 0)
const isSyncing = computed(() => busy.sync || syncStatus.value.status === 'syncing')

const syncView = computed(() => describeSyncStatus({
  status: syncStatus.value,
  autoSyncEnabled: autoSyncEnabled.value,
  storageCount: storageConfigs.value.length,
  restoreSuspensionCount: restoreSuspensions.value.length
}))

// 「立即同步」用当前同步中的存储，没有时用第一个已启用的存储（与桌面端一致）
const primaryStorage = computed(() =>
  storageConfigs.value.find(config => config.id === syncStatus.value.storageId && config.enabled)
  || storageConfigs.value.find(config => config.enabled))

const heroSubtitle = computed(() => {
  const view = syncView.value
  const lastSyncAt = syncStatus.value.lastSyncAt
  if (view.kind === 'current' && lastSyncAt) return `${formatRelative(lastSyncAt, now.value)} · ${view.description}`
  return view.description
})

const lastSyncCaption = computed(() => {
  const kind = syncView.value.kind
  const lastSyncAt = syncStatus.value.lastSyncAt
  if (!lastSyncAt || kind === 'current' || kind === 'notConfigured') return ''
  return t('dataSync.lastSyncAt', { time: formatRelative(lastSyncAt, now.value) })
})

// 失败和「已安排重试」都可以看完整诊断、复制并手动重试
const canViewErrorDetails = computed(() =>
  (syncView.value.kind === 'error' || syncView.value.kind === 'retryScheduled')
  && Boolean(syncStatus.value.lastResult || syncStatus.value.error))

const getStorageName = (storageId: string) =>
  storageConfigs.value.find(config => config.id === storageId)?.name || storageId

const getConfigDescription = (config: CloudStorageConfig) => {
  if (config.type !== 'webdav') return t('cloudBackup.mobileICloudUnsupported')
  const url = String((config as { url?: string }).url || '')
  try {
    return `WebDAV · ${new URL(url).host}`
  } catch {
    return url ? `WebDAV · ${url}` : 'WebDAV'
  }
}

const openStorage = (id: string) => {
  void router.push(`/mobile/settings/data-sync/storage/${id}`)
}

/**
 * 冲突处理面板（SyncConflictSheet）的开关：当前冲突来自 syncStatus.pendingConflict，
 * 处理后服务会推送新的同步状态。
 */
const conflictSheetOpen = ref(false)
const conflictStorageId = computed(() =>
  syncStatus.value.pendingConflict?.storageId || syncStatus.value.storageId || primaryStorage.value?.id || '')
const openConflictSheet = () => {
  if (!conflictStorageId.value) return
  conflictSheetOpen.value = true
}

// 这里的入口（「立即同步」、错误详情里的「重试」）都是用户亲手点的：他多半刚处理过外部问题
// （比如改对了密码），总是真正连接一次，不返回上次记下的失败（与桌面端一致）
const syncNow = async (storageId: string) => {
  if (busy.sync) return
  busy.sync = true
  const retry = () => { void syncNow(storageId) }

  try {
    const result = await cloudSyncService.syncNow(storageId, {
      platform,
      deviceName: getDeviceLabel(),
      reason: 'manual',
      forceRetry: true
    })

    if (result.success && result.action === 'conflict-pending') {
      // 两边都改过同样的数据：本机和云端都没动，等用户选择
      await showToast(getCloudSyncResultMessage(result.action), 'warning')
      openConflictSheet()
    } else if (result.success) {
      await showToast([
        getCloudSyncResultMessage(result.action, result.conflicts.length),
        ...(result.warnings || [])
      ].join('; '))
    } else {
      await presentSyncErrorDetails(result, { storageId, onRetry: retry })
    }
  } catch (error) {
    await presentSyncErrorDetails(
      error instanceof Error ? error.message : String(error),
      { storageId, onRetry: retry }
    )
  } finally {
    busy.sync = false
  }
}

const showCurrentError = () => {
  const storageId = syncStatus.value.storageId || primaryStorage.value?.id
  void presentSyncErrorDetails(syncStatus.value.lastResult || syncStatus.value.error, {
    storageId,
    onRetry: storageId ? () => { void syncNow(storageId) } : undefined
  })
}

const loadStorageConfigs = async () => {
  try {
    storageConfigs.value = await CloudBackupAPI.getStorageConfigs()
  } catch (error) {
    console.error('加载存储配置失败:', error)
    await showToast(t('dataSync.loadConfigsFailed'), 'danger')
  }
}

const loadAutoSyncSettings = async () => {
  autoSyncEnabled.value = await cloudSyncService.getAutoSyncEnabled()
  syncIntervalMinutes.value = await cloudSyncService.getAutoSyncIntervalMinutes()
}

const handleAutoSyncToggle = async (event: CustomEvent<{ checked: boolean }>) => {
  autoSyncEnabled.value = await cloudSyncService.setAutoSyncEnabled(event.detail.checked)
  await showToast(t(autoSyncEnabled.value ? 'dataSync.autoSyncEnabled' : 'dataSync.autoSyncDisabled'))
}

const pickSyncInterval = async () => {
  if (!autoSyncEnabled.value) return
  const value = await pickOption({
    header: t('dataSync.syncInterval'),
    current: syncIntervalMinutes.value,
    items: intervalOptions.value
  })
  if (value === undefined || value === syncIntervalMinutes.value) return

  try {
    syncIntervalMinutes.value = await cloudSyncService.setAutoSyncIntervalMinutes(value)
    await showToast(t('dataSync.syncIntervalSaved', { minutes: syncIntervalMinutes.value }))
  } catch (error) {
    console.error('保存云端检查间隔失败:', error)
    await showToast(t('dataSync.syncIntervalSaveFailed'), 'danger')
  }
}

const resolveRestoreDecision = async (storageId: string, decision: 'merge' | 'overwrite') => {
  busy.restoreDecision = true
  try {
    const result = await withLoading(t('cloudBackup.syncing'), () => decision === 'merge'
      ? cloudSyncService.resumeRestoreWithMerge(storageId, { platform, deviceName: getDeviceLabel() })
      : cloudSyncService.publishRestoredDataToCloud(storageId, { platform, deviceName: getDeviceLabel() }))

    if (!result.success) {
      await presentSyncErrorDetails(result, { storageId })
      return
    }
    restoreSuspensions.value = cloudSyncService.getRestoreSuspensions()
    if (result.action === 'conflict-pending') {
      await showToast(getCloudSyncResultMessage(result.action), 'warning')
      openConflictSheet()
      return
    }
    await showToast(t(decision === 'merge'
      ? 'cloudBackup.mergeWithCloudSuccess'
      : 'cloudBackup.overwriteCloudSuccess'))
  } catch (error) {
    await presentSyncErrorDetails(error instanceof Error ? error.message : String(error), { storageId })
  } finally {
    busy.restoreDecision = false
  }
}

const confirmRestoreOverwrite = async (storageId: string) => {
  const confirmed = await confirmAction({
    header: t('cloudBackup.overwriteCloud'),
    message: t('cloudBackup.overwriteCloudWarning'),
    destructive: true
  })
  if (confirmed) await resolveRestoreDecision(storageId, 'overwrite')
}

onMounted(() => {
  unsubscribeSyncStatus = cloudSyncService.onStatusChange(status => {
    syncStatus.value = status
    restoreSuspensions.value = cloudSyncService.getRestoreSuspensions()
    now.value = new Date()
  })
})

onIonViewWillEnter(async () => {
  now.value = new Date()
  await Promise.all([loadStorageConfigs(), loadAutoSyncSettings()])
  restoreSuspensions.value = cloudSyncService.getRestoreSuspensions()
  syncStatus.value = cloudSyncService.getStatus()
  // 设置首页状态卡上点了「处理冲突」，进来后直接打开面板
  if (consumeConflictSheetRequest() && syncStatus.value.status === 'conflict') openConflictSheet()
})

onUnmounted(() => unsubscribeSyncStatus?.())
</script>

<style scoped>
.m-body.sync-body {
  padding-top: 4px;
}

.m-card.sync-hero {
  align-items: center;
  gap: 6px;
  padding: 24px 18px 18px;
  text-align: center;
}

.sync-hero__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  margin-bottom: 8px;
  border-radius: 36px;
  font-size: 32px;
}

.sync-hero__icon--success {
  background: var(--accent-success-bg);
  box-shadow: 0 0 0 8px color-mix(in srgb, var(--accent-success-bg) 50%, var(--surface-primary));
  color: var(--accent-success);
}

.sync-hero__icon--info {
  background: var(--accent-soft);
  box-shadow: 0 0 0 8px color-mix(in srgb, var(--accent-soft) 50%, var(--surface-primary));
  color: var(--accent-primary);
}

.sync-hero__icon--warning {
  background: var(--accent-warning-bg);
  box-shadow: 0 0 0 8px color-mix(in srgb, var(--accent-warning-bg) 50%, var(--surface-primary));
  color: var(--accent-warning);
}

.sync-hero__icon--error {
  background: var(--accent-error-bg);
  box-shadow: 0 0 0 8px color-mix(in srgb, var(--accent-error-bg) 50%, var(--surface-primary));
  color: var(--accent-error);
}

.sync-hero__title {
  color: var(--content-primary);
  font-size: var(--m-font-block);
  font-weight: 600;
  line-height: 1.3;
}

.sync-hero__sub {
  color: var(--content-tertiary);
  font-size: var(--m-font-sub);
  line-height: 1.5;
}

.sync-hero__caption {
  color: var(--content-tertiary);
  font-size: var(--m-font-caption);
}

.sync-hero__cta {
  margin-top: 12px;
}

.sync-hero__cta ion-icon {
  font-size: 18px;
}

.sync-hero__cta ion-spinner {
  width: 18px;
  height: 18px;
  color: currentColor;
}

.sync-hero__link {
  min-height: 44px;
  padding: 0 12px;
  border: 0;
  background: transparent;
  color: var(--accent-primary);
  font: inherit;
  font-size: var(--m-font-sub);
  font-weight: 600;
  cursor: pointer;
}

.sync-decisions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.m-card.sync-decision {
  gap: 10px;
  padding: 16px 16px 6px;
}

.sync-decision__head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.sync-decision__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.sync-decision__name {
  font-size: var(--m-font-body);
  font-weight: 600;
}

.sync-decision__desc {
  color: var(--content-secondary);
  font-size: var(--m-font-sub);
  line-height: 1.5;
}

.sync-decision__merge {
  margin-top: 4px;
}

.sync-decision .m-danger:disabled,
.sync-decision__merge:disabled {
  opacity: 0.5;
}

.sync-add-link {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 44px;
  min-height: 44px;
  margin: -14px 0;
}

.m-row.sync-row-tall {
  min-height: 64px;
}

.is-disabled {
  opacity: 0.45;
}
</style>
