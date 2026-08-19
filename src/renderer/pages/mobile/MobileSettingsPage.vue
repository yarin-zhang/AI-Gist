<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title :style="{ opacity: headerProgress }">{{ t('mainPage.menu.settings') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true" :scroll-events="true" @ionScroll="onIonScroll">
      <!-- 大标题：静止时展开，向下滚动时收起为工具栏小标题 -->
      <div class="mobile-large-title-bar" :style="{ '--collapse-progress': headerProgress }">
        <h1 class="mobile-large-title-text" aria-hidden="true">{{ t('mainPage.menu.settings') }}</h1>
      </div>

      <!-- 设置首页只做导航：每一项都进入独立的二级页面 -->
      <ion-list-header class="mobile-settings-group-header">
        <ion-label>{{ t('mobileSettings.groups.data') }}</ion-label>
      </ion-list-header>
      <div class="mobile-grouped-card">
        <ion-list>
          <ion-item button detail @click="go('/mobile/settings/data-sync')">
            <ion-icon :icon="syncOutline" slot="start"></ion-icon>
            <ion-label class="ion-text-wrap">
              <h3>{{ t('dataSync.title') }}</h3>
              <p>{{ t('mobileSettings.entries.dataSyncDescription') }}</p>
            </ion-label>
            <ion-note slot="end">{{ syncSummary }}</ion-note>
          </ion-item>

          <ion-item button detail @click="go('/mobile/settings/data-backup')">
            <ion-icon :icon="archiveOutline" slot="start"></ion-icon>
            <ion-label class="ion-text-wrap">
              <h3>{{ t('dataBackup.title') }}</h3>
              <p>{{ t('mobileSettings.entries.dataBackupDescription') }}</p>
            </ion-label>
          </ion-item>
        </ion-list>
      </div>

      <ion-list-header class="mobile-settings-group-header">
        <ion-label>{{ t('mobileSettings.groups.preferences') }}</ion-label>
      </ion-list-header>
      <div class="mobile-grouped-card">
        <ion-list>
          <ion-item button detail @click="go('/mobile/settings/general')">
            <ion-icon :icon="optionsOutline" slot="start"></ion-icon>
            <ion-label class="ion-text-wrap">
              <h3>{{ t('settings.sections.general') }}</h3>
              <p>{{ t('mobileSettings.entries.generalDescription') }}</p>
            </ion-label>
            <ion-note slot="end">{{ generalSummary }}</ion-note>
          </ion-item>
        </ion-list>
      </div>

      <ion-list-header class="mobile-settings-group-header">
        <ion-label>{{ t('mobileSettings.groups.other') }}</ion-label>
      </ion-list-header>
      <div class="mobile-grouped-card">
        <ion-list>
          <ion-item button detail @click="go('/mobile/about')">
            <ion-icon :icon="informationCircleOutline" slot="start"></ion-icon>
            <ion-label class="ion-text-wrap">
              <h3>{{ t('settings.menus.about.title') }}</h3>
              <p>{{ t('mobileSettings.entries.aboutDescription') }}</p>
            </ion-label>
            <ion-note slot="end">{{ appVersion }}</ion-note>
          </ion-item>
        </ion-list>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
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
  syncOutline,
  archiveOutline,
  optionsOutline,
  informationCircleOutline
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { useTheme } from '~/composables/useTheme'
import { useCollapsingHeader } from '~/composables/useCollapsingHeader'
import { CloudBackupAPI } from '~/lib/api/cloud-backup.api'
import { cloudSyncService, type CloudSyncStatus } from '~/lib/services/cloud-sync.service'

const router = useRouter()
const { t, locale, supportedLocales } = useI18n()
const { themeSource } = useTheme()
const { progress: headerProgress, onIonScroll } = useCollapsingHeader()

const appVersion = ref(typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '')
const storageCount = ref(0)
const syncStatus = ref<CloudSyncStatus>(cloudSyncService.getStatus())
let unsubscribeSyncStatus: (() => void) | null = null

// 未配置存储时不展示同步状态，否则会让用户以为同步已经在工作。
const syncSummary = computed(() => {
  if (storageCount.value === 0) return t('mobileSettings.sync.notConfigured')
  if (cloudSyncService.getRestoreSuspensions().length > 0) {
    return t('cloudBackup.syncStatusValues.paused')
  }
  return t(`cloudBackup.syncStatusValues.${syncStatus.value.status}`)
})

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

const loadStorageCount = async () => {
  try {
    storageCount.value = (await CloudBackupAPI.getStorageConfigs()).length
  } catch (error) {
    console.error('加载云端存储配置失败:', error)
    storageCount.value = 0
  }
}

onMounted(() => {
  unsubscribeSyncStatus = cloudSyncService.onStatusChange(status => {
    syncStatus.value = status
  })
})

// Tab 页会被 Ionic 缓存，返回时用生命周期钩子刷新摘要而不是 onMounted。
onIonViewWillEnter(() => {
  void loadStorageCount()
})

onUnmounted(() => unsubscribeSyncStatus?.())
</script>

<style scoped>
/* ion-list-header 与字号阶梯的统一样式见 assets/styles/mobile.css */

/* Ionic 默认给 slot="start" 的图标留了 32px，设置列表里显得过空 */
ion-item ion-icon[slot='start'] {
  margin-inline-end: 16px;
}

ion-content {
  /* 让列表底部留出浮动导航（AI 入口条 + 标签栏）的空间，避免最后一项被遮挡 */
  --padding-bottom: calc(env(safe-area-inset-bottom, 0px) + var(--mobile-nav-clearance));
}

/*
 * 分组标题现在放在圆角卡片外面（贴近原生 iOS 设置页的分组样式），
 * 第一组紧跟大标题，顶部留白可以比后续分组略小。
 */
.mobile-settings-group-header {
  margin-top: 4px;
}

.mobile-settings-group-header:first-of-type {
  margin-top: 0;
}
</style>
