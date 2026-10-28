<template>
  <ion-page>
    <MobileNavBar :title="t('dataBackup.title')" fallback="/tabs/settings" />

    <ion-content class="m-page-content">
      <div class="m-body backup-body">
        <p class="m-desc">{{ t('mobileSettings.backup.intro') }}</p>

        <section class="m-section">
          <span class="m-gt">{{ t('mobileSettings.backup.locationsTitle') }}</span>
          <div class="backup-locations">
            <button type="button" class="m-card backup-location" @click="go('/mobile/settings/data-backup/local')">
              <span class="backup-location__head">
                <span class="m-tile m-tile-lg m-tile--blue" aria-hidden="true"><ion-icon :icon="phonePortraitOutline" /></span>
                <ion-icon :icon="chevronForward" class="backup-location__chev" aria-hidden="true" />
              </span>
              <span class="backup-location__text">
                <span class="backup-location__title">{{ t('dataBackup.localLocation') }}</span>
                <span class="backup-location__sub">{{ localBackupSummary }}</span>
                <span class="backup-location__caption">{{ localLatestCaption }}</span>
              </span>
            </button>

            <button
              v-for="config in storageConfigs"
              :key="config.id"
              type="button"
              class="m-card backup-location"
              @click="go(`/mobile/settings/data-backup/cloud/${config.id}`)"
            >
              <span class="backup-location__head">
                <span class="m-tile m-tile-lg" :class="config.enabled ? 'm-tile--teal' : 'm-tile--grey'" aria-hidden="true">
                  <ion-icon :icon="cloudOutline" />
                </span>
                <ion-icon :icon="chevronForward" class="backup-location__chev" aria-hidden="true" />
              </span>
              <span class="backup-location__text">
                <span class="backup-location__title">{{ t('dataBackup.cloudLocation', { name: config.name }) }}</span>
                <span class="backup-location__sub">{{ getCloudSummary(config) }}</span>
                <span class="backup-location__caption">
                  {{ config.enabled ? t('mobileSettings.backup.manualOnly') : t('dataSync.disabled') }}
                </span>
              </span>
            </button>

            <!-- 还没有云端存储时，第二张卡片引导去数据同步页添加 -->
            <button
              v-if="storageConfigs.length === 0"
              type="button"
              class="m-card backup-location"
              @click="go('/mobile/settings/data-sync')"
            >
              <span class="backup-location__head">
                <span class="m-tile m-tile-lg m-tile--soft" aria-hidden="true"><ion-icon :icon="addOutline" /></span>
                <ion-icon :icon="chevronForward" class="backup-location__chev" aria-hidden="true" />
              </span>
              <span class="backup-location__text">
                <span class="backup-location__title">{{ t('mobileSettings.backup.cloud') }}</span>
                <span class="backup-location__sub">{{ t('mobileSettings.sync.notConfigured') }}</span>
                <span class="backup-location__caption">{{ t('mobileSettings.backup.goToDataSync') }}</span>
              </span>
            </button>
          </div>
          <p v-if="storageConfigs.length === 0" class="m-note backup-locations__note">
            {{ t('mobileSettings.backup.noStorageHint') }}
          </p>
        </section>

        <MobileGroup :title="t('mobileSettings.backup.fileSectionTitle')">
          <MobileRow :title="t('mobileSettings.backup.exportToFile')" :sub="t('mobileSettings.backup.exportDescription')"
            :icon="shareOutline" tone="violet" show-chevron @click="handleExport" />
          <MobileRow :title="t('mobileSettings.backup.importFromFile')" :sub="t('mobileSettings.backup.importDescription')"
            :icon="downloadOutline" tone="orange" show-chevron @click="handleImport" />
        </MobileGroup>

        <!-- 备份文件里的 API 密钥风险是真正需要提醒的部分 -->
        <p class="m-note">
          <ion-icon :icon="informationCircleOutline" aria-hidden="true" />
          <span>{{ t('mobileSettings.backup.fileWarning') }}</span>
        </p>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { IonPage, IonContent, IonIcon, onIonViewWillEnter } from '@ionic/vue'
import {
  addOutline,
  chevronForward,
  cloudOutline,
  downloadOutline,
  informationCircleOutline,
  phonePortraitOutline,
  shareOutline
} from 'ionicons/icons'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import MobileNavBar from '~/components/mobile/ui/MobileNavBar.vue'
import MobileGroup from '~/components/mobile/ui/MobileGroup.vue'
import MobileRow from '~/components/mobile/ui/MobileRow.vue'
import { useI18n } from '~/composables/useI18n'
import { CloudBackupAPI } from '~/lib/api/cloud-backup.api'
import { databaseService } from '~/lib/db'
import { dataRestoreService } from '~/lib/services/data-restore.service'
import { formatFriendlyDate } from '~/lib/utils/date'
import { createBackupPayload } from '@shared/backup-integrity'
import type { CloudStorageConfig } from '@shared/types/cloud-backup'
import { confirmAction, loadLocalBackupSummary, showToast, withLoading } from './shared'

const router = useRouter()
const { t, locale } = useI18n()

const storageConfigs = ref<CloudStorageConfig[]>([])
const localBackupCount = ref(0)
const localLatestAt = ref<string>()
// 云端版本数在后台读取，读不到（网络、目录未创建）时卡片只显示存储类型
const cloudBackupCounts = reactive<Record<string, number>>({})

const localBackupSummary = computed(() =>
  localBackupCount.value > 0
    ? t('mobileSettings.backup.count', { count: localBackupCount.value }, localBackupCount.value)
    : t('dataBackup.none'))

const localLatestCaption = computed(() => localLatestAt.value
  ? t('mobileSettings.backup.latestAt', { time: formatFriendlyDate(localLatestAt.value, locale.value, { withTime: true }) })
  : t('mobileSettings.backup.localDescription'))

const getCloudSummary = (config: CloudStorageConfig) => {
  const count = cloudBackupCounts[config.id]
  if (count !== undefined) return t('mobileSettings.backup.count', { count }, count)
  return config.type === 'webdav' ? 'WebDAV' : 'iCloud'
}

const go = (path: string) => {
  void router.push(path)
}

const createBackupId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const loadCloudCounts = (configs: CloudStorageConfig[]) => {
  for (const config of configs.filter(item => item.enabled)) {
    CloudBackupAPI.getCloudBackupList(config.id)
      .then(list => { cloudBackupCounts[config.id] = list.length })
      .catch(() => { delete cloudBackupCounts[config.id] })
  }
}

const loadSummary = async () => {
  try {
    storageConfigs.value = await CloudBackupAPI.getStorageConfigs()
  } catch (error) {
    console.error('加载云端存储配置失败:', error)
    storageConfigs.value = []
  }

  const local = await loadLocalBackupSummary()
  localBackupCount.value = local.count
  localLatestAt.value = local.latestAt
  loadCloudCounts(storageConfigs.value)
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
.m-body.backup-body {
  padding-top: 4px;
}

.backup-locations {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.m-card.backup-location {
  gap: 12px;
  width: 100%;
  min-width: 0;
  padding: 16px;
  border: 0;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.m-card.backup-location:active {
  background: var(--surface-secondary);
}

.backup-location__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.backup-location__chev {
  color: var(--content-tertiary);
  font-size: 14px;
}

.backup-location__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.backup-location__title {
  overflow: hidden;
  color: var(--content-primary);
  font-size: var(--m-font-body);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.backup-location__sub {
  color: var(--content-secondary);
  font-size: var(--m-font-sub);
}

.backup-location__caption {
  color: var(--content-tertiary);
  font-size: var(--m-font-caption);
}

.m-note.backup-locations__note {
  padding-top: 8px;
}
</style>
