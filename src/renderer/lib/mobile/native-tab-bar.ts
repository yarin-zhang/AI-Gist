/**
 * iOS 原生底栏开关。
 *
 * iOS 26 起系统底栏是 Liquid Glass；iOS 27.1 起 iPhone Duo 合上、或展开横放时，
 * 系统会把底栏挪进屏幕侧边的竖条。这两种表现只有系统控件拿得到，WebView 里画的
 * ion-tab-bar 永远停在底部，所以在支持的 iOS 上改由 @rdlabo/capacitor-native-ui
 * 把 ion-tab-bar 投影成原生 UITabBar / SwiftUI 竖条（接入逻辑见 ios-native-ui.ts）。
 *
 * 插件只在 iOS 26+ 渲染原生控件，更早的系统继续用网页底栏。网页底栏的滚动收起
 * 动画和原生投影互斥（插件检测到 ion-tab-bar 在做 CSS 过渡时会临时退回网页渲染），
 * 所以必须在 Ionic 初始化、底栏第一次渲染之前就决定走哪条路；插件自己的能力
 * 检测是异步的，等不了。这里沿用 @rdlabo/ionic-theme-ios27 区分 iOS 26 / 27 的
 * WebKit 特性检测：text-wrap: pretty 随 iOS 26 加入，overflow-anchor 随 iOS 27 加入。
 */
import { readonly, ref } from 'vue'

export const NATIVE_TAB_BAR_CLASS = 'ai-gist-native-tabs'

const verticalBarsActive = ref(false)

/**
 * 系统是否把底栏放进了侧边竖条（iPhone Duo 合上、或展开横放）。由 ios-native-ui.ts
 * 按 Foldable 上报的竖条位置更新，页面据此把底部操作按钮也交给竖条。
 */
export const isVerticalBarsActive = readonly(verticalBarsActive)

export function setVerticalBarsActive(active: boolean): void {
  verticalBarsActive.value = active
}

interface CSSFeatureSupport {
  supports(conditionText: string): boolean
}

export function supportsNativeTabBar(platform: string, css: CSSFeatureSupport | undefined): boolean {
  if (platform !== 'ios' || !css) {
    return false
  }
  return css.supports('text-wrap: pretty') || css.supports('overflow-anchor: auto')
}

export function isNativeTabBarEnabled(root: Element = document.documentElement): boolean {
  return root.classList.contains(NATIVE_TAB_BAR_CLASS)
}
