<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :text="t('common.back')" default-href="/mobile/settings/data-backup"></ion-back-button>
        </ion-buttons>
        <ion-title>{{ t('mobileSettings.backup.localTitle') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button :disabled="busy.refresh" @click="refresh">
            <ion-icon slot="icon-only" :icon="refreshOutline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-list>
        <ion-list-header>
          <ion-label>{{ t('mobileSettings.backup.automaticSectionTitle') }}</ion-label>
        </ion-list-header>

        <ion-item>
          <ion-toggle :checked="autoBackupEnabled" @ionChange="handleAutoBackupToggle">
            {{ t('dataBackup.enableAutomaticBackup') }}
          </ion-toggle>
        </ion-item>

        <ion-item>
          <ion-select
            :label="t('dataBackup.automaticBackupInterval')"
            :value="autoBackupIntervalMinutes"
            interface="action-sheet"
            :disabled="!autoBackupEnabled"
            @ionChange="handleIntervalChange"
          >
            <ion-select-option v-for="option in intervalOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </ion-select-option>
          </ion-select>
        </ion-item>

        <ion-item>
          <ion-select
            :label="t('dataBackup.automaticBackupRetention')"
            :value="autoBackupRetention"
            interface="action-sheet"
            @ionChange="handleRetentionChange"
          >
            <ion-select-option v-for="value in retentionOptions" :key="value" :value="value">
              {{ t('mobileSettings.backup.retentionCount', { count: value }) }}
            </ion-select-option>
          </ion-select>
        </ion-item>

        <ion-item lines="none">
          <ion-note class="section-note">
            {{ t('dataBackup.automaticBackupDescription') }}
            {{ t('mobileSettings.backup.localStorageNote') }}
          </ion-note>
        </ion-item>

        <ion-item lines="none">
          <ion-note class="section-note">
            {{ t('dataBackup.lastAutomaticBackup', {
              time: autoBackupStatus.lastBackupAt ? formatDateTime(autoBackupStatus.lastBackupAt) : t('dataBackup.none')
            }) }}
            <template v-if="autoBackupStatus.nextBackupAt">
              · {{ t('dataBackup.nextAutomaticBackup', { time: formatDateTime(autoBackupStatus.nextBackupAt) }) }}
            </template>
          </ion-note>
        </ion-item>
      </ion-list>

      <ion-list>
        <ion-list-header>
          <ion-label>{{ t('mobileSettings.backup.versionsSectionTitle') }}</ion-label>
        </ion-list-header>

        <ion-item button :detail="false" :disabled="busy.create" @click="createBackupNow">
          <ion-icon :icon="addCircleOutline" slot="start" color="primary"></ion-icon>
          <ion-label color="primary">{{ t('mobileSettings.backup.createManualBackup') }}</ion-label>
          <ion-spinner v-if="busy.create" slot="end" name="crescent"></ion-spinner>
        </ion-item>

        <ion-item-sliding v-for="backup in backups" :key="backup.id">
          <ion-item>
            <ion-icon :icon="documentTextOutline" slot="start"></ion-icon>
            <ion-label class="ion-text-wrap">
              <h3>{{ backup.name }}</h3>
              <p>{{ formatDateTime(backup.createdAt) }} · {{ formatSize(backup.size) }}</p>
            </ion-label>
            <ion-badge :color="backup.backupType === 'automatic' ? 'medium' : 'primary'" slot="end">
              {{ backup.backupType === 'automatic'
                ? t('mobileSettings.backup.typeAutomatic')
                : t('mobileSettings.backup.typeManual') }}
            </ion-badge>
          </ion-item>

          <ion-item-options side="end">
            <ion-item-option color="primary" @click="restoreBackup(backup)">
              <ion-icon slot="top" :icon="arrowUndoOutline"></ion-icon>
              {{ t('dataManagement.restore') }}
            </ion-item-option>
            <ion-item-option color="danger" @click="deleteBackup(backup)">
              <ion-icon slot="top" :icon="trashOutline"></ion-icon>
              {{ t('common.delete') }}
            </ion-item-option>
          </ion-item-options>
        </ion-item-sliding>

        <ion-item v-if="backups.length === 0 && !busy.refresh" lines="none">
          <ion-note class="section-note">{{ t('dataManagement.noBackups') }}</ion-note>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
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
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonLabel,
  IonIcon,
  IonNote,
  IonBadge,
  IonToggle,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  onIonViewWillEnter
} from '@ionic/vue'
import {
  refreshOutline,
  addCircleOutline,
  documentTextOutline,
  trashOutline,
  arrowUndoOutline
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import {
  localBackupService,
  type LocalBackupInfo
} from '~/lib/services/local-backup.service'
import {
  automaticBackupService,
  AUTOMATIC_BACKUP_INTERVAL_PRESETS,
  DEFAULT_AUTO_BACKUP_INTERVAL_MINUTES,
  DEFAULT_AUTO_BACKUP_RETENTION,
  type AutomaticBackupStatus
} from '~/lib/services/automatic-backup.service'
import { confirmAction, formatDateTime, formatSize, showToast, withLoading } from './shared'

const { t } = useI18n()

const backups = ref<LocalBackupInfo[]>([])
const autoBackupEnabled = ref(true)
const autoBackupIntervalMinutes = ref(DEFAULT_AUTO_BACKUP_INTERVAL_MINUTES)
const autoBackupRetention = ref(DEFAULT_AUTO_BACKUP_RETENTION)
const autoBackupStatus = ref<AutomaticBackupStatus>(automaticBackupService.getStatus())
const busy = reactive({ refresh: false, create: false })
let unsubscribeStatus: (() => void) | null = null

const RETENTION_PRESETS = [5, 10, 20, 30, 50, 100]

const formatInterval = (minutes: number) => {
  if (minutes < 60) return t('dataBackup.backupEveryMinutes', { count: minutes })
  if (minutes < 1440) return t('dataBackup.backupEveryHours', { count: minutes / 60 })
  if (minutes === 1440) return t('dataBackup.backupEveryDay')
  return t('dataBackup.backupEveryDays', { count: minutes / 1440 })
}

// 已保存的值可能来自桌面端的自定义间隔，补进选项里才不会被下拉框吞掉。
const withCurrentValue = (presets: readonly number[], current: number) =>
  (presets.includes(current) ? [...presets] : [...presets, current]).sort((a, b) => a - b)

const intervalOptions = computed(() =>
  withCurrentValue(AUTOMATIC_BACKUP_INTERVAL_PRESETS, autoBackupIntervalMinutes.value)
    .map(value => ({ value, label: formatInterval(value) })))

const retentionOptions = computed(() =>
  withCurrentValue(RETENTION_PRESETS, autoBackupRetention.value))

const loadSettings = async () => {
  const [enabled, intervalMinutes, retention] = await Promise.all([
    automaticBackupService.getEnabled(),
    automaticBackupService.getIntervalMinutes(),
    automaticBackupService.getRetention()
  ])
  autoBackupEnabled.value = enabled
  autoBackupIntervalMinutes.value = intervalMinutes
  autoBackupRetention.value = retention
}

const loadBackups = async () => {
  busy.refresh = true
  try {
    backups.value = await localBackupService.list()
  } catch (error) {
    console.error('加载本地备份列表失败:', error)
    await showToast(t('mobileSettings.backup.loadFailed'), 'danger')
  } finally {
    busy.refresh = false
  }
}

const refresh = async () => {
  await Promise.all([loadSettings(), loadBackups()])
}

const handleAutoBackupToggle = async (event: CustomEvent<{ checked: boolean }>) => {
  autoBackupEnabled.value = await automaticBackupService.setEnabled(event.detail.checked)
  await showToast(t(autoBackupEnabled.value
    ? 'dataBackup.automaticBackupEnabled'
    : 'dataBackup.automaticBackupDisabled'))
}

const handleIntervalChange = async (event: CustomEvent<{ value: number }>) => {
  try {
    autoBackupIntervalMinutes.value = await automaticBackupService.setIntervalMinutes(event.detail.value)
    await showToast(t('dataBackup.automaticBackupSettingsSaved'))
  } catch (error) {
    console.error('保存本地备份间隔失败:', error)
    await showToast(t('dataBackup.automaticBackupSettingsSaveFailed'), 'danger')
  }
}

const handleRetentionChange = async (event: CustomEvent<{ value: number }>) => {
  try {
    const result = await automaticBackupService.setRetention(event.detail.value)
    autoBackupRetention.value = result.retention
    if (result.warnings.length > 0) {
      await showToast(
        t('dataBackup.automaticBackupRetentionWarning', { error: result.warnings.join('; ') }),
        'warning'
      )
    } else {
      await showToast(t('dataBackup.automaticBackupRetentionApplied', { count: result.deletedCount }))
    }
    await loadBackups()
  } catch (error) {
    console.error('保存本地备份保留份数失败:', error)
    await showToast(t('dataBackup.automaticBackupSettingsSaveFailed'), 'danger')
  }
}

const createBackupNow = async () => {
  if (busy.create) return
  busy.create = true
  try {
    const result = await localBackupService.create({
      description: t('mobileSettings.backup.manualBackupDescription', { time: new Date().toLocaleString() }),
      backupType: 'manual',
      trigger: 'manual'
    })
    await loadBackups()
    await showToast(t(result.action === 'unchanged'
      ? 'mobileSettings.backup.createUnchanged'
      : 'mobileSettings.backup.createSuccess'))
  } catch (error) {
    console.error('创建本地备份失败:', error)
    await showToast(t('mobileSettings.backup.createFailed'), 'danger')
  } finally {
    busy.create = false
  }
}

const restoreBackup = async (backup: LocalBackupInfo) => {
  const confirmed = await confirmAction({
    header: t('dataManagement.restore'),
    message: [backup.name, '', t('mobileSettings.backup.restoreLocalWarning')].join('\n'),
    confirmText: t('dataBackup.confirmRestore'),
    destructive: true
  })
  if (!confirmed) return

  try {
    await withLoading(t('common.loading'), () => localBackupService.restore(backup.id))
    await showToast(t('mobileSettings.backup.restoreSuccess'))
    await loadBackups()
  } catch (error) {
    console.error('恢复本地备份失败:', error)
    await showToast(
      error instanceof Error ? error.message : t('mobileSettings.backup.restoreFailed'),
      'danger'
    )
  }
}

const deleteBackup = async (backup: LocalBackupInfo) => {
  const confirmed = await confirmAction({
    header: t('common.delete'),
    message: [backup.name, '', t('dataManagement.confirmDeleteBackup')].join('\n'),
    confirmText: t('common.delete'),
    destructive: true
  })
  if (!confirmed) return

  try {
    await localBackupService.delete(backup.id)
    await showToast(t('mobileSettings.backup.deleteSuccess'))
    await loadBackups()
  } catch (error) {
    console.error('删除本地备份失败:', error)
    await showToast(t('mobileSettings.backup.deleteFailed'), 'danger')
  }
}

onMounted(() => {
  unsubscribeStatus = automaticBackupService.onStatusChange(status => {
    autoBackupStatus.value = status
  })
})

onIonViewWillEnter(refresh)

onUnmounted(() => unsubscribeStatus?.())
</script>

<style scoped>
ion-list-header {
  font-weight: 600;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Ionic 默认给 slot="start" 的图标留了 32px，设置列表里显得过空 */
ion-item ion-icon[slot='start'] {
  margin-inline-end: 16px;
}

.section-note {
  padding: 4px 0 8px;
  font-size: 12px;
  line-height: 1.5;
  white-space: normal;
}
</style>
