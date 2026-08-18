<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :text="t('common.back')" default-href="/tabs/settings"></ion-back-button>
        </ion-buttons>
        <ion-title>{{ t('dataSync.title') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <!-- 先解释「同步」和「备份」的区别，避免用户误以为同步会保留历史版本 -->
      <div class="explainer">
        <h2>{{ t('mobileSettings.sync.explainerTitle') }}</h2>
        <p>{{ t('mobileSettings.sync.explainerBody') }}</p>
      </div>

      <ion-list>
        <ion-list-header>
          <ion-label>{{ t('cloudBackup.syncStatus') }}</ion-label>
        </ion-list-header>

        <ion-item :button="Boolean(syncStatus.error)" :detail="false" @click="handleStatusClick">
          <ion-icon :icon="statusIcon" :color="statusColor" slot="start"></ion-icon>
          <ion-label class="ion-text-wrap">
            <h3>{{ statusLabel }}</h3>
            <p v-if="syncStatus.lastSyncAt">
              {{ t('dataSync.lastSyncAt', { time: formatDateTime(syncStatus.lastSyncAt) }) }}
            </p>
            <p v-if="syncStatus.pendingChanges">{{ t('dataSync.pendingChanges') }}</p>
            <p v-if="syncStatus.error" class="status-error">{{ syncStatus.error }}</p>
          </ion-label>
          <ion-note v-if="syncStatus.error" slot="end">{{ t('dataSync.viewErrorDetails') }}</ion-note>
        </ion-item>
      </ion-list>

      <!-- 本地恢复后云端同步会暂停，必须由用户决定合并还是覆盖 -->
      <ion-list v-if="restoreSuspensions.length > 0">
        <ion-list-header>
          <ion-label>{{ t('cloudBackup.restoreDecisionTitle') }}</ion-label>
        </ion-list-header>

        <template v-for="suspension in restoreSuspensions" :key="suspension.storageId">
          <ion-item lines="none" class="suspension-item">
            <ion-label class="ion-text-wrap">
              <h3>{{ getStorageName(suspension.storageId) }}</h3>
              <p>{{ t('cloudBackup.restoreDecisionDescription') }}</p>
            </ion-label>
          </ion-item>
          <div class="stacked-actions">
            <ion-button
              expand="block"
              fill="outline"
              :disabled="busy.restoreDecision"
              @click="resolveRestoreDecision(suspension.storageId, 'merge')"
            >
              {{ t('cloudBackup.mergeWithCloud') }}
            </ion-button>
            <ion-button
              expand="block"
              fill="outline"
              color="danger"
              :disabled="busy.restoreDecision"
              @click="confirmRestoreOverwrite(suspension.storageId)"
            >
              {{ t('cloudBackup.overwriteCloud') }}
            </ion-button>
          </div>
        </template>
      </ion-list>

      <ion-list>
        <ion-list-header>
          <ion-label>{{ t('dataSync.storageConfiguration') }}</ion-label>
        </ion-list-header>

        <ion-item
          v-for="config in storageConfigs"
          :key="config.id"
          button
          detail
          @click="openStorage(config.id)"
        >
          <ion-icon :icon="serverOutline" slot="start"></ion-icon>
          <ion-label class="ion-text-wrap">
            <h3>{{ config.name }}</h3>
            <p>{{ getConfigDescription(config) }}</p>
          </ion-label>
          <ion-badge :color="config.enabled ? 'success' : 'medium'" slot="end">
            {{ config.enabled ? t('dataSync.enabled') : t('dataSync.disabled') }}
          </ion-badge>
        </ion-item>

        <ion-item v-if="storageConfigs.length === 0" lines="none">
          <ion-note class="section-note">{{ t('dataSync.noStorageConfig') }}</ion-note>
        </ion-item>

        <ion-item button detail @click="openStorage('new')">
          <ion-icon :icon="addCircleOutline" slot="start" color="primary"></ion-icon>
          <ion-label color="primary">{{ t('mobileSettings.sync.addStorage') }}</ion-label>
        </ion-item>

        <ion-item lines="none">
          <ion-note class="section-note">{{ t('mobileSettings.sync.storageSectionDescription') }}</ion-note>
        </ion-item>
      </ion-list>

      <ion-list>
        <ion-list-header>
          <ion-label>{{ t('mobileSettings.sync.autoSyncSection') }}</ion-label>
        </ion-list-header>

        <ion-item>
          <ion-toggle :checked="autoSyncEnabled" @ionChange="handleAutoSyncToggle">
            {{ t('dataSync.enableAutoSync') }}
          </ion-toggle>
        </ion-item>

        <ion-item>
          <ion-select
            :label="t('dataSync.syncInterval')"
            :value="syncIntervalMinutes"
            interface="action-sheet"
            :disabled="!autoSyncEnabled"
            @ionChange="handleSyncIntervalChange"
          >
            <ion-select-option v-for="option in intervalOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </ion-select-option>
          </ion-select>
        </ion-item>

        <ion-item lines="none">
          <ion-note class="section-note">{{ t('dataSync.autoSyncDescription') }}</ion-note>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Capacitor } from '@capacitor/core'
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonList,
  IonListHeader,
  IonItem,
  IonLabel,
  IonIcon,
  IonNote,
  IonBadge,
  IonButton,
  IonToggle,
  IonSelect,
  IonSelectOption,
  onIonViewWillEnter
} from '@ionic/vue'
import {
  serverOutline,
  addCircleOutline,
  checkmarkCircleOutline,
  syncCircleOutline,
  alertCircleOutline,
  pauseCircleOutline,
  timeOutline
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { CloudBackupAPI } from '~/lib/api/cloud-backup.api'
import {
  cloudSyncService,
  MAX_CLOUD_SYNC_INTERVAL_MINUTES,
  MIN_CLOUD_SYNC_INTERVAL_MINUTES,
  type CloudSyncRestoreSuspension,
  type CloudSyncStatus
} from '~/lib/services/cloud-sync.service'
import type { CloudStorageConfig } from '@shared/types/cloud-backup'
import {
  confirmAction,
  formatDateTime,
  getDeviceLabel,
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
const busy = reactive({ restoreDecision: false })
let unsubscribeSyncStatus: (() => void) | null = null

// 移动端用固定档位代替自由输入的分钟数，省掉一个额外的「保存」按钮。
const INTERVAL_PRESETS = [5, 10, 15, 30, 60, 120, 360, 720, 1440]
  .filter(minutes => minutes >= MIN_CLOUD_SYNC_INTERVAL_MINUTES && minutes <= MAX_CLOUD_SYNC_INTERVAL_MINUTES)

const formatInterval = (minutes: number) => {
  if (minutes < 60) return t('dataBackup.backupEveryMinutes', { count: minutes })
  if (minutes < 1440) return t('dataBackup.backupEveryHours', { count: minutes / 60 })
  if (minutes === 1440) return t('dataBackup.backupEveryDay')
  return t('dataBackup.backupEveryDays', { count: minutes / 1440 })
}

const intervalOptions = computed(() => {
  const values = INTERVAL_PRESETS.includes(syncIntervalMinutes.value)
    ? INTERVAL_PRESETS
    : [...INTERVAL_PRESETS, syncIntervalMinutes.value].sort((a, b) => a - b)
  return values.map(value => ({ value, label: formatInterval(value) }))
})

const isPaused = computed(() => restoreSuspensions.value.length > 0)

const statusLabel = computed(() => {
  if (storageConfigs.value.length === 0) return t('dataSync.statusNotConfigured')
  if (isPaused.value) return t('cloudBackup.syncStatusValues.paused')
  return t(`cloudBackup.syncStatusValues.${syncStatus.value.status}`)
})

const statusColor = computed(() => {
  if (storageConfigs.value.length === 0) return 'medium'
  if (isPaused.value || syncStatus.value.status === 'error') return 'warning'
  if (syncStatus.value.status === 'success') return 'success'
  if (syncStatus.value.status === 'syncing' || syncStatus.value.status === 'scheduled') return 'primary'
  return 'medium'
})

const statusIcon = computed(() => {
  if (isPaused.value) return pauseCircleOutline
  if (syncStatus.value.status === 'error') return alertCircleOutline
  if (syncStatus.value.status === 'success') return checkmarkCircleOutline
  if (syncStatus.value.status === 'syncing') return syncCircleOutline
  return timeOutline
})

const getStorageName = (storageId: string) =>
  storageConfigs.value.find(config => config.id === storageId)?.name || storageId

const getConfigDescription = (config: CloudStorageConfig) =>
  config.type === 'webdav' ? (config as any).url : t('cloudBackup.mobileICloudUnsupported')

const openStorage = (id: string) => {
  void router.push(`/mobile/settings/data-sync/storage/${id}`)
}

const handleStatusClick = () => {
  if (!syncStatus.value.error) return
  void presentSyncErrorDetails(syncStatus.value.error, {
    storageId: storageConfigs.value.find(config => config.enabled)?.id
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

const handleSyncIntervalChange = async (event: CustomEvent<{ value: number }>) => {
  try {
    syncIntervalMinutes.value = await cloudSyncService.setAutoSyncIntervalMinutes(event.detail.value)
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
  })
})

onIonViewWillEnter(async () => {
  await Promise.all([loadStorageConfigs(), loadAutoSyncSettings()])
  restoreSuspensions.value = cloudSyncService.getRestoreSuspensions()
})

onUnmounted(() => unsubscribeSyncStatus?.())
</script>

<style scoped>
/* ion-list-header 与字号阶梯的统一样式见 assets/styles/mobile.css */

/* Ionic 默认给 slot="start" 的图标留了 32px，设置列表里显得过空 */
ion-item ion-icon[slot='start'] {
  margin-inline-end: 16px;
}

.explainer {
  padding: 16px 16px 4px;
}

.explainer h2 {
  margin: 0 0 6px;
  font-size: var(--mobile-font-size-body);
  font-weight: 600;
  color: var(--content-primary);
}

.explainer p {
  margin: 0;
  font-size: var(--mobile-font-size-footnote);
  line-height: var(--mobile-line-height-relaxed);
  color: var(--ion-color-medium);
}

.section-note {
  padding: 4px 0 8px;
  font-size: var(--mobile-font-size-footnote);
  line-height: var(--mobile-line-height-normal);
  white-space: normal;
}

.status-error {
  color: var(--ion-color-danger);
}

.suspension-item {
  --background: color-mix(in srgb, var(--accent-warning) 10%, var(--surface-primary));
}

.stacked-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 16px 12px;
}
</style>
