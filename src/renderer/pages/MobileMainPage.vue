<template>
  <ion-page>
    <ion-tabs>
      <ion-router-outlet></ion-router-outlet>

      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="prompts" href="/tabs/prompts">
          <ion-icon :icon="listOutline" />
          <ion-label>{{ t('mainPage.menu.prompts') }}</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="ai-config" href="/tabs/ai-config">
          <ion-icon :icon="sparklesOutline" />
          <ion-label>{{ t('mainPage.menu.aiConfig') }}</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="settings" href="/tabs/settings">
          <ion-icon :icon="settingsOutline" />
          <ion-label>{{ t('mainPage.menu.settings') }}</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonPage,
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonIcon,
  IonLabel,
  IonRouterOutlet
} from '@ionic/vue'
import { listOutline, sparklesOutline, settingsOutline } from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'

const { t } = useI18n()
</script>

<style scoped>
ion-tab-bar {
  --background: var(--ion-background-color);
  border-top: 1px solid var(--ion-border-color, rgba(0, 0, 0, 0.1));
}

ion-tab-button {
  --color: var(--ion-color-medium);
  --color-selected: var(--ion-color-primary);
}

/* 暗色主题适配 */
@media (prefers-color-scheme: dark) {
  ion-tab-bar {
    border-top-color: rgba(255, 255, 255, 0.1);
  }
}
</style>
