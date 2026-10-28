<template>
  <ion-page>
    <ion-tabs>
      <ion-router-outlet></ion-router-outlet>

      <!-- V5 底部胶囊导航：提示词 / 模型 / 设置，选中项换实心图标并铺浅蓝底 -->
      <div slot="bottom" class="m-tabbar-wrap">
        <ion-tab-bar id="mobile-tab-bar" class="m-tabbar" :aria-label="t('mobileNav.label')">
          <ion-tab-button tab="prompts" href="/tabs/prompts">
            <ion-icon :icon="activeTab === 'prompts' ? documentText : documentTextOutline" />
            <ion-label>{{ t('mobileNav.prompts') }}</ion-label>
          </ion-tab-button>

          <ion-tab-button tab="ai-config" href="/tabs/ai-config">
            <ion-icon :icon="activeTab === 'ai-config' ? sparkles : sparklesOutline" />
            <ion-label>{{ t('mobileNav.models') }}</ion-label>
          </ion-tab-button>

          <ion-tab-button tab="settings" href="/tabs/settings">
            <ion-icon :icon="activeTab === 'settings' ? settings : settingsOutline" />
            <ion-label>{{ t('mobileNav.settings') }}</ion-label>
          </ion-tab-button>
        </ion-tab-bar>
      </div>
    </ion-tabs>
  </ion-page>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import {
  IonPage,
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonIcon,
  IonLabel,
  IonRouterOutlet
} from '@ionic/vue'
import {
  documentText,
  documentTextOutline,
  settings,
  settingsOutline,
  sparkles,
  sparklesOutline
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'

const { t } = useI18n()
const route = useRoute()

const activeTab = computed(() => route.path.split('/')[2] || 'prompts')
</script>
