<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ t('mainPage.menu.aiConfig') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">{{ t('mainPage.menu.aiConfig') }}</ion-title>
        </ion-toolbar>
      </ion-header>

      <div class="content-padding">
        <h2>AI 配置</h2>
        <p>移动端 AI 配置即将推出...</p>
        <p>这里将显示 AI 配置列表和生成器</p>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent
} from '@ionic/vue'
import { useI18n } from '~/composables/useI18n'

const { t } = useI18n()
</script>

<style scoped>
.content-padding {
  padding: 16px;
}
</style>
