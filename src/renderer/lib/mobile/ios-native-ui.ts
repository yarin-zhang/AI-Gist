/**
 * iOS 原生底栏接入，只在 supportsNativeTabBar() 为真时由 setup-ionic.ts / App.vue
 * 动态加载，Android、Web 和旧版 iOS 的包里不会带上这些依赖。
 *
 * - enableNativeUI：把 MobileMainPage 里的 ion-tab-bar 投影成原生控件。自动识别只打开
 *   tabs，顶部工具栏按钮、FAB、分段控件仍按移动端现有的视觉规范走网页渲染。底栏右侧
 *   的搜索按钮是显式标了 data-native-ui="button" 的按钮，不受 controls 影响，投影成
 *   系统玻璃按钮。
 * - promptAccessory：底栏上方的附件栏。插件只在 iPhone Duo 竖条用的 SwiftUI TabView
 *   上提供系统 tabViewBottomAccessory，普通 iPhone 的系统底栏是单独的 UITabBar，
 *   没有附件栏位置，所以由 ios/App/App/PromptAccessory.swift 在网页附件栏的位置画
 *   一个 Liquid Glass 胶囊，两个按钮点击后回到网页按钮自己的处理函数。
 * - Foldable + setVerticalBarsLayout：iPhone Duo 把底栏放进侧边竖条时，给 ion-app
 *   加上 .ios-theme-vertical-bars，由 vertical-bars.css 给 ion-content / ion-toolbar
 *   让出竖条宽度；同时更新 isVerticalBarsActive，让底部操作按钮跟着进入竖条。
 * - nativeUINavAnimation：页面切换前先把原生控件交还给网页、动画结束后再接管，
 *   避免转场中网页和原生两份底栏叠在一起。
 */
import { iosTransitionAnimation, mdTransitionAnimation, type AnimationBuilder } from '@ionic/vue'
import type { PluginListenerHandle } from '@capacitor/core'
import { Foldable, type BarPlacement } from '@erkamyaman/capacitor-foldable'
import { defineNativeUI, enableNativeUI, type NativeUIHandle } from '@rdlabo/capacitor-native-ui'
import { setVerticalBarsLayout, withNativeUITransition } from '@rdlabo/ionic-theme-ios27'
import '@rdlabo/ionic-theme-ios27/dist/css/vertical-bars.css'
import { setVerticalBarsActive } from './native-tab-bar'

const defaultTransition: AnimationBuilder = (baseEl, opts) =>
  (opts?.mode === 'ios' ? iosTransitionAnimation : mdTransitionAnimation)(baseEl, opts)

export const nativeUINavAnimation = withNativeUITransition(defaultTransition)

const promptAccessory = defineNativeUI({
  // 名字必须和 ios/App/App/PromptAccessory.swift 里注册的一致
  name: 'ai-gist.prompt-accessory',
  selector: '[data-prompt-accessory]',
  read(element, context) {
    // 竖条里没有附件栏的位置：返回 null 让两个按钮按各自的 placement="rail" 进竖条
    if (element.closest('ion-app.ios-theme-vertical-bars')) return null

    const readAction = (name: 'primary' | 'secondary') => {
      const button = element.querySelector<HTMLElement>(`[data-accessory-action="${name}"]`)
      const icon = context.image(button?.querySelector('ion-icon') ?? null, { template: true })
      if (!button || !icon) return null
      return {
        button,
        props: {
          label: button.textContent?.trim() ?? '',
          accessibilityLabel: button.getAttribute('aria-label') ?? '',
          icon,
          color: getComputedStyle(button).color
        }
      }
    }

    const primary = readAction('primary')
    const secondary = readAction('secondary')
    // ion-icon 的 SVG 还没加载出来时先留在网页上，加载后 DOM 变化会触发重读
    if (!primary || !secondary) return null
    return {
      props: { primary: primary.props, secondary: secondary.props },
      actions: { primary: primary.button, secondary: secondary.button }
    }
  }
})

const applyBarPlacement = ({ verticalBarEdge, inset }: BarPlacement) => {
  setVerticalBarsLayout({ edge: verticalBarEdge, inset })
  setVerticalBarsActive(verticalBarEdge !== null)
}

const report = (error: unknown) => {
  console.error('[NativeUI] 原生底栏启动或销毁失败，继续使用网页底栏', error)
}

// 启动和销毁都是异步的，串成一条队列，避免开发环境热更新时新旧两个 shell 交错
let lifecycle = Promise.resolve()

/**
 * 在 ion-app 挂载后调用一次，返回值用于在根组件卸载时停止投影。
 */
export function mountIOSNativeUI(): () => void {
  let disposed = false
  let shell: NativeUIHandle | undefined
  let placementListener: PluginListenerHandle | undefined

  const teardown = async () => {
    await placementListener?.remove()
    placementListener = undefined
    await shell?.destroy()
    shell = undefined
  }

  lifecycle = lifecycle
    .then(async () => {
      if (disposed) return
      // 先订阅再读初始值，避免两步之间折叠/展开造成的竖条状态丢失
      placementListener = await Foldable.addListener('barPlacementChange', applyBarPlacement)
      applyBarPlacement(await Foldable.getBarPlacement())
      shell = await enableNativeUI({
        extensions: [promptAccessory],
        controls: {
          tabs: true,
          button: false,
          buttonGroup: false,
          backButton: false,
          segment: false,
          fab: false
        }
      })
      if (disposed) await teardown()
    })
    .catch(report)

  return () => {
    disposed = true
    lifecycle = lifecycle.then(teardown).catch(report)
  }
}
