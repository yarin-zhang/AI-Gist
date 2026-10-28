<template>
  <ion-page>
    <MobileNavBar :title="t('settings.menus.about.title')" fallback="/tabs/settings" />

    <ion-content class="m-page-content">
      <div class="m-body about-body">
        <div class="about-hero">
          <img :src="appIcon" class="about-hero__logo" :alt="t('about.appName')" />
          <h1 class="about-hero__name">{{ t('about.appName') }}</h1>
          <span class="about-hero__tagline">{{ t('about.appDescription') }}</span>
          <span class="about-hero__pills">
            <span class="m-pill about-hero__version">{{ currentVersion || '—' }}</span>
            <span v-if="latestVersion" class="m-pill" :class="hasUpdate ? 'm-pill-warn' : 'm-pill-ok'">
              {{ hasUpdate ? t('about.hasUpdate') : t('about.isLatest') }}
            </span>
          </span>
        </div>

        <button type="button" class="m-cta m-cta-2" :disabled="checking" @click="handleCheckForUpdates">
          <ion-spinner v-if="checking" name="crescent" aria-hidden="true" />
          <ion-icon v-else :icon="refreshOutline" aria-hidden="true" />
          {{ t('about.checkForUpdates') }}
        </button>

        <!-- 发现新版本：下载入口和更新说明 -->
        <div v-if="hasUpdate && latestVersion" class="m-card about-update">
          <div class="about-update__head">
            <span class="m-tile m-tile--warning" aria-hidden="true"><ion-icon :icon="arrowDownCircleOutline" /></span>
            <span class="about-update__text">
              <span class="about-update__title">{{ t('about.updateFound', { version: latestVersion }) }}</span>
              <span class="about-update__desc">{{ t('about.newVersionDesc', { version: latestVersion }) }}</span>
              <span v-if="publishedAt" class="about-update__meta">{{ t('about.publishedAt') }} · {{ publishedAt }}</span>
            </span>
          </div>
          <button type="button" class="m-cta" @click="handleOpenDownloadPage">
            <ion-icon :icon="downloadOutline" aria-hidden="true" />{{ t('about.downloadNewVersion') }}
          </button>
          <button
            v-if="releaseNotes"
            type="button"
            class="about-update__toggle"
            :aria-expanded="showReleaseNotes"
            @click="showReleaseNotes = !showReleaseNotes"
          >
            {{ showReleaseNotes ? t('about.hideReleaseNotes') : t('about.viewReleaseNotes') }}
          </button>
          <p v-if="showReleaseNotes" class="about-update__notes">{{ releaseNotes }}</p>
        </div>

        <!-- 检查失败提示 -->
        <p v-if="checkError" class="m-note about-error" role="alert">
          <ion-icon :icon="alertCircleOutline" aria-hidden="true" />
          <span>{{ checkError }}</span>
        </p>

        <MobileGroup :title="t('about.projectInfo')">
          <MobileRow static :title="t('about.developer')" :icon="personOutline" tone="blue" :value="t('about.developerName')" />
          <button type="button" class="m-row" @click="openURL(REPO_URL)">
            <span class="m-tile about-tile--ink" aria-hidden="true"><ion-icon :icon="logoGithub" /></span>
            <span class="title">{{ t('about.github') }}</span>
            <span class="end">
              <span>{{ t('about.githubRepo') }}</span>
              <ion-icon :icon="chevronForward" class="chev" aria-hidden="true" />
            </span>
          </button>
          <MobileRow static :title="t('about.license')" :icon="documentTextOutline" tone="green" :value="t('about.licenseType')" />
        </MobileGroup>

        <MobileGroup :title="t('about.feedbackSupport')">
          <MobileRow :title="t('about.reportIssue')" :icon="bugOutline" tone="pink" show-chevron
            @click="openURL(`${REPO_URL}/issues`)" />
          <MobileRow :title="t('about.featureRequest')" :icon="bulbOutline" tone="violet" show-chevron
            @click="openURL(`${REPO_URL}/issues/new?template=feature_request.md`)" />
        </MobileGroup>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { IonPage, IonContent, IonIcon, IonSpinner } from '@ionic/vue'
import {
  alertCircleOutline,
  arrowDownCircleOutline,
  bugOutline,
  bulbOutline,
  chevronForward,
  documentTextOutline,
  downloadOutline,
  logoGithub,
  personOutline,
  refreshOutline
} from 'ionicons/icons'
import MobileNavBar from '~/components/mobile/ui/MobileNavBar.vue'
import MobileGroup from '~/components/mobile/ui/MobileGroup.vue'
import MobileRow from '~/components/mobile/ui/MobileRow.vue'
import { useI18n } from '~/composables/useI18n'
import { useUpdate } from '~/composables/useUpdate'
import { presentMobileToast } from '~/lib/utils/mobile-toast'

const REPO_URL = 'https://github.com/yarin-zhang/AI-Gist'

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
  await presentMobileToast(message, color)
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
    showToast(result.error || t('about.checkFailed'), 'danger')
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
.m-body.about-body {
  padding-top: 4px;
}

.about-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 0 4px;
  text-align: center;
}

.about-hero__logo {
  display: block;
  flex: none;
  width: 88px;
  height: 88px;
  margin-bottom: 10px;
  border-radius: 20px;
  box-shadow: var(--shadow-floating);
}

.about-hero__name {
  margin: 0;
  color: var(--content-primary);
  font-size: var(--m-font-block);
  font-weight: 600;
}

.about-hero__tagline {
  color: var(--content-secondary);
  font-size: var(--m-font-sub);
}

.about-hero__pills {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

.about-hero__version {
  font-family: var(--font-family-mono);
}

.m-cta ion-icon {
  font-size: 18px;
}

.m-cta ion-spinner {
  width: 18px;
  height: 18px;
}

.m-card.about-update {
  gap: 12px;
  padding: 16px;
}

.about-update__head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.about-update__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.about-update__title {
  font-size: var(--m-font-body);
  font-weight: 600;
}

.about-update__desc {
  color: var(--content-secondary);
  font-size: var(--m-font-sub);
  line-height: 1.5;
}

.about-update__meta {
  color: var(--content-tertiary);
  font-size: var(--m-font-caption);
}

.about-update__toggle {
  min-height: 44px;
  margin-top: -4px;
  border: 0;
  background: transparent;
  color: var(--accent-primary);
  font: inherit;
  font-size: var(--m-font-sub);
  font-weight: 600;
  cursor: pointer;
}

.about-update__notes {
  margin: 0;
  padding: 12px;
  border-radius: 12px;
  background: var(--surface-secondary);
  color: var(--content-primary);
  font-size: var(--m-font-sub);
  line-height: 1.6;
  white-space: pre-wrap;
}

.m-note.about-error {
  color: var(--accent-error);
}

/* GitHub 的图标方块用正文色，和品牌标识保持一致 */
.m-tile.about-tile--ink {
  background: var(--content-primary);
  color: var(--surface-primary);
}
</style>
