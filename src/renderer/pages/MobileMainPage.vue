<template>
  <ion-page>
    <!-- 主内容区 -->
    <ion-content :fullscreen="true">
      <!-- 提示词页面 -->
      <div v-show="currentTab === 'prompts'" class="tab-content">
        <ion-header>
          <ion-toolbar>
            <ion-title>{{ t('mainPage.menu.prompts') }}</ion-title>
          </ion-toolbar>
        </ion-header>
        <div class="content-padding">
          <h2>提示词管理</h2>
          <p>移动端提示词列表即将推出...</p>
        </div>
      </div>

      <!-- AI 配置页面 -->
      <div v-show="currentTab === 'ai-config'" class="tab-content">
        <ion-header>
          <ion-toolbar>
            <ion-title>{{ t('mainPage.menu.aiConfig') }}</ion-title>
          </ion-toolbar>
        </ion-header>
        <div class="content-padding">
          <h2>AI 配置</h2>
          <p>移动端 AI 配置即将推出...</p>
        </div>
      </div>

      <!-- 设置页面 -->
      <div v-show="currentTab === 'settings'" class="tab-content">
        <ion-header>
          <ion-toolbar>
            <ion-title>{{ t('mainPage.menu.settings') }}</ion-title>
          </ion-toolbar>
        </ion-header>
        <div class="content-padding">
          <h2>设置</h2>
          <p>移动端设置即将推出...</p>
        </div>
      </div>
    </ion-content>

    <!-- 底部导航栏 -->
    <ion-footer>
      <ion-toolbar>
        <ion-segment :value="currentTab" @ionChange="handleTabChange">
          <ion-segment-button value="prompts">
            <ion-icon :icon="listOutline"></ion-icon>
            <ion-label>{{ t('mainPage.menu.prompts') }}</ion-label>
          </ion-segment-button>

          <ion-segment-button value="ai-config">
            <ion-icon :icon="sparklesOutline"></ion-icon>
            <ion-label>{{ t('mainPage.menu.aiConfig') }}</ion-label>
          </ion-segment-button>

          <ion-segment-button value="settings">
            <ion-icon :icon="settingsOutline"></ion-icon>
            <ion-label>{{ t('mainPage.menu.settings') }}</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-footer>
  </ion-page>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import {
  IonPage,
  IonContent,
  IonFooter,
  IonToolbar,
  IonSegment,
  IonSegmentButton,
  IonIcon,
  IonLabel,
  IonHeader,
  IonTitle
} from '@ionic/vue'
import { listOutline, sparklesOutline, settingsOutline } from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'

const { t } = useI18n()
const currentTab = ref('prompts')

const handleTabChange = (event: CustomEvent) => {
  currentTab.value = event.detail.value
}
</script>

<style scoped>
.tab-content {
  height: 100%;
  padding-bottom: 60px; /* 为底部导航栏留出空间 */
}

.content-padding {
  padding: 16px;
}

ion-footer {
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
}

ion-segment {
  --background: var(--ion-background-color, #fff);
}

ion-segment-button {
  --color: var(--ion-color-medium, #92949c);
  --color-checked: var(--ion-color-primary, #3880ff);
  --indicator-color: transparent;
  min-height: 50px;
}

ion-segment-button ion-icon {
  font-size: 24px;
  margin-bottom: 4px;
}

ion-segment-button ion-label {
  font-size: 12px;
  margin-top: 4px;
}

/* 暗色主题适配 */
@media (prefers-color-scheme: dark) {
  ion-segment {
    --background: var(--ion-background-color, #1e1e1e);
  }

  ion-footer {
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.3);
  }
}
</style>
