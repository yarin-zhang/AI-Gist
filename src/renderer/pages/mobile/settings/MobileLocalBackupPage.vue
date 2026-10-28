<template>
  <ion-page>
    <MobileNavBar :title="t('mobileSettings.backup.localTitle')" fallback="/mobile/settings/data-backup">
      <template #end>
        <button type="button" class="m-save" :disabled="busy.create" @click="createBackupNow">
          {{ t('mobileSettings.backup.backupNow') }}
        </button>
      </template>
    </MobileNavBar>

    <ion-content class="m-page-content">
      <ion-refresher slot="fixed" @ionRefresh="handleRefresh">
        <ion-refresher-content />
      </ion-refresher>

      <div class="m-body local-body">
        <MobileGroup
          :title="t('mobileSettings.backup.automaticSectionTitle')"
          :footer="`${t('dataBackup.automaticBackupDescription')} ${t('mobileSettings.backup.localStorageNote')}`"
        >
          <MobileRow static :title="t('dataBackup.enableAutomaticBackup')" :icon="flashOutline" tone="green">
            <template #end>
              <ion-toggle
                :checked="autoBackupEnabled"
                :aria-label="t('dataBackup.enableAutomaticBackup')"
                @ionChange="handleAutoBackupToggle"
              />
            </template>
          </MobileRow>
          <MobileRow
            :class="{ 'is-disabled': !autoBackupEnabled }"
            :title="t('dataBackup.automaticBackupInterval')"
            :icon="timerOutline"
            tone="violet"
            :value="formatIntervalMinutes(autoBackupIntervalMinutes)"
            show-chevron
            :aria-disabled="!autoBackupEnabled"
            @click="pickInterval"
          />
          <MobileRow
            :title="t('dataBackup.automaticBackupRetention')"
            :icon="layersOutline"
            tone="blue"
            :value="t('mobileSettings.backup.copiesValue', { count: autoBackupRetention })"
            show-chevron
            @click="pickRetention"
          />
          <MobileRow
            static
            :title="t('mobileSettings.backup.lastBackup')"
            :icon="timeOutline"
            tone="teal"
            :value="autoBackupStatus.lastBackupAt ? formatFriendly(autoBackupStatus.lastBackupAt) : t('dataBackup.none')"
          />
          <MobileRow
            v-if="autoBackupEnabled && autoBackupStatus.nextBackupAt"
            static
            :title="t('mobileSettings.backup.nextBackup')"
            :icon="calendarOutline"
            tone="orange"
            :value="formatFriendly(autoBackupStatus.nextBackupAt)"
          />
        </MobileGroup>

        <section class="m-section">
          <span class="m-gt">{{ t('mobileSettings.backup.versionsSwipeHint') }}</span>
          <div class="m-group local-versions">
            <ion-item-sliding v-for="(backup, index) in backups" :key="backup.id" class="local-version">
              <ion-item
                lines="none"
                button
                :detail="false"
                class="local-version__item"
                @click="openBackupActions(backup)"
              >
                <span class="local-version__row">
                  <span
                    class="local-version__dot"
                    :class="{ 'local-version__dot--latest': index === 0 }"
                    aria-hidden="true"
                  />
                  <span class="local-version__text">
                    <span class="local-version__title">{{ formatFriendly(backup.createdAt) }}</span>
                    <span class="local-version__sub">{{ describeBackup(backup) }}</span>
                  </span>
                  <span class="m-pill" :class="{ 'm-pill-blue': backup.backupType !== 'automatic' }">
                    {{ backup.backupType === 'automatic'
                      ? t('mobileSettings.backup.typeAutomatic')
                      : t('mobileSettings.backup.typeManual') }}
                  </span>
                </span>
              </ion-item>

              <ion-item-options side="end">
                <ion-item-option color="primary" class="local-version__option" @click="restoreFromSwipe($event, backup)">
                  <ion-icon slot="top" :icon="arrowUndoOutline" />
                  {{ t('dataManagement.restore') }}
                </ion-item-option>
                <ion-item-option color="danger" class="local-version__option" @click="deleteFromSwipe($event, backup)">
                  <ion-icon slot="top" :icon="trashOutline" />
                  {{ t('common.delete') }}
                </ion-item-option>
              </ion-item-options>
            </ion-item-sliding>

            <div v-if="backups.length === 0" class="m-row m-row--static local-versions__empty">
              <ion-spinner v-if="busy.refresh" name="crescent" />
              <span v-else class="title">{{ t('dataManagement.noBackups') }}</span>
            </div>
          </div>
        </section>

        <p class="m-note">
          <ion-icon :icon="informationCircleOutline" aria-hidden="true" />
          <span>{{ t('mobileSettings.backup.restoreLocalWarning') }}</span>
        </p>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  IonPage,
  IonContent,
  IonItem,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonIcon,
  IonToggle,
  IonSpinner,
  IonRefresher,
  IonRefresherContent,
  actionSheetController,
  onIonViewWillEnter
} from '@ionic/vue'
import {
  arrowUndoOutline,
  calendarOutline,
  flashOutline,
  informationCircleOutline,
  layersOutline,
  timeOutline,
  timerOutline,
  trashOutline
} from 'ionicons/icons'
import MobileNavBar from '~/components/mobile/ui/MobileNavBar.vue'
import MobileGroup from '~/components/mobile/ui/MobileGroup.vue'
import MobileRow from '~/components/mobile/ui/MobileRow.vue'
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
import { cloudSyncService } from '~/lib/services/cloud-sync.service'
import { formatFriendlyDate } from '~/lib/utils/date'
import {
  confirmAction,
  formatIntervalMinutes,
  formatSize,
  pickOption,
  showToast,
  withLoading
} from './shared'

const router = useRouter()
const { t, locale } = useI18n()

const backups = ref<LocalBackupInfo[]>([])
const autoBackupEnabled = ref(true)
const autoBackupIntervalMinutes = ref(DEFAULT_AUTO_BACKUP_INTERVAL_MINUTES)
const autoBackupRetention = ref(DEFAULT_AUTO_BACKUP_RETENTION)
const autoBackupStatus = ref<AutomaticBackupStatus>(automaticBackupService.getStatus())
const busy = reactive({ refresh: false, create: false })
let unsubscribeStatus: (() => void) | null = null
let latestBackupLoad = 0

const RETENTION_PRESETS = [5, 10, 20, 30, 50, 100]

// 已保存的值可能来自桌面端的自定义间隔，补进选项里才不会被选择列表吞掉。
const withCurrentValue = (presets: readonly number[], current: number) =>
  (presets.includes(current) ? [...presets] : [...presets, current]).sort((a, b) => a - b)

const intervalOptions = computed(() =>
  withCurrentValue(AUTOMATIC_BACKUP_INTERVAL_PRESETS, autoBackupIntervalMinutes.value)
    .map(value => ({ value, label: formatIntervalMinutes(value) })))

const retentionOptions = computed(() =>
  withCurrentValue(RETENTION_PRESETS, autoBackupRetention.value)
    .map(value => ({ value, label: t('mobileSettings.backup.retentionCount', { count: value }) })))

const formatFriendly = (value: string) => formatFriendlyDate(value, locale.value, { withTime: true })

// 版本的副标题：提示词数量（备份内容可读时）+ 文件大小
const describeBackup = (backup: LocalBackupInfo) => {
  const prompts = (backup.payload as { data?: { prompts?: unknown } } | undefined)?.data?.prompts
  const size = formatSize(backup.size)
  return Array.isArray(prompts)
    ? `${t('mobileSettings.backup.promptCount', { count: prompts.length })} · ${size}`
    : size
}

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
  const requestId = ++latestBackupLoad
  busy.refresh = true
  try {
    const nextBackups = await localBackupService.list()
    // 页面重新进入或创建备份后可能同时触发多次读取。只接受最后一次
    // 请求的结果，避免较早的慢请求把刚创建的记录覆盖掉。
    if (requestId === latestBackupLoad) backups.value = nextBackups
  } catch (error) {
    console.error('加载本地备份列表失败:', error)
    if (requestId === latestBackupLoad) {
      await showToast(t('mobileSettings.backup.loadFailed'), 'danger')
    }
  } finally {
    if (requestId === latestBackupLoad) busy.refresh = false
  }
}

const refresh = async () => {
  await Promise.all([loadSettings(), loadBackups()])
}

const handleRefresh = async (event: CustomEvent) => {
  try {
    await refresh()
  } finally {
    (event.target as HTMLIonRefresherElement | null)?.complete()
  }
}

const handleAutoBackupToggle = async (event: CustomEvent<{ checked: boolean }>) => {
  autoBackupEnabled.value = await automaticBackupService.setEnabled(event.detail.checked)
  await showToast(t(autoBackupEnabled.value
    ? 'dataBackup.automaticBackupEnabled'
    : 'dataBackup.automaticBackupDisabled'))
}

const pickInterval = async () => {
  if (!autoBackupEnabled.value) return
  const value = await pickOption({
    header: t('dataBackup.automaticBackupInterval'),
    current: autoBackupIntervalMinutes.value,
    items: intervalOptions.value
  })
  if (value === undefined || value === autoBackupIntervalMinutes.value) return

  try {
    autoBackupIntervalMinutes.value = await automaticBackupService.setIntervalMinutes(value)
    await showToast(t('dataBackup.automaticBackupSettingsSaved'))
  } catch (error) {
    console.error('保存本地备份间隔失败:', error)
    await showToast(t('dataBackup.automaticBackupSettingsSaveFailed'), 'danger')
  }
}

const pickRetention = async () => {
  const value = await pickOption({
    header: t('dataBackup.automaticBackupRetention'),
    current: autoBackupRetention.value,
    items: retentionOptions.value
  })
  if (value === undefined || value === autoBackupRetention.value) return

  try {
    const result = await automaticBackupService.setRetention(value)
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
    message: [formatFriendly(backup.createdAt), '', t('mobileSettings.backup.restoreLocalWarning')].join('\n'),
    confirmText: t('dataBackup.confirmRestore'),
    destructive: true
  })
  if (!confirmed) return

  try {
    await withLoading(t('common.loading'), () => localBackupService.restore(backup.id))
    await showToast(t('mobileSettings.backup.restoreSuccess'))
    await loadBackups()

    // 恢复会暂停云端同步，引导用户去决定合并还是覆盖云端（与文件导入、云端恢复一致）。
    if (cloudSyncService.getRestoreSuspensions().length > 0) {
      const goToSync = await confirmAction({
        header: t('cloudBackup.restoreDecisionTitle'),
        message: t('cloudBackup.restoreDecisionDescription'),
        confirmText: t('dataSync.title')
      })
      if (goToSync) void router.push('/mobile/settings/data-sync')
    }
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
    message: [formatFriendly(backup.createdAt), '', t('dataManagement.confirmDeleteBackup')].join('\n'),
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

// 左滑出现的按钮点完先把行收回去，再弹确认框
const closeSliding = async (event: Event) => {
  const sliding = (event.target as HTMLElement | null)?.closest('ion-item-sliding') as HTMLIonItemSlidingElement | null
  await sliding?.close()
}

const restoreFromSwipe = async (event: Event, backup: LocalBackupInfo) => {
  await closeSliding(event)
  await restoreBackup(backup)
}

const deleteFromSwipe = async (event: Event, backup: LocalBackupInfo) => {
  await closeSliding(event)
  await deleteBackup(backup)
}

// 点按版本也能恢复或删除：左滑不容易被发现，读屏用户也无法左滑
const openBackupActions = async (backup: LocalBackupInfo) => {
  let action: 'restore' | 'delete' | undefined
  const sheet = await actionSheetController.create({
    header: formatFriendly(backup.createdAt),
    subHeader: describeBackup(backup),
    buttons: [
      { text: t('dataManagement.restore'), handler: () => { action = 'restore' } },
      { text: t('common.delete'), role: 'destructive', handler: () => { action = 'delete' } },
      { text: t('common.cancel'), role: 'cancel' }
    ]
  })
  await sheet.present()
  await sheet.onDidDismiss()
  if (action === 'restore') await restoreBackup(backup)
  else if (action === 'delete') await deleteBackup(backup)
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
.m-body.local-body {
  gap: 18px;
}

.local-version {
  position: relative;
}

/* 行与行之间的分隔线（ion-item-sliding 包了一层，不能用 .m-row + .m-row） */
.local-version + .local-version .local-version__row::before {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  height: 1px;
  background: var(--border-subtle);
  content: "";
}

.local-version__item {
  --background: var(--surface-primary);
  --background-activated: var(--surface-secondary);
  --background-activated-opacity: 1;
  --padding-start: 16px;
  --padding-end: 0;
  --inner-padding-end: 16px;
  --min-height: 60px;
  font-size: var(--m-font-body);
}

.local-version__row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 60px;
}

.local-version__dot {
  flex: none;
  width: 10px;
  height: 10px;
  margin: 0 4px;
  border-radius: 5px;
  background: var(--border-strong);
}

.local-version__dot--latest {
  background: var(--accent-brand);
}

.local-version__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  padding: 10px 0;
}

.local-version__title {
  color: var(--content-primary);
}

.local-version__sub {
  color: var(--content-tertiary);
  font-size: var(--m-font-caption);
}

.local-version__option {
  width: 76px;
  font-size: var(--m-font-sub);
  font-weight: 600;
}

.local-version__option ion-icon {
  font-size: 18px;
}

.m-row.local-versions__empty {
  justify-content: center;
  color: var(--content-tertiary);
  font-size: var(--m-font-sub);
  text-align: center;
}

.is-disabled {
  opacity: 0.45;
}
</style>
