import { computed, ref } from 'vue'

/**
 * iOS 风格的大标题滚动收起效果。
 *
 * 三个 Tab 根页面（提示词 / AI 配置 / 设置）各自在自己的 <ion-content> 上开启
 * :scroll-events="true" 并把 @ionScroll 接到这里返回的 onIonScroll；这里只把
 * 滚动距离换算成 0~1 的「收起进度」，页面内的大标题区块与工具栏小标题各自用这个
 * 进度驱动样式，逻辑只写一份，避免三个页面各自维护一套滚动阈值。
 *
 * 这与 MobileMainPage.vue 里 PR1 引入的标签栏收起是两套独立的滚动反馈：那个监听
 * document 上的全局 ionScroll（事件默认 bubbles + composed）来控制悬浮导航条，
 * 这里的 onIonScroll 直接绑在页面自己的 <ion-content> 上，只影响这一个页面的头部。
 */
const DEFAULT_COLLAPSE_RANGE = 44

export function useCollapsingHeader(collapseRange: number = DEFAULT_COLLAPSE_RANGE) {
  const scrollTop = ref(0)

  const onIonScroll = (event: Event) => {
    const detail = (event as CustomEvent<{ scrollTop?: number }>).detail
    const top = detail?.scrollTop ?? 0
    scrollTop.value = top > 0 ? top : 0
  }

  // 0 = 大标题完全展开，1 = 已完全收起为工具栏小标题
  const progress = computed(() => {
    if (collapseRange <= 0) return 1
    return Math.min(1, scrollTop.value / collapseRange)
  })

  const isCollapsed = computed(() => progress.value >= 1)

  return { scrollTop, progress, isCollapsed, onIonScroll }
}
