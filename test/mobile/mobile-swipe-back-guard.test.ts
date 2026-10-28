/**
 * iOS 边缘右滑返回的未保存保护（Gitea #468）
 *
 * Ionic Vue 的侧滑返回先播放转场、松手后才让路由后退，路由守卫拦不住；
 * useSwipeBackGuard 在页面有未保存内容时把全局配置 swipeBackEnabled 临时关掉，
 * 没有修改、离开页面或页面卸载后恢复原值。这里用一份和 Ionic 同样语义的配置对象验证。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createApp, defineComponent, h, nextTick, ref, type Ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Ionic 页面生命周期：测试里手动触发
const lifecycle = vi.hoisted(() => ({
  willEnter: [] as (() => void)[],
  willLeave: [] as (() => void)[],
}))

vi.mock('@ionic/vue', () => ({
  onIonViewWillEnter: (hook: () => void) => { lifecycle.willEnter.push(hook) },
  onIonViewWillLeave: (hook: () => void) => { lifecycle.willLeave.push(hook) },
}))

import { useSwipeBackGuard } from '~/components/mobile/useSwipeBackGuard'

// 和 @ionic/core 的 Config 一样：值为 undefined 时回退到调用方给的默认值
class FakeIonicConfig {
  private values = new Map<string, unknown>()
  get(key: string, fallback?: unknown) {
    const value = this.values.get(key)
    return value !== undefined ? value : fallback
  }
  set(key: string, value: unknown) {
    this.values.set(key, value)
  }
}

type IonicWindow = Window & { Ionic?: { config?: FakeIonicConfig } }

interface MountedPage {
  dirty: Ref<boolean>
  enter: () => void
  leave: () => void
  unmount: () => void
}

describe('移动端侧滑返回的未保存保护', () => {
  let config: FakeIonicConfig
  const mounted: MountedPage[] = []

  // ion-router-outlet 判断侧滑能否开始时的读法（iOS 模式默认开启）
  const swipeAllowed = () => config.get('swipeBackEnabled', true)

  const mountPage = async (initialDirty = false): Promise<MountedPage> => {
    const dirty = ref(initialDirty)
    const enterStart = lifecycle.willEnter.length
    const leaveStart = lifecycle.willLeave.length
    const container = document.createElement('div')
    document.body.appendChild(container)
    const app = createApp(defineComponent({
      setup() {
        useSwipeBackGuard(dirty)
        return () => h('div')
      },
    }))
    app.mount(container)
    await nextTick()
    const [enter] = lifecycle.willEnter.slice(enterStart)
    const [leave] = lifecycle.willLeave.slice(leaveStart)
    const page: MountedPage = {
      dirty,
      enter,
      leave,
      unmount: () => {
        app.unmount()
        container.remove()
        mounted.splice(mounted.indexOf(page), 1)
      },
    }
    mounted.push(page)
    return page
  }

  beforeEach(() => {
    config = new FakeIonicConfig()
    ;(window as IonicWindow).Ionic = { config }
  })

  afterEach(() => {
    ;[...mounted].forEach(page => page.unmount())
    delete (window as IonicWindow).Ionic
  })

  it('没有修改时不动配置；有未保存内容时关闭侧滑，改回去后恢复 Ionic 默认值', async () => {
    const page = await mountPage()
    expect(config.get('swipeBackEnabled')).toBeUndefined()
    expect(swipeAllowed()).toBe(true)

    page.dirty.value = true
    await nextTick()
    expect(swipeAllowed()).toBe(false)

    page.dirty.value = false
    await nextTick()
    expect(config.get('swipeBackEnabled')).toBeUndefined()
    expect(swipeAllowed()).toBe(true)
  })

  it('恢复的是关闭前的原值，不会把显式关闭的侧滑打开', async () => {
    config.set('swipeBackEnabled', false)
    const page = await mountPage(true)
    expect(swipeAllowed()).toBe(false)
    page.dirty.value = false
    await nextTick()
    expect(config.get('swipeBackEnabled')).toBe(false)
  })

  it('只拦前台页面：进入下一页后由下一页决定，返回后重新生效', async () => {
    const generator = await mountPage(true)
    expect(swipeAllowed()).toBe(false)

    // 生成页 → 新建页：生成页离开前台，没改动的新建页可以侧滑
    generator.leave()
    const create = await mountPage(false)
    expect(swipeAllowed()).toBe(true)

    // 从新建页回到生成页：生成页的结果仍未保存
    create.unmount()
    generator.enter()
    expect(swipeAllowed()).toBe(false)
  })

  it('转场时新旧两页的生命周期交错，也不会被后到的一方误恢复', async () => {
    const first = await mountPage(true)
    const second = await mountPage(true)
    first.leave()
    expect(swipeAllowed()).toBe(false)
    second.dirty.value = false
    await nextTick()
    expect(swipeAllowed()).toBe(true)
  })

  it('页面带着未保存内容卸载时恢复侧滑', async () => {
    const page = await mountPage(true)
    expect(swipeAllowed()).toBe(false)
    page.unmount()
    expect(swipeAllowed()).toBe(true)
  })

  it('没有 Ionic 全局配置时什么也不做', async () => {
    delete (window as IonicWindow).Ionic
    const page = await mountPage()
    page.dirty.value = true
    await expect(nextTick()).resolves.toBeUndefined()
  })
})

describe('四个编辑类页面都接上了侧滑保护，条件和「取消 / 返回」的确认一致', () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

  it.each([
    ['src/renderer/pages/mobile/MobilePromptEditPage.vue', 'useSwipeBackGuard(dirty)', 'if (dirty.value) {'],
    ['src/renderer/pages/mobile/MobileAIGeneratorPage.vue', 'useSwipeBackGuard(hasUnsavedResult)', 'if (!hasUnsavedResult()) return true'],
    ['src/renderer/pages/mobile/MobileSystemPromptEditPage.vue', 'useSwipeBackGuard(isDirty)', 'if (isDirty.value) {'],
    ['src/renderer/pages/mobile/MobileAIConfigEditPage.vue', 'useSwipeBackGuard(isDirty)', 'if (isDirty.value) {'],
  ])('%s', (path, guardCall, confirmCondition) => {
    const source = read(path)
    expect(source).toContain("import { useSwipeBackGuard } from '~/components/mobile/useSwipeBackGuard'")
    expect(source).toContain(guardCall)
    expect(source).toContain(confirmCondition)
  })
})
