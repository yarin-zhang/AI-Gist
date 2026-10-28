<template>
  <ion-page>
    <ion-content class="m-page-content" :fullscreen="true">
      <MobileLargeTitle :title="t('mainPage.menu.settings')" />

      <!-- 设置首页只做导航：同步状态卡和每一行都进入独立的二级页面 -->
      <div class="m-body m-body--tabbed settings-home">
        <div class="m-card settings-sync-card">
          <button type="button" class="settings-sync-card__main" @click="go(ROUTES.dataSync)">
            <span class="m-tile m-tile-lg" :class="`m-tile--${syncView.tileTone}`" aria-hidden="true">
              <ion-icon :icon="syncView.icon" />
            </span>
            <span class="settings-sync-card__text">
              <span class="settings-sync-card__title">{{ syncView.title }}</span>
              <span class="settings-sync-card__sub">{{ syncCardSubtitle }}</span>
            </span>
            <span v-if="syncView.kind !== 'conflict'" class="m-btn-c m-btn-c--plain settings-sync-card__go" aria-hidden="true">
              <ion-icon :icon="syncOutline" />
            </span>
          </button>
          <!-- 有冲突待处理时，卡片右侧直接给出处理入口 -->
          <button v-if="syncView.kind === 'conflict'" type="button" class="settings-sync-card__action" @click="openConflictSheet">
            {{ t('mobileSettings.sync.resolveConflicts') }}
          </button>
        </div>

        <MobileGroup :title="t('mobileSettings.groups.data')">
          <MobileRow :title="t('dataSync.title')" :icon="syncOutline" tone="blue" :value="storageSummary"
            show-chevron @click="go(ROUTES.dataSync)" />
          <MobileRow :title="t('dataBackup.title')" :icon="archiveOutline" tone="green" :value="backupSummary"
            show-chevron @click="go(ROUTES.dataBackup)" />
        </MobileGroup>

        <MobileGroup :title="t('mobileSettings.groups.preferences')">
          <MobileRow :title="t('settings.sections.general')" :icon="optionsOutline" tone="violet" :value="generalSummary"
            show-chevron @click="go(ROUTES.general)" />
        </MobileGroup>

        <MobileGroup :title="t('mobileSettings.groups.other')">
          <MobileRow :title="t('mobileSettings.entries.about')" :icon="informationCircleOutline" tone="grey" :value="appVersion"
            show-chevron @click="go(ROUTES.about)" />
        </MobileGroup>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { IonPage, IonContent, IonIcon, onIonViewWillEnter } from '@ionic/vue'
import {
  syncOutline,
  archiveOutline,
  optionsOutline,
  informationCircleOutline
} from 'ionicons/icons'
import MobileLargeTitle from '~/components/mobile/ui/MobileLargeTitle.vue'
import MobileGroup from '~/components/mobile/ui/MobileGroup.vue'
import MobileRow from '~/components/mobile/ui/MobileRow.vue'
import { useI18n } from '~/composables/useI18n'
import { useTheme } from '~/composables/useTheme'
import { CloudBackupAPI } from '~/lib/api/cloud-backup.api'
import { cloudSyncService, type CloudSyncStatus } from '~/lib/services/cloud-sync.service'
import { formatFriendlyDate } from '~/lib/utils/date'
import type { CloudStorageConfig } from '@shared/types/cloud-backup'
import { describeSyncStatus, formatRelative, loadLocalBackupSummary, requestConflictSheet } from './settings/shared'

const ROUTES = {
  dataSync: '/mobile/settings/data-sync',
  dataBackup: '/mobile/settings/data-backup',
  general: '/mobile/settings/general',
  about: '/mobile/about'
} as const

const router = useRouter()
const { t, locale, supportedLocales } = useI18n()
const { themeSource } = useTheme()

const appVersion = ref(typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '')
const storageConfigs = ref<CloudStorageConfig[]>([])
const autoSyncEnabled = ref(true)
const latestLocalBackupAt = ref<string>()
const syncStatus = ref<CloudSyncStatus>(cloudSyncService.getStatus())
const restoreSuspensionCount = ref(cloudSyncService.getRestoreSuspensions().length)
// 相对时间（「2 分钟前」）在每次回到本页时刷新
const now = ref(new Date())
let unsubscribeSyncStatus: (() => void) | null = null

const syncView = computed(() => describeSyncStatus({
  status: syncStatus.value,
  autoSyncEnabled: autoSyncEnabled.value,
  storageCount: storageConfigs.value.length,
  restoreSuspensionCount: restoreSuspensionCount.value
}))

// 状态卡上显示的存储：正在同步的那个，没有就取第一个已启用的
const primaryStorage = computed(() =>
  storageConfigs.value.find(config => config.id === syncStatus.value.storageId && config.enabled)
  || storageConfigs.value.find(config => config.enabled))

// 一切正常时显示「坚果云 · 2 分钟前同步」，其余状态显示状态说明
const syncCardSubtitle = computed(() => {
  const view = syncView.value
  const lastSyncAt = syncStatus.value.lastSyncAt
  if (view.kind === 'current' && primaryStorage.value && lastSyncAt) {
    return `${primaryStorage.value.name} · ${t('mobileSettings.sync.syncedAgo', { time: formatRelative(lastSyncAt, now.value) })}`
  }
  if (view.kind === 'notConfigured') return t('mobileSettings.entries.dataSyncDescription')
  return view.description
})

const storageSummary = computed(() => {
  if (storageConfigs.value.length === 0) return t('mobileSettings.sync.notConfigured')
  const storage = primaryStorage.value || storageConfigs.value[0]
  return storage.type === 'webdav' ? 'WebDAV' : 'iCloud'
})

const backupSummary = computed(() => latestLocalBackupAt.value
  ? formatFriendlyDate(latestLocalBackupAt.value, locale.value, { withTime: false, now: now.value })
  : t('dataBackup.none'))

const generalSummary = computed(() => {
  const language = supportedLocales.find(item => item.code === locale.value)?.name || locale.value
  const themeKey = themeSource.value === 'light'
    ? 'appearance.light'
    : themeSource.value === 'dark'
      ? 'appearance.dark'
      : 'appearance.auto'
  return `${language} · ${t(themeKey)}`
})

const go = (path: string) => {
  void router.push(path)
}

/**
 * 冲突处理面板（SyncConflictSheet）挂在数据同步页上：首页登记一次打开请求再跳过去，
 * 同步页进入时取走请求并打开面板。
 */
const openConflictSheet = () => {
  requestConflictSheet()
  go(ROUTES.dataSync)
}

const loadSummary = async () => {
  now.value = new Date()
  restoreSuspensionCount.value = cloudSyncService.getRestoreSuspensions().length
  const [configs, enabled, backups] = await Promise.all([
    CloudBackupAPI.getStorageConfigs().catch(error => {
      console.error('加载云端存储配置失败:', error)
      return [] as CloudStorageConfig[]
    }),
    cloudSyncService.getAutoSyncEnabled().catch(() => true),
    loadLocalBackupSummary()
  ])
  storageConfigs.value = configs
  autoSyncEnabled.value = enabled
  latestLocalBackupAt.value = backups.latestAt
}

onMounted(() => {
  unsubscribeSyncStatus = cloudSyncService.onStatusChange(status => {
    syncStatus.value = status
    restoreSuspensionCount.value = cloudSyncService.getRestoreSuspensions().length
  })
})

// Tab 页会被 Ionic 缓存，返回时用生命周期钩子刷新摘要而不是 onMounted。
onIonViewWillEnter(() => {
  void loadSummary()
})

onUnmounted(() => unsubscribeSyncStatus?.())
</script>

<style scoped>
.m-body.settings-home {
  padding-top: 16px;
}

.m-card.settings-sync-card {
  flex-direction: row;
  align-items: center;
  overflow: hidden;
}

.settings-sync-card__main {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 14px;
  min-width: 0;
  min-height: 76px;
  padding: 16px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.settings-sync-card__main:active {
  background: var(--surface-secondary);
}

.settings-sync-card__action {
  position: relative;
  flex: none;
  height: 34px;
  margin-right: 16px;
  padding: 0 14px;
  border: 0;
  border-radius: 17px;
  background: var(--accent-warning-bg);
  color: var(--accent-warning);
  font: inherit;
  font-size: var(--m-font-sub);
  font-weight: 600;
  cursor: pointer;
}

.settings-sync-card__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.settings-sync-card__title {
  color: var(--content-primary);
  font-size: var(--m-font-body);
  font-weight: 600;
}

.settings-sync-card__sub {
  display: -webkit-box;
  overflow: hidden;
  color: var(--content-tertiary);
  font-size: var(--m-font-sub);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.settings-sync-card__go {
  pointer-events: none;
}

/* 胶囊按钮看起来 34px，点按区域扩到 44px */
.settings-sync-card__action::after {
  position: absolute;
  inset: -5px 0;
  content: "";
}
</style>
