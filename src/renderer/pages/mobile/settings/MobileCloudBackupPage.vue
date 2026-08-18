<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :text="t('common.back')" default-href="/mobile/settings/data-backup"></ion-back-button>
        </ion-buttons>
        <ion-title>{{ config?.name || t('dataBackup.cloudBackup') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button :disabled="busy.refresh" @click="refresh">
            <ion-icon slot="icon-only" :icon="refreshOutline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div class="explainer">
        <p>{{ t('dataBackup.cloudLocationDescription') }}</p>
      </div>

      <ion-list>
        <ion-list-header>
          <ion-label>{{ t('cloudBackup.cloudBackupList') }}</ion-label>
        </ion-list-header>

        <ion-item button :detail="false" :disabled="busy.create" @click="createBackup">
          <ion-icon :icon="cloudUploadOutline" slot="start" color="primary"></ion-icon>
          <ion-label color="primary">{{ t('dataBackup.createCloudBackup') }}</ion-label>
          <ion-spinner v-if="busy.create" slot="end" name="crescent"></ion-spinner>
        </ion-item>

        <ion-item-sliding v-for="backup in backups" :key="backup.id">
          <ion-item>
            <ion-icon :icon="documentTextOutline" slot="start"></ion-icon>
            <ion-label class="ion-text-wrap">
              <h3>{{ backup.name }}</h3>
              <p v-if="backup.description">{{ backup.description }}</p>
              <p>{{ formatDateTime(backup.createdAt) }} · {{ formatSize(backup.size) }}</p>
            </ion-label>
          </ion-item>

          <ion-item-options side="end">
            <ion-item-option color="primary" @click="restoreBackup(backup)">
              <ion-icon slot="top" :icon="arrowUndoOutline"></ion-icon>
              {{ t('dataBackup.restore') }}
            </ion-item-option>
            <ion-item-option color="danger" @click="deleteBackup(backup)">
              <ion-icon slot="top" :icon="trashOutline"></ion-icon>
              {{ t('common.delete') }}
            </ion-item-option>
          </ion-item-options>
        </ion-item-sliding>

        <ion-item v-if="backups.length === 0 && !busy.refresh" lines="none">
          <ion-note class="section-note">{{ t('dataBackup.noCloudBackups') }}</ion-note>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
  IonSpinner,
  onIonViewWillEnter
} from '@ionic/vue'
import {
  refreshOutline,
  cloudUploadOutline,
  documentTextOutline,
  trashOutline,
  arrowUndoOutline
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { CloudBackupAPI } from '~/lib/api/cloud-backup.api'
import { cloudSyncService } from '~/lib/services/cloud-sync.service'
import type { CloudBackupInfo, CloudStorageConfig } from '@shared/types/cloud-backup'
import { confirmAction, formatDateTime, formatSize, showToast, withLoading } from './shared'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const storageId = computed(() => String(route.params.storageId || ''))
const config = ref<CloudStorageConfig | null>(null)
const backups = ref<CloudBackupInfo[]>([])
const busy = reactive({ refresh: false, create: false })

const loadConfig = async () => {
  try {
    const configs = await CloudBackupAPI.getStorageConfigs()
    config.value = configs.find(item => item.id === storageId.value) || null
    if (!config.value) {
      await showToast(t('cloudBackup.noStorageSelected'), 'danger')
      router.back()
    }
  } catch (error) {
    console.error('加载云端存储配置失败:', error)
    await showToast(t('dataBackup.loadStorageConfigsFailed'), 'danger')
  }
}

const loadBackups = async () => {
  if (!storageId.value) return
  busy.refresh = true
  try {
    backups.value = await CloudBackupAPI.getCloudBackupList(storageId.value)
  } catch (error) {
    console.error('加载云端备份列表失败:', error)
    const message = error instanceof Error ? error.message : String(error)
    // 首次使用时远端目录还不存在，这不是错误，提示用户先创建一个备份即可。
    if (message.includes('does not exist') || message.includes('404')) {
      backups.value = []
      await showToast(t('cloudBackup.backupDirectoryCreated'), 'warning')
    } else {
      backups.value = []
      await showToast(`${t('dataBackup.loadCloudBackupsFailed')}: ${message}`, 'danger')
    }
  } finally {
    busy.refresh = false
  }
}

const refresh = async () => {
  await loadConfig()
  if (config.value) await loadBackups()
}

const createBackup = async () => {
  if (!config.value || busy.create) return
  busy.create = true

  try {
    const result = await withLoading(t('cloudBackup.creatingBackup'), () =>
      CloudBackupAPI.createCloudBackup(storageId.value, {
        description: t('dataBackup.manualCloudBackupDescription', { time: new Date().toLocaleString() }),
        backupType: 'manual',
        trigger: 'manual'
      }))

    if (!result.success) {
      await showToast(result.error || t('dataBackup.createCloudBackupFailed'), 'danger')
      return
    }
    await showToast(t('dataBackup.createCloudBackupSuccess'))
    await loadBackups()
  } catch (error) {
    console.error('创建云端备份失败:', error)
    await showToast(
      error instanceof Error ? error.message : t('dataBackup.createCloudBackupFailed'),
      'danger'
    )
  } finally {
    busy.create = false
  }
}

const restoreBackup = async (backup: CloudBackupInfo) => {
  const confirmed = await confirmAction({
    header: t('dataBackup.restore'),
    message: [backup.name, '', t('dataBackup.restoreWarning')].join('\n'),
    confirmText: t('dataBackup.confirmRestore'),
    destructive: true
  })
  if (!confirmed) return

  try {
    const result = await withLoading(t('cloudBackup.restoringBackup'), () =>
      CloudBackupAPI.restoreCloudBackup(storageId.value, backup.id))

    if (!result.success) {
      await showToast(result.error || t('dataBackup.restoreFailed'), 'danger')
      return
    }

    await showToast(t('dataBackup.restoreSuccess'))
    // 恢复后云端同步会被暂停，提醒用户去决定合并还是覆盖云端。
    if (cloudSyncService.getRestoreSuspensions().length > 0) {
      const goToSync = await confirmAction({
        header: t('cloudBackup.restoreDecisionTitle'),
        message: t('cloudBackup.restoreDecisionDescription'),
        confirmText: t('dataSync.title')
      })
      if (goToSync) void router.push('/mobile/settings/data-sync')
    }
  } catch (error) {
    console.error('恢复云端备份失败:', error)
    await showToast(
      error instanceof Error ? error.message : t('dataBackup.restoreFailed'),
      'danger'
    )
  }
}

const deleteBackup = async (backup: CloudBackupInfo) => {
  const confirmed = await confirmAction({
    header: t('common.delete'),
    message: [backup.name, '', t('dataBackup.confirmDeleteCloudBackup')].join('\n'),
    confirmText: t('common.delete'),
    destructive: true
  })
  if (!confirmed) return

  try {
    const result = await CloudBackupAPI.deleteCloudBackup(storageId.value, backup.id)
    if (!result.success) {
      await showToast(result.error || t('dataBackup.deleteFailed'), 'danger')
      return
    }
    await showToast(t('dataBackup.deleteSuccess'))
    await loadBackups()
  } catch (error) {
    console.error('删除云端备份失败:', error)
    await showToast(t('dataBackup.deleteFailed'), 'danger')
  }
}

onIonViewWillEnter(refresh)
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
</style>
