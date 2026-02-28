<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ t('mainPage.menu.settings') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">{{ t('mainPage.menu.settings') }}</ion-title>
        </ion-toolbar>
      </ion-header>

      <div class="content-padding">
        <h2>设置</h2>
        <p>移动端设置即将推出...</p>
        <p>这里将显示应用设置选项</p>
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
