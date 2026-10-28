/**
 * iOS 边缘右滑返回的未保存保护
 *
 * Ionic Vue 的侧滑返回由 ion-router-outlet 自己驱动：手指一动就把上一页拉出来播放转场，
 * 松手后才让路由后退。这时候再用路由守卫（onBeforeRouteLeave）拦已经晚了——上一页已经
 * 显示出来，路由却停在原地。所以这里不拦导航，而是在页面有未保存内容时直接关掉侧滑手势：
 * outlet 每次判断手势能否开始都会读全局配置 swipeBackEnabled，临时设成 false 就不会触发。
 * 用户只能点页面上的「取消 / 返回」，走和按钮、Android 返回键一样的确认流程；
 * 没有修改时恢复原值，侧滑照常可用。
 */
import { onMounted, onUnmounted, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { onIonViewWillEnter, onIonViewWillLeave } from '@ionic/vue'

interface IonicConfigLike {
  get(key: string, fallback?: unknown): unknown
  set(key: string, value: unknown): void
}

const SWIPE_BACK_KEY = 'swipeBackEnabled'

// 当前要求关闭侧滑的页面。转场时新旧两页的生命周期会交错，用集合记录，谁先谁后都不影响结果
const blockers = new Set<symbol>()
// 关闭前的原值：没设置过时是 undefined，Ionic 会按模式取默认值（iOS 开、Android 关）
let savedValue: unknown
let overridden = false

const getIonicConfig = (): IonicConfigLike | null => {
  const config = (window as Window & { Ionic?: { config?: IonicConfigLike } }).Ionic?.config
  return config && typeof config.set === 'function' ? config : null
}

const applySwipeBack = () => {
  const config = getIonicConfig()
  if (!config) return
  if (blockers.size > 0) {
    if (!overridden) {
      savedValue = config.get(SWIPE_BACK_KEY)
      overridden = true
    }
    config.set(SWIPE_BACK_KEY, false)
  } else if (overridden) {
    config.set(SWIPE_BACK_KEY, savedValue)
    savedValue = undefined
    overridden = false
  }
}

/**
 * 页面有未保存内容时禁止侧滑返回。
 * `hasUnsavedChanges` 要和页面「取消 / 返回」判断是否弹确认的条件一致。
 * 只在页面处于前台时生效：从这页再进入下一页（例如生成页 → 新建页）后，能否侧滑由下一页自己决定。
 */
export function useSwipeBackGuard(hasUnsavedChanges: MaybeRefOrGetter<boolean>) {
  const token = Symbol('swipe-back-guard')
  let active = false

  const update = () => {
    if (active && toValue(hasUnsavedChanges)) blockers.add(token)
    else blockers.delete(token)
    applySwipeBack()
  }

  const setActive = (value: boolean) => {
    active = value
    update()
  }

  watch(() => toValue(hasUnsavedChanges), update)
  onMounted(() => setActive(true))
  onIonViewWillEnter(() => setActive(true))
  onIonViewWillLeave(() => setActive(false))
  onUnmounted(() => setActive(false))
}
