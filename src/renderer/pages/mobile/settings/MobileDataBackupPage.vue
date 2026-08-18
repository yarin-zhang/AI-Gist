<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :text="t('common.back')" default-href="/tabs/settings"></ion-back-button>
        </ion-buttons>
        <ion-title>{{ t('dataBackup.title') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <!-- 备份和同步是两回事，这里把两种备份的差别说清楚 -->
      <div class="explainer">
        <h2>{{ t('mobileSettings.backup.explainerTitle') }}</h2>
        <p>{{ t('mobileSettings.backup.explainerBody') }}</p>
      </div>

      <ion-list>
        <ion-list-header>
          <ion-label>{{ t('dataBackup.local') }}</ion-label>
        </ion-list-header>

        <ion-item button detail @click="go('/mobile/settings/data-backup/local')">
          <ion-icon :icon="phonePortraitOutline" slot="start"></ion-icon>
          <ion-label class="ion-text-wrap">
            <h3>{{ t('mobileSettings.backup.localTitle') }}</h3>
            <p>{{ t('mobileSettings.backup.localDescription') }}</p>
          </ion-label>
          <ion-note slot="end">{{ localBackupSummary }}</ion-note>
        </ion-item>
      </ion-list>

      <ion-list>
        <ion-list-header>
          <ion-label>{{ t('mobileSettings.backup.cloudSectionTitle') }}</ion-label>
        </ion-list-header>

        <ion-item
          v-for="config in storageConfigs"
          :key="config.id"
          button
          detail
          @click="go(`/mobile/settings/data-backup/cloud/${config.id}`)"
        >
          <ion-icon :icon="cloudOutline" slot="start"></ion-icon>
          <ion-label class="ion-text-wrap">
            <h3>{{ config.name }}</h3>
            <p>{{ t('mobileSettings.backup.cloudDescription', { name: config.name }) }}</p>
          </ion-label>
        </ion-item>

        <template v-if="storageConfigs.length === 0">
          <ion-item lines="none">
            <ion-note class="section-note">{{ t('mobileSettings.backup.noStorageHint') }}</ion-note>
          </ion-item>
          <ion-item button detail @click="go('/mobile/settings/data-sync')">
            <ion-icon :icon="addCircleOutline" slot="start" color="primary"></ion-icon>
            <ion-label color="primary">{{ t('mobileSettings.backup.goToDataSync') }}</ion-label>
          </ion-item>
        </template>
      </ion-list>

      <ion-list>
        <ion-list-header>
          <ion-label>{{ t('mobileSettings.backup.fileSectionTitle') }}</ion-label>
        </ion-list-header>

        <ion-item button :detail="false" @click="handleExport">
          <ion-icon :icon="shareOutline" slot="start"></ion-icon>
          <ion-label class="ion-text-wrap">
            <h3>{{ t('dataManagement.exportFullBackup') }}</h3>
            <p>{{ t('mobileSettings.backup.exportDescription') }}</p>
          </ion-label>
        </ion-item>

        <ion-item button :detail="false" @click="handleImport">
          <ion-icon :icon="documentAttachOutline" slot="start"></ion-icon>
          <ion-label class="ion-text-wrap">
            <h3>{{ t('dataManagement.importFullBackup') }}</h3>
            <p>{{ t('mobileSettings.backup.importDescription') }}</p>
          </ion-label>
        </ion-item>

        <ion-item lines="none">
          <ion-note class="section-note">{{ t('dataManagement.fullBackupDescription') }}</ion-note>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
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
  onIonViewWillEnter
} from '@ionic/vue'
import {
  cloudOutline,
  phonePortraitOutline,
  shareOutline,
  documentAttachOutline,
  addCircleOutline
} from 'ionicons/icons'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { useI18n } from '~/composables/useI18n'
import { CloudBackupAPI } from '~/lib/api/cloud-backup.api'
import { localBackupService } from '~/lib/services/local-backup.service'
import { databaseService } from '~/lib/db'
import { dataRestoreService } from '~/lib/services/data-restore.service'
import { createBackupPayload } from '@shared/backup-integrity'
import type { CloudStorageConfig } from '@shared/types/cloud-backup'
import { confirmAction, showToast, withLoading } from './shared'

const router = useRouter()
const { t } = useI18n()

const storageConfigs = ref<CloudStorageConfig[]>([])
const localBackupCount = ref(0)

const localBackupSummary = computed(() =>
  localBackupCount.value > 0
    ? t('mobileSettings.backup.count', { count: localBackupCount.value }, localBackupCount.value)
    : t('dataBackup.none'))

const go = (path: string) => {
  void router.push(path)
}

const createBackupId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const loadSummary = async () => {
  try {
    storageConfigs.value = await CloudBackupAPI.getStorageConfigs()
  } catch (error) {
    console.error('加载云端存储配置失败:', error)
    storageConfigs.value = []
  }

  try {
    localBackupCount.value = (await localBackupService.list()).length
  } catch (error) {
    console.error('加载本地备份列表失败:', error)
    localBackupCount.value = 0
  }
}

const handleExport = async () => {
  const confirmed = await confirmAction({
    header: t('common.warning'),
    message: t('dataManagement.exportWarning')
  })
  if (!confirmed) return

  try {
    const savedFile = await withLoading(t('common.loading'), async () => {
      // 走数据库的完整导出，保证图片等二进制元数据一并序列化。
      const result = await databaseService.exportAllDataForBackup()
      if (!result?.success || !result.data) {
        throw new Error(result?.error || result?.message || '导出数据失败')
      }

      const createdAt = new Date().toISOString()
      const backupId = createBackupId()
      const payload = createBackupPayload({
        id: backupId,
        name: `ai-gist-backup-${createdAt.split('T')[0]}-${backupId.slice(0, 8)}`,
        description: t('dataManagement.exportFullBackup'),
        createdAt,
        data: result.data,
        backupType: 'manual',
        trigger: 'manual-file-export'
      })

      return Filesystem.writeFile({
        path: `${payload.name}.json`,
        data: JSON.stringify(payload, null, 2),
        directory: Directory.Documents,
        encoding: Encoding.UTF8
      })
    })

    await Share.share({
      title: t('dataManagement.exportFullBackup'),
      text: t('settingsMessages.dataExportSuccess'),
      url: savedFile.uri,
      dialogTitle: t('dataManagement.exportFullBackup')
    })

    await showToast(t('settingsMessages.dataExportSuccess'))
  } catch (error) {
    console.error('导出完整备份失败:', error)
    await showToast(t('settingsMessages.dataExportFailed'), 'danger')
  }
}

const handleImport = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,application/json'

  input.onchange = async (event: Event) => {
    const file = (event.target as HTMLInputElement)?.files?.[0]
    if (!file) return

    let prepared
    try {
      prepared = dataRestoreService.parseFileContent(await file.text())
    } catch (error) {
      console.error('导入文件校验失败:', error)
      await showToast(
        error instanceof Error ? error.message : t('settingsMessages.dataImportFailed'),
        'danger'
      )
      return
    }

    const confirmed = await confirmAction({
      header: t('common.warning'),
      message: [
        t('dataManagement.importWarning'),
        '',
        t('dataManagement.restorePreview', {
          total: prepared.preview.total,
          prompts: prepared.preview.prompts,
          categories: prepared.preview.categories
        })
      ].join('\n'),
      destructive: true
    })
    if (confirmed) await performImport(prepared.payload)
  }

  input.click()
}

const performImport = async (payload: unknown) => {
  try {
    const result = await withLoading(t('common.loading'), () =>
      dataRestoreService.restore(payload, { source: 'local-file' }))

    if (!result?.success) {
      throw new Error(result?.error || result?.message || '导入失败')
    }

    await showToast(t('settingsMessages.dataImportSuccess'))
    await loadSummary()

    // 恢复会暂停云端同步，必须引导用户去决定合并还是覆盖云端。
    if (result.suspensions?.length) {
      const goToSync = await confirmAction({
        header: t('cloudBackup.restoreDecisionTitle'),
        message: t('cloudBackup.restoreDecisionDescription'),
        confirmText: t('dataSync.title')
      })
      if (goToSync) go('/mobile/settings/data-sync')
    }
  } catch (error) {
    console.error('导入完整备份失败:', error)
    await showToast(t('settingsMessages.dataImportFailed'), 'danger')
  }
}

onIonViewWillEnter(loadSummary)
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
</style>
