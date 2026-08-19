<template>
  <ion-page>
    <ion-tabs>
      <ion-router-outlet></ion-router-outlet>

      <!--
        AI 入口条 + 标签栏都放在 slot="bottom" 里，作为悬浮于内容之上的两片独立
        玻璃层（见 assets/styles/mobile.css 的 .mobile-floating-nav 分区），而不是
        贴死在屏幕底部的实体栏。标签栏本身在向下滚动时会收起为纯图标的小型胶囊。

        提示词 Tab 上的入口条是「新建提示词」+「AI 生成提示词」的长条+圆形两按钮
        （见 Gitea issue #7），谁占长条主位由是否已配置 AI 决定，逻辑见
        lib/mobile/floating-prompt-actions.ts；其余 2 个 Tab 保持原来「AI 生成」
        单按钮不变，因为「新建提示词」在那两个页面语境下没有意义。两种布局共用
        同一套滚动收起动画：长条按钮始终是 .mobile-ai-entry，收起时的宽度/内边距
        过渡规则完全复用，未新增任何滚动状态。
      -->
      <div
        slot="bottom"
        class="mobile-floating-nav"
        :class="{ 'mobile-floating-nav--minimized': isNavMinimized }"
      >
        <div v-if="isPromptsTab" class="mobile-prompt-actions">
          <button
            type="button"
            class="mobile-ai-entry"
            :aria-label="promptActionMeta[promptFloatingActions.primary].label"
            @click="promptActionMeta[promptFloatingActions.primary].handler"
          >
            <ion-icon :icon="promptActionMeta[promptFloatingActions.primary].icon"></ion-icon>
            <span class="mobile-ai-entry__label">{{ promptActionMeta[promptFloatingActions.primary].label }}</span>
          </button>
          <button
            type="button"
            class="mobile-prompt-actions__secondary"
            :aria-label="promptActionMeta[promptFloatingActions.secondary].label"
            @click="promptActionMeta[promptFloatingActions.secondary].handler"
          >
            <ion-icon :icon="promptActionMeta[promptFloatingActions.secondary].icon"></ion-icon>
          </button>
        </div>

        <button
          v-else
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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
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
import { add, listOutline, sparklesOutline, sparkles, settingsOutline } from 'ionicons/icons'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from '~/composables/useI18n'
import { useAIConfigStatus } from '~/composables/useAIConfigStatus'
import { onDataChange } from '~/lib/services/data-change-events'
import {
  getPromptFloatingActions,
  type PromptFloatingActionKind
} from '~/lib/mobile/floating-prompt-actions'
import MobileAIGeneratorPage from './mobile/MobileAIGeneratorPage.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const showAIGenerator = ref(false)
const openAIGenerator = () => {
  showAIGenerator.value = true
}

// ------------------------------------------------------------------
// 提示词操作区：两态两按钮布局（Gitea issue #7）
// 只在提示词 Tab 上生效，其余 Tab 保持原来的单一 AI 入口按钮。
// ------------------------------------------------------------------
const isPromptsTab = computed(() => route.path === '/tabs/prompts')

const { hasAIConfig, refreshAIConfigStatus } = useAIConfigStatus()
const unsubscribeAIConfigChanges = onDataChange('ai_configs', refreshAIConfigStatus)

const promptFloatingActions = computed(() => getPromptFloatingActions(hasAIConfig.value))

const navigateToCreatePrompt = () => {
  router.push('/prompt/create')
}

interface PromptActionMeta {
  icon: string
  label: string
  handler: () => void
}

// AI 生成的引导逻辑完全复用 openAIGenerator：MobileAIGeneratorPage 本身在没有
// 可用 AI 配置时就会展示「添加 AI 配置」的引导空状态（见该文件），这里不需要
// 再重复实现一遍"引导去配置"的跳转逻辑。
const promptActionMeta = computed<Record<PromptFloatingActionKind, PromptActionMeta>>(() => ({
  create: {
    icon: add,
    label: t('promptManagement.createPrompt'),
    handler: navigateToCreatePrompt
  },
  'ai-generate': {
    icon: sparkles,
    label: t('promptManagement.aiGeneratePrompt'),
    handler: openAIGenerator
  }
}))

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
  refreshAIConfigStatus()
})

onUnmounted(() => {
  document.removeEventListener('ionScroll', handleIonScroll as EventListener)
  unsubscribeAIConfigChanges()
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
