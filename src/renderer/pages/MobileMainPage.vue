<template>
  <ion-page>
    <ion-tabs>
      <ion-router-outlet></ion-router-outlet>

      <!--
        AI 入口条 + 标签栏都放在 slot="bottom" 里，作为悬浮于内容之上的两片独立
        玻璃层（见 assets/styles/mobile.css 的 .mobile-floating-nav 分区），而不是
        贴死在屏幕底部的实体栏。AI 入口条在所有 3 个 Tab 上都常驻可见，点一下就能
        从任何页面进入 AI 生成器；标签栏本身在向下滚动时会收起为纯图标的小型胶囊。
      -->
      <div
        slot="bottom"
        class="mobile-floating-nav"
        :class="{ 'mobile-floating-nav--minimized': isNavMinimized }"
      >
        <button
          type="button"
          class="mobile-ai-entry"
          :aria-label="t('aiGenerator.title')"
          @click="openAIGenerator"
        >
          <ion-icon :icon="sparkles"></ion-icon>
          <span class="mobile-ai-entry__label">{{ t('mainPage.aiEntry.label') }}</span>
        </button>

        <ion-tab-bar id="mobile-tab-bar">
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
      </div>
    </ion-tabs>

    <!-- 全局 AI 入口：以模态表单打开已有的 /ai-generator 页面，无需离开当前 Tab -->
    <ion-modal
      :is-open="showAIGenerator"
      :breakpoints="[0, 1]"
      :initial-breakpoint="1"
      @didDismiss="showAIGenerator = false"
    >
      <MobileAIGeneratorPage presented-as-modal @close="showAIGenerator = false" />
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import {
  IonPage,
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonIcon,
  IonLabel,
  IonRouterOutlet,
  IonModal
} from '@ionic/vue'
import { listOutline, sparklesOutline, sparkles, settingsOutline } from 'ionicons/icons'
import { useRoute } from 'vue-router'
import { useI18n } from '~/composables/useI18n'
import MobileAIGeneratorPage from './mobile/MobileAIGeneratorPage.vue'

const { t } = useI18n()
const route = useRoute()

const showAIGenerator = ref(false)
const openAIGenerator = () => {
  showAIGenerator.value = true
}

// ------------------------------------------------------------------
// 滚动收起/展开浮动导航
// 各 Tab 根页面的 <ion-content scroll-events> 会派发 ionScroll 事件；该事件默认
// bubbles + composed，因此在这里用一个全局监听即可覆盖所有 Tab，无需逐页接线。
// ------------------------------------------------------------------
const isNavMinimized = ref(false)
const SCROLL_DELTA_THRESHOLD = 10
const SCROLL_TOP_RESTORE = 24
let lastScrollTop = 0

const handleIonScroll = (event: Event) => {
  const detail = (event as CustomEvent<{ scrollTop?: number }>).detail
  const scrollTop = detail?.scrollTop ?? 0
  const delta = scrollTop - lastScrollTop
  lastScrollTop = scrollTop

  if (scrollTop <= SCROLL_TOP_RESTORE) {
    isNavMinimized.value = false
  } else if (delta > SCROLL_DELTA_THRESHOLD) {
    isNavMinimized.value = true
  } else if (delta < -SCROLL_DELTA_THRESHOLD) {
    isNavMinimized.value = false
  }
}

onMounted(() => {
  document.addEventListener('ionScroll', handleIonScroll as EventListener)
})

onUnmounted(() => {
  document.removeEventListener('ionScroll', handleIonScroll as EventListener)
})

// 切换 Tab 时重置滚动基准并展开导航，避免带着上一个 Tab 的收起状态进入新页面
watch(
  () => route.path,
  () => {
    lastScrollTop = 0
    isNavMinimized.value = false
  }
)
</script>
