/**
 * iOS 原生底栏接入，只在 supportsNativeTabBar() 为真时由 setup-ionic.ts / App.vue
 * 动态加载，Android、Web 和旧版 iOS 的包里不会带上这些依赖。
 *
 * - enableNativeUI：把 MobileMainPage 里的 ion-tab-bar 投影成原生控件。只打开 tabs，
 *   顶部工具栏按钮、FAB、分段控件仍按移动端现有的视觉规范走网页渲染。
 * - Foldable + setVerticalBarsLayout：iPhone Duo 把底栏放进侧边竖条时，给 ion-app
 *   加上 .ios-theme-vertical-bars，由 vertical-bars.css 给 ion-content / ion-toolbar
 *   让出竖条宽度；浮动入口条的让位规则在 mobile.css 里。
 * - nativeUINavAnimation：页面切换前先把原生控件交还给网页、动画结束后再接管，
 *   避免转场中网页和原生两份底栏叠在一起。
 */
import { iosTransitionAnimation, mdTransitionAnimation, type AnimationBuilder } from '@ionic/vue'
import type { PluginListenerHandle } from '@capacitor/core'
import { Foldable, type BarPlacement } from '@erkamyaman/capacitor-foldable'
import { enableNativeUI, type NativeUIHandle } from '@rdlabo/capacitor-native-ui'
import { setVerticalBarsLayout, withNativeUITransition } from '@rdlabo/ionic-theme-ios27'
import '@rdlabo/ionic-theme-ios27/dist/css/vertical-bars.css'

const defaultTransition: AnimationBuilder = (baseEl, opts) =>
  (opts?.mode === 'ios' ? iosTransitionAnimation : mdTransitionAnimation)(baseEl, opts)

export const nativeUINavAnimation = withNativeUITransition(defaultTransition)

const applyBarPlacement = ({ verticalBarEdge, inset }: BarPlacement) => {
  setVerticalBarsLayout({ edge: verticalBarEdge, inset })
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
