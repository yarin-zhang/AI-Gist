<template>
  <ion-page>
    <MobileNavBar :title="t('dataBackup.cloudBackup')" fallback="/mobile/settings/data-backup" />

    <ion-content class="m-page-content">
      <ion-refresher slot="fixed" @ionRefresh="handleRefresh">
        <ion-refresher-content />
      </ion-refresher>

      <div class="m-body cloud-body">
        <p class="m-desc">{{ t('dataBackup.cloudLocationDescription') }}</p>

        <button type="button" class="m-cta" :disabled="!config || busy.create" @click="createBackup">
          <ion-spinner v-if="busy.create" name="crescent" aria-hidden="true" />
          <ion-icon v-else :icon="cloudUploadOutline" aria-hidden="true" />
          {{ t('dataBackup.createCloudBackup') }}
        </button>

        <section class="m-section">
          <span class="m-gt">{{ listTitle }}</span>
          <div class="m-group cloud-versions">
            <ion-item-sliding v-for="backup in backups" :key="backup.id" class="cloud-version">
              <ion-item lines="none" class="cloud-version__item">
                <span class="cloud-version__row">
                  <span class="m-tile m-tile--teal" aria-hidden="true"><ion-icon :icon="cloudDoneOutline" /></span>
                  <span class="cloud-version__text">
                    <span class="cloud-version__title">{{ getBackupTitle(backup) }}</span>
                    <span class="cloud-version__sub">{{ formatFriendly(backup.createdAt) }} · {{ formatSize(backup.size) }}</span>
                  </span>
                  <button type="button" class="m-chip cloud-version__restore" @click.stop="restoreBackup(backup)">
                    {{ t('dataBackup.restore') }}
                  </button>
                </span>
              </ion-item>

              <ion-item-options side="end">
                <ion-item-option color="danger" class="cloud-version__option" @click="deleteFromSwipe($event, backup)">
                  <ion-icon slot="top" :icon="trashOutline" />
                  {{ t('common.delete') }}
                </ion-item-option>
              </ion-item-options>
            </ion-item-sliding>

            <div v-if="backups.length === 0" class="m-row m-row--static cloud-versions__empty">
              <ion-spinner v-if="busy.refresh" name="crescent" />
              <span v-else class="title">{{ t('dataBackup.noCloudBackups') }}</span>
            </div>
          </div>
          <p v-if="backups.length > 0" class="m-note cloud-versions__hint">{{ t('mobileSettings.backup.cloudSwipeHint') }}</p>
        </section>

        <div class="cloud-warning" role="note">
          <ion-icon :icon="warningOutline" aria-hidden="true" />
          <span>{{ t('dataBackup.restoreWarning') }}</span>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  IonPage,
  IonContent,
  IonItem,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonIcon,
  IonSpinner,
  IonRefresher,
  IonRefresherContent,
  onIonViewWillEnter
} from '@ionic/vue'
import {
  cloudDoneOutline,
  cloudUploadOutline,
  trashOutline,
  warningOutline
} from 'ionicons/icons'
import MobileNavBar from '~/components/mobile/ui/MobileNavBar.vue'
import { useI18n } from '~/composables/useI18n'
import { CloudBackupAPI } from '~/lib/api/cloud-backup.api'
import { cloudSyncService } from '~/lib/services/cloud-sync.service'
import { formatFriendlyDate } from '~/lib/utils/date'
import { describeCloudBackupFailure } from '~/lib/utils/cloud-backup-feedback'
import type { CloudBackupInfo, CloudStorageConfig } from '@shared/types/cloud-backup'
import { confirmAction, formatSize, showToast, withLoading } from './shared'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()

const storageId = computed(() => String(route.params.storageId || ''))
const config = ref<CloudStorageConfig | null>(null)
const backups = ref<CloudBackupInfo[]>([])
const busy = reactive({ refresh: false, create: false })

const listTitle = computed(() => config.value
  ? t('mobileSettings.backup.cloudListTitle', { name: config.value.name, count: backups.value.length })
  : t('cloudBackup.cloudBackupList'))

const formatFriendly = (value: string) => formatFriendlyDate(value, locale.value, { withTime: true })

// 标题按备份类型现算，不用创建时写进文件的 description（那是创建那一刻的界面语言）
const getBackupTitle = (backup: CloudBackupInfo) => backup.backupType === 'automatic'
  ? t('mobileSettings.backup.automaticCloudBackup')
  : t('mobileSettings.backup.manualCloudBackup')

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
    const message = error instanceof Error ? error.message : String(error)
    backups.value = []
    // 首次使用时远端还没有备份目录：这不是错误，列表的空状态已经说明了，不再弹提示
    if (message.includes('does not exist') || message.includes('404')) {
      console.info('云端还没有备份目录:', message)
      return
    }
    console.error('加载云端备份列表失败:', error)
    // 只有连不上存储（密码、地址……）时才说原因，其余原因用户处理不了，只写日志
    await showToast(describeCloudBackupFailure(t('dataBackup.loadCloudBackupsFailed'), message), 'danger')
  } finally {
    busy.refresh = false
  }
}

const refresh = async () => {
  await loadConfig()
  if (config.value) await loadBackups()
}

const handleRefresh = async (event: CustomEvent) => {
  try {
    await refresh()
  } finally {
    (event.target as HTMLIonRefresherElement | null)?.complete()
  }
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
      console.warn('创建云端备份失败:', result.error || result.message)
      await showToast(describeCloudBackupFailure(t('dataBackup.createCloudBackupFailed'), result.error,
        { localFailure: result.localFailure }), 'danger')
      return
    }
    await showToast(t('dataBackup.createCloudBackupSuccess'))
    await loadBackups()
  } catch (error) {
    console.error('创建云端备份失败:', error)
    await showToast(describeCloudBackupFailure(t('dataBackup.createCloudBackupFailed'), error), 'danger')
  } finally {
    busy.create = false
  }
}

const restoreBackup = async (backup: CloudBackupInfo) => {
  const confirmed = await confirmAction({
    header: t('dataBackup.restore'),
    message: [`${getBackupTitle(backup)} · ${formatFriendly(backup.createdAt)}`, '', t('dataBackup.restoreWarning')].join('\n'),
    confirmText: t('dataBackup.confirmRestore'),
    destructive: true
  })
  if (!confirmed) return

  try {
    const result = await withLoading(t('cloudBackup.restoringBackup'), () =>
      CloudBackupAPI.restoreCloudBackup(storageId.value, backup.id))

    if (!result.success) {
      console.warn('恢复云端备份失败:', result.error || result.message)
      // 恢复在替换本机数据之前失败，或者替换本身失败后整体回滚：本机数据都没有变
      await showToast(describeCloudBackupFailure(t('dataBackup.restoreFailed'), result.error, {
        localFailure: result.localFailure,
        otherwise: t('dataBackup.restoreFailedUnchanged')
      }), 'danger')
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
    await showToast(describeCloudBackupFailure(t('dataBackup.restoreFailed'), error), 'danger')
  }
}

const deleteBackup = async (backup: CloudBackupInfo) => {
  const confirmed = await confirmAction({
    header: t('common.delete'),
    message: [`${getBackupTitle(backup)} · ${formatFriendly(backup.createdAt)}`, '', t('dataBackup.confirmDeleteCloudBackup')].join('\n'),
    confirmText: t('common.delete'),
    destructive: true
  })
  if (!confirmed) return

  try {
    const result = await CloudBackupAPI.deleteCloudBackup(storageId.value, backup.id)
    if (!result.success) {
      console.warn('删除云端备份失败:', result.error || result.message)
      await showToast(describeCloudBackupFailure(t('dataBackup.deleteFailed'), result.error), 'danger')
      return
    }
    await showToast(t('dataBackup.deleteSuccess'))
    await loadBackups()
  } catch (error) {
    console.error('删除云端备份失败:', error)
    await showToast(t('dataBackup.deleteFailed'), 'danger')
  }
}

const deleteFromSwipe = async (event: Event, backup: CloudBackupInfo) => {
  const sliding = (event.target as HTMLElement | null)?.closest('ion-item-sliding') as HTMLIonItemSlidingElement | null
  await sliding?.close()
  await deleteBackup(backup)
}

onIonViewWillEnter(refresh)
</script>

<style scoped>
.m-body.cloud-body {
  padding-top: 4px;
}

.m-cta ion-icon {
  font-size: 18px;
}

.m-cta ion-spinner {
  width: 18px;
  height: 18px;
}

.cloud-version + .cloud-version .cloud-version__row::before {
  position: absolute;
  top: 0;
  right: 0;
  left: 42px;
  height: 1px;
  background: var(--border-subtle);
  content: "";
}

.cloud-version__item {
  --background: var(--surface-primary);
  --padding-start: 16px;
  --padding-end: 0;
  --inner-padding-end: 16px;
  --min-height: 64px;
  font-size: var(--m-font-body);
}

.cloud-version__row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 64px;
}

.cloud-version__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  padding: 10px 0;
}

.cloud-version__title {
  color: var(--content-primary);
}

.cloud-version__sub {
  color: var(--content-tertiary);
  font-size: var(--m-font-caption);
}

.m-chip.cloud-version__restore {
  position: relative;
  height: 32px;
  color: var(--accent-primary);
  font-weight: 600;
}

/* 胶囊看起来 32px，点按区域扩到 44px */
.m-chip.cloud-version__restore::after {
  position: absolute;
  inset: -6px 0;
  content: "";
}

.cloud-version__option {
  width: 76px;
  font-size: var(--m-font-sub);
  font-weight: 600;
}

.cloud-version__option ion-icon {
  font-size: 18px;
}

.m-row.cloud-versions__empty {
  justify-content: center;
  color: var(--content-tertiary);
  font-size: var(--m-font-sub);
  text-align: center;
}

.m-note.cloud-versions__hint {
  padding-top: 8px;
}

.cloud-warning {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: var(--m-radius-card);
  background: var(--accent-warning-bg);
  color: var(--accent-warning);
  font-size: var(--m-font-sub);
  line-height: 1.6;
}

.cloud-warning ion-icon {
  flex: none;
  margin-top: 3px;
  font-size: 18px;
}
</style>
