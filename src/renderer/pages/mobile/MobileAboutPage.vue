<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :text="t('common.back')" default-href="/tabs/settings"></ion-back-button>
        </ion-buttons>
        <ion-title>{{ t('settings.menus.about.title') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <!-- 应用信息 -->
      <div class="app-info">
        <img :src="appIcon" class="app-logo" alt="App Logo" />
        <h2>{{ t('about.appName') }}</h2>
        <p class="app-desc">{{ t('about.appDescription') }}</p>
        <p class="app-features">{{ t('about.appFeatures') }}</p>
      </div>

      <!-- 版本信息 -->
      <ion-list>
        <ion-list-header>
          <ion-label>{{ t('about.versionInfo') }}</ion-label>
        </ion-list-header>

        <ion-item>
          <ion-icon :icon="phonePortraitOutline" slot="start"></ion-icon>
          <ion-label>{{ t('about.currentVersion') }}</ion-label>
          <ion-note slot="end">{{ currentVersion || '—' }}</ion-note>
        </ion-item>

        <ion-item v-if="latestVersion">
          <ion-icon :icon="cloudOutline" slot="start"></ion-icon>
          <ion-label>{{ t('about.latestVersion') }}</ion-label>
          <div slot="end" class="version-end">
            <span>{{ latestVersion }}</span>
            <ion-badge :color="hasUpdate ? 'warning' : 'success'" class="version-badge">
              {{ hasUpdate ? t('about.hasUpdate') : t('about.isLatest') }}
            </ion-badge>
          </div>
        </ion-item>

        <ion-item v-if="publishedAt">
          <ion-icon :icon="calendarOutline" slot="start"></ion-icon>
          <ion-label>{{ t('about.publishedAt') }}</ion-label>
          <ion-note slot="end">{{ publishedAt }}</ion-note>
        </ion-item>
      </ion-list>

      <!-- 更新检查 -->
      <ion-list>
        <ion-list-header>
          <ion-label>{{ t('about.updateCheck') }}</ion-label>
        </ion-list-header>

        <ion-item button @click="handleCheckForUpdates" :detail="false">
          <ion-icon :icon="refreshOutline" slot="start"></ion-icon>
          <ion-label>{{ t('about.checkForUpdates') }}</ion-label>
          <ion-spinner v-if="checking" slot="end" name="crescent"></ion-spinner>
        </ion-item>

        <!-- 发现新版本提示 -->
        <div v-if="hasUpdate && latestVersion" class="update-notice">
          <ion-item lines="none" class="update-item">
            <ion-icon :icon="arrowDownCircleOutline" slot="start" color="warning"></ion-icon>
            <ion-label class="ion-text-wrap">
              <p>{{ t('about.newVersionDesc', { version: latestVersion }) }}</p>
            </ion-label>
          </ion-item>
          <div class="update-buttons">
            <ion-button expand="block" @click="handleOpenDownloadPage">
              {{ t('about.downloadNewVersion') }}
            </ion-button>
            <ion-button expand="block" fill="outline" @click="showReleaseNotes = !showReleaseNotes">
              {{ showReleaseNotes ? t('about.hideReleaseNotes') : t('about.viewReleaseNotes') }}
            </ion-button>
          </div>
          <div v-if="showReleaseNotes" class="release-notes">
            <p>{{ releaseNotes }}</p>
          </div>
        </div>

        <!-- 检查失败提示 -->
        <ion-item v-if="checkError" lines="none" color="danger" class="error-item">
          <ion-label class="ion-text-wrap">
            <p>{{ checkError }}</p>
          </ion-label>
        </ion-item>
      </ion-list>

      <!-- 项目信息 -->
      <ion-list>
        <ion-list-header>
          <ion-label>{{ t('about.projectInfo') }}</ion-label>
        </ion-list-header>

        <ion-item>
          <ion-icon :icon="personOutline" slot="start"></ion-icon>
          <ion-label>{{ t('about.developer') }}</ion-label>
          <ion-note slot="end">{{ t('about.developerName') }}</ion-note>
        </ion-item>

        <ion-item button @click="openURL('https://github.com/yarin-zhang/AI-Gist')">
          <ion-icon :icon="logoGithub" slot="start"></ion-icon>
          <ion-label>{{ t('about.github') }}</ion-label>
          <ion-note slot="end">{{ t('about.githubRepo') }}</ion-note>
        </ion-item>

        <ion-item>
          <ion-icon :icon="documentTextOutline" slot="start"></ion-icon>
          <ion-label>{{ t('about.license') }}</ion-label>
          <ion-note slot="end">{{ t('about.licenseType') }}</ion-note>
        </ion-item>
      </ion-list>

      <!-- 反馈与支持 -->
      <ion-list>
        <ion-list-header>
          <ion-label>{{ t('about.feedbackSupport') }}</ion-label>
        </ion-list-header>

        <ion-item button @click="openURL('https://github.com/yarin-zhang/AI-Gist/issues')">
          <ion-icon :icon="bugOutline" slot="start"></ion-icon>
          <ion-label>{{ t('about.reportIssue') }}</ion-label>
        </ion-item>

        <ion-item button @click="openURL('https://github.com/yarin-zhang/AI-Gist/issues/new?template=feature_request.md')">
          <ion-icon :icon="bulbOutline" slot="start"></ion-icon>
          <ion-label>{{ t('about.featureRequest') }}</ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
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
  IonNote,
  IonBadge,
  IonIcon,
  IonButton,
  IonSpinner,
  toastController
} from '@ionic/vue'
import {
  refreshOutline,
  bugOutline,
  bulbOutline,
  arrowDownCircleOutline,
  logoGithub,
  phonePortraitOutline,
  cloudOutline,
  calendarOutline,
  personOutline,
  documentTextOutline
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { useUpdate } from '~/composables/useUpdate'

const { t } = useI18n()

const appIcon = new URL('../../assets/images/logo.png', import.meta.url).href

const {
  currentVersion,
  checking,
  checkError,
  hasUpdate,
  latestVersion,
  releaseNotes,
  downloadUrl,
  publishedAt,
  checkForUpdates,
  initVersion
} = useUpdate()

const showReleaseNotes = ref(false)

const showToast = async (message: string, color: string = 'success') => {
  const toast = await toastController.create({ message, duration: 2000, color })
  await toast.present()
}

const handleCheckForUpdates = async () => {
  const result = await checkForUpdates()
  if (result.success) {
    if (result.data?.hasUpdate) {
      showToast(t('about.newVersionAvailable'))
    } else {
      showToast(t('about.isLatest'))
    }
  } else {
    showToast(result.error || t('about.checkForUpdates'), 'danger')
  }
}

const handleOpenDownloadPage = () => {
  if (downloadUrl.value) {
    openURL(downloadUrl.value)
  }
}

const openURL = (url: string) => {
  window.open(url, '_blank')
}

onMounted(async () => {
  await initVersion()
})
</script>

<style scoped>
.app-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 16px 16px;
  text-align: center;
}

.app-logo {
  width: 80px;
  height: 80px;
  border-radius: 16px;
  margin-bottom: 12px;
}

.app-info h2 {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 6px;
}

.app-desc {
  font-size: 14px;
  color: var(--ion-color-medium);
  margin: 0 0 4px;
}

.app-features {
  font-size: 12px;
  color: var(--ion-color-medium);
  margin: 0;
}

.version-end {
  display: flex;
  align-items: center;
  gap: 6px;
}

.version-badge {
  font-size: 11px;
}

.update-notice {
  padding: 0 16px 8px;
}

.update-item {
  --padding-start: 0;
  margin-bottom: 8px;
}

.update-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.release-notes {
  margin-top: 12px;
  padding: 12px;
  background: var(--ion-color-light);
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  color: var(--ion-color-dark);
}

.error-item {
  margin: 0 16px 8px;
  border-radius: 8px;
}
</style>
