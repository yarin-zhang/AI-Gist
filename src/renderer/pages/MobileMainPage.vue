<template>
  <ion-page>
    <ion-tabs>
      <ion-router-outlet></ion-router-outlet>

      <!--
        底部导航照设计稿 V5 的 C-MTabBar 画：附件栏、标签栏和搜索圆按钮，对应 iOS 26
        TabView 的 tabViewBottomAccessory、标签栏和搜索角色的独立按钮。三者都悬浮在
        内容之上（见 assets/styles/mobile.css 的「底部导航」分区）；附件栏左右卡在
        两侧 inset 上，下面一行的标签栏 + 搜索按钮也从左 inset 排到右 inset，两行等宽。

        标签栏必须是 ion-tabs 的直接子元素并自带 slot="bottom"：iOS 26+ 上
        @rdlabo/capacitor-native-ui 以它为锚点投影出系统底栏（slot 决定贴底还是贴顶），
        iPhone Duo 的侧边竖条样式也只认 `ion-tabs > ion-tab-bar`。
        tab-bar-position-start 只给原生投影用，让系统底栏贴着网页占位的左边，右边留给
        搜索按钮。网页底栏（Android、Web、旧版 iOS）向下滚动时三者一起变矮，标签文字
        隐藏；系统底栏不收起，见 isNativeTabBar。收起状态用 data 属性而不是动态
        class：IonTabBar 会把 class 透传到 ion-tab-bar 上，Vue 更新 class 时整体覆写
        className，会把 Stencil 自己加的 hydrated / ios 等 class 一起抹掉。

        附件栏只在「AI 提示词」Tab 上出现，左边长按钮、右边「+」圆按钮（见 Gitea
        issue #7），谁占左边由是否已配置 AI 决定，逻辑见
        lib/mobile/floating-prompt-actions.ts。「AI 配置」「设置」这两个 Tab 不显示
        附件栏（Gitea issue #59）：这两个页面语境下点它既不能新建提示词，也没有直达
        价值。搜索按钮在所有 Tab 上都有，点了回到提示词页并展开搜索框。

        iOS 26+ 上它们都交给系统渲染：附件栏整体由 ios-native-ui.ts 里的
        prompt-accessory 扩展画成 SwiftUI Liquid Glass 胶囊，搜索按钮和附件栏里的两个
        按钮标了 data-native-ui="button"，投影成系统玻璃按钮。网页元素留在原处提供
        位置、文字、图标和点击处理。系统底栏进入 iPhone Duo 侧边竖条时这三个按钮改为
        placement="rail"，跟标签栏一起放进竖条；没有原生竖条时插件会把 rail 按钮留在
        网页原位，所以平时必须是 element。
      -->
      <div
        v-if="isPromptsTab"
        slot="bottom"
        class="mobile-tab-accessory"
        data-prompt-accessory
        :data-nav-minimized="isNavMinimized ? 'true' : undefined"
      >
        <button
          type="button"
          class="mobile-tab-accessory__primary"
          data-accessory-action="primary"
          data-native-ui="button"
          :data-native-ui-placement="nativeActionPlacement"
          :aria-label="promptActionMeta[promptFloatingActions.primary].label"
          @click="promptActionMeta[promptFloatingActions.primary].handler"
        >
          <ion-icon :icon="promptActionMeta[promptFloatingActions.primary].icon"></ion-icon>
          <span class="mobile-tab-accessory__label">{{ promptActionMeta[promptFloatingActions.primary].label }}</span>
        </button>
        <span class="mobile-tab-accessory__separator" aria-hidden="true"></span>
        <button
          type="button"
          class="mobile-tab-accessory__secondary"
          data-accessory-action="secondary"
          data-native-ui="button"
          :data-native-ui-placement="nativeActionPlacement"
          :aria-label="promptActionMeta[promptFloatingActions.secondary].label"
          @click="promptActionMeta[promptFloatingActions.secondary].handler"
        >
          <ion-icon :icon="promptActionMeta[promptFloatingActions.secondary].icon"></ion-icon>
        </button>
      </div>

      <ion-tab-bar
        id="mobile-tab-bar"
        slot="bottom"
        class="tab-bar-position-start"
        :data-nav-minimized="isNavMinimized ? 'true' : undefined"
      >
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

      <button
        type="button"
        slot="bottom"
        class="mobile-tab-search"
        data-native-ui="button"
        :data-native-ui-placement="nativeActionPlacement"
        :data-nav-minimized="isNavMinimized ? 'true' : undefined"
        :aria-label="t('promptManagement.searchPrompt')"
        @click="openPromptSearch"
      >
        <ion-icon :icon="search"></ion-icon>
      </button>
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
import { add, listOutline, search, sparklesOutline, sparkles, settingsOutline } from 'ionicons/icons'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from '~/composables/useI18n'
import { useAIConfigStatus } from '~/composables/useAIConfigStatus'
import { onDataChange } from '~/lib/services/data-change-events'
import {
  getPromptFloatingActions,
  type PromptFloatingActionKind
} from '~/lib/mobile/floating-prompt-actions'
import { shouldResetFloatingNav } from '~/lib/mobile/floating-nav-reset'
import { isNativeTabBarEnabled, isVerticalBarsActive } from '~/lib/mobile/native-tab-bar'
import { requestPromptSearch } from '~/lib/mobile/prompt-search-request'
import MobileAIGeneratorPage from './mobile/MobileAIGeneratorPage.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const showAIGenerator = ref(false)
const openAIGenerator = () => {
  showAIGenerator.value = true
}

// ------------------------------------------------------------------
// 附件栏：左边长按钮 + 右边圆按钮（Gitea issue #7）
// 只在提示词 Tab 上生效；「AI 配置」「设置」两个 Tab 不显示附件栏（Gitea issue #59）。
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

// 只有 Native UI 在运行时才有人读这个属性，见模板里的注释
const nativeActionPlacement = computed(() => (isVerticalBarsActive.value ? 'rail' : 'element'))

// 搜索框属于提示词页；从别的 Tab 点过来时先切回去，页面挂载后再取走这次请求
const openPromptSearch = () => {
  requestPromptSearch()
  if (!isPromptsTab.value) {
    router.push('/tabs/prompts')
  }
}

// ------------------------------------------------------------------
// 滚动收起/展开浮动导航
// 各 Tab 根页面的 <ion-content scroll-events> 会派发 ionScroll 事件；该事件默认
// bubbles + composed，因此在这里用一个全局监听即可覆盖所有 Tab，无需逐页接线。
//
// iOS 26+ 的标签栏、附件栏和搜索按钮都由系统渲染，不监听滚动、也不收起：独立的
// UITabBar 本身没有滚动收起，而网页源元素一旦做尺寸过渡，Native UI 就会在动画期间
// 退回网页渲染，底栏和按钮会在系统样式和网页样式之间闪烁。启动后不会再变，读一次即可。
// ------------------------------------------------------------------
const isNativeTabBar = isNativeTabBarEnabled()
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
  if (!isNativeTabBar) {
    document.addEventListener('ionScroll', handleIonScroll as EventListener)
  }
  refreshAIConfigStatus()
})

onUnmounted(() => {
  document.removeEventListener('ionScroll', handleIonScroll as EventListener)
  unsubscribeAIConfigChanges()
})

// 切换 Tab 时重置滚动基准并展开导航，避免带着上一个 Tab 的收起状态进入新页面。
//
// 必须只在「三个 Tab 之间互相切换」时才重置，不能在离开/返回 /tabs/* 之外的
// 二级页面（提示词详情、设置子页面等）时触发：MobileMainPage 导航到这类
// 二级页面时并不会被销毁，Ionic 的 ion-router-outlet 只是把它保留在页面栈
// 底层、盖上新页面，而这个 watch 挂在全局 route 对象上，离开 /tabs/* 时
// 同样会触发。旧写法不分青红皂白一律重置，会导致：提示词列表下滑到收起态
// -> 点进详情页（此时组件仍在后台挂载，isNavMinimized 被这里误重置为
// false，只是暂时被详情页盖住看不见）-> 返回列表页时浮动导航条先展开成
// 较宽状态，要等用户再滑动一下触发一次新的真实 ionScroll，才会被
// handleIonScroll 重新收起——列表实际滚动位置全程没变，只是这里的响应式
// 状态被提前清空了（对应 Gitea issue #88）。判断逻辑抽成纯函数
// shouldResetFloatingNav（见 lib/mobile/floating-nav-reset.ts），只有
// 新旧路径确实都落在 Tab 根路径下才重置；离开/返回二级页面时保留原有的
// 收起状态。
watch(
  () => route.path,
  (newPath, oldPath) => {
    if (!shouldResetFloatingNav(oldPath, newPath)) {
      return
    }
    lastScrollTop = 0
    isNavMinimized.value = false
  }
)
</script>
