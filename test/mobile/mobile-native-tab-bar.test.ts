/**
 * iOS 原生底栏接入测试
 *
 * iOS 26+ 上标签栏由 @rdlabo/capacitor-native-ui 投影成系统 UITabBar，iPhone Duo
 * 上再进一步进入系统侧边竖条。插件对网页侧的标记有几条硬性要求，任何一条被
 * 改坏都会静默退回网页底栏，lint 和类型检查都发现不了，所以在这里锁住：
 * - ion-tab-bar 必须是 ion-tabs 的直接子元素，并且自己带 slot="bottom"
 *   （插件按 slot 决定贴底还是贴顶，竖条样式只认 `ion-tabs > ion-tab-bar`）；
 * - 收起态不能用动态 class（IonTabBar 透传 class，Vue 覆写 className 会抹掉
 *   Stencil 的 hydrated 等 class），也不能在系统底栏上触发尺寸过渡；
 * - 附件栏里的两个按钮和搜索按钮必须显式声明 data-native-ui="button"，竖条
 *   出现时 placement 换成 rail，平时保持 element（rail 按钮在没有原生竖条时不投影）；
 * - 附件栏的扩展名在 TypeScript 读取器和 Swift 注册两边必须一致，否则留在网页上。
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { isVerticalBarsActive, setVerticalBarsActive, supportsNativeTabBar } from '~/lib/mobile/native-tab-bar'
import {
  hasPendingPromptSearch,
  requestPromptSearch,
  takePromptSearchRequest
} from '~/lib/mobile/prompt-search-request'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

const css = (supported: string[]) => ({
  supports: (condition: string) => supported.includes(condition)
})

describe('supportsNativeTabBar — 是否把底栏交给系统', () => {
  it('iOS 26 的 WebKit（支持 text-wrap: pretty）启用', () => {
    expect(supportsNativeTabBar('ios', css(['text-wrap: pretty']))).toBe(true)
  })

  it('iOS 27 的 WebKit（支持 overflow-anchor）启用', () => {
    expect(supportsNativeTabBar('ios', css(['text-wrap: pretty', 'overflow-anchor: auto']))).toBe(true)
    expect(supportsNativeTabBar('ios', css(['overflow-anchor: auto']))).toBe(true)
  })

  it('iOS 25 及更早继续使用网页底栏', () => {
    expect(supportsNativeTabBar('ios', css([]))).toBe(false)
  })

  it('Android 和 Web 即使支持同样的 CSS 特性也不启用', () => {
    const modern = css(['text-wrap: pretty', 'overflow-anchor: auto'])
    expect(supportsNativeTabBar('android', modern)).toBe(false)
    expect(supportsNativeTabBar('web', modern)).toBe(false)
  })

  it('没有 CSS.supports 时不启用', () => {
    expect(supportsNativeTabBar('ios', undefined)).toBe(false)
  })
})

describe('isVerticalBarsActive — 系统底栏是否在侧边竖条里', () => {
  afterEach(() => setVerticalBarsActive(false))

  it('默认不在竖条里，由 setVerticalBarsActive 切换', () => {
    expect(isVerticalBarsActive.value).toBe(false)
    setVerticalBarsActive(true)
    expect(isVerticalBarsActive.value).toBe(true)
    setVerticalBarsActive(false)
    expect(isVerticalBarsActive.value).toBe(false)
  })
})

describe('底栏搜索请求', () => {
  afterEach(() => takePromptSearchRequest())

  it('请求只能被取走一次', () => {
    expect(hasPendingPromptSearch.value).toBe(false)
    requestPromptSearch()
    expect(hasPendingPromptSearch.value).toBe(true)
    expect(takePromptSearchRequest()).toBe(true)
    expect(hasPendingPromptSearch.value).toBe(false)
    expect(takePromptSearchRequest()).toBe(false)
  })
})

describe('MobileMainPage 底栏标记', () => {
  const page = source('src/renderer/pages/MobileMainPage.vue')
  const template = page.slice(page.indexOf('<template>'), page.indexOf('<script'))

  it('ion-tab-bar 是 ion-tabs 的直接子元素并自带 slot="bottom"，原生底栏贴左', () => {
    const tabBar = template.match(/<ion-tab-bar\b[^>]*>/)?.[0] ?? ''
    expect(tabBar).toContain('slot="bottom"')
    expect(tabBar).toContain('class="tab-bar-position-start"')

    // 标签栏之前的同级元素都必须已经闭合：只剩 ion-tabs 一层未闭合的祖先
    const before = template.slice(template.indexOf('<ion-tabs>') + '<ion-tabs>'.length, template.indexOf('<ion-tab-bar'))
    const opened = (before.match(/<div\b/g) ?? []).length
    const closed = (before.match(/<\/div>/g) ?? []).length
    expect(opened).toBe(closed)
  })

  it('收起态用 data 属性，不在 ion-tab-bar 上绑定动态 class', () => {
    const tabBar = template.match(/<ion-tab-bar\b[^>]*>/)?.[0] ?? ''
    expect(tabBar).not.toMatch(/:class=/)
    expect(tabBar).toContain(':data-nav-minimized="isNavMinimized ? \'true\' : undefined"')
  })

  it('系统底栏模式下不监听滚动，底栏和入口条都不会收起', () => {
    const script = page.slice(page.indexOf('<script'))
    expect(script).toMatch(/if \(!isNativeTabBar\) \{\s*document\.addEventListener\('ionScroll'/)
  })

  it('附件栏和搜索按钮都声明为原生按钮，并按竖条状态切换 placement', () => {
    const accessory = template.slice(template.indexOf('class="mobile-tab-accessory"'), template.indexOf('<ion-tab-bar'))
    const accessoryButtons = accessory.match(/<button\b[^>]*>/g) ?? []
    expect(accessoryButtons).toHaveLength(2)
    expect(accessoryButtons[0]).toContain('data-accessory-action="primary"')
    expect(accessoryButtons[1]).toContain('data-accessory-action="secondary"')

    const search = template.match(/<button\b[^>]*class="mobile-tab-search"[^>]*>/)?.[0] ?? ''
    expect(search).toContain('slot="bottom"')

    for (const button of [...accessoryButtons, search]) {
      expect(button).toContain('type="button"')
      expect(button).toContain('data-native-ui="button"')
      expect(button).toContain(':data-native-ui-placement="nativeActionPlacement"')
      expect(button).toContain(':aria-label=')
    }
    expect(page).toContain("const nativeActionPlacement = computed(() => (isVerticalBarsActive.value ? 'rail' : 'element'))")
  })

  it('附件栏的扩展名和 Swift 注册的一致', () => {
    const reader = source('src/renderer/lib/mobile/ios-native-ui.ts')
    const swift = source('ios/App/App/PromptAccessory.swift')
    const name = reader.match(/name: '([^']+)'/)?.[1]
    expect(name).toBeTruthy()
    expect(swift).toContain(`static let name = "${name}"`)
    expect(reader).toContain("selector: '[data-prompt-accessory]'")
    expect(template).toMatch(/class="mobile-tab-accessory"\s+data-prompt-accessory/)
    expect(source('ios/App/App/AppDelegate.swift')).toContain('try PromptAccessory.register()')
    expect(source('ios/App/App.xcodeproj/project.pbxproj')).toContain('PromptAccessory.swift in Sources')
  })
})

describe('系统底栏的样式约束', () => {
  const styles = source('src/renderer/assets/styles/mobile.css')
  const rule = (selector: string) => {
    const start = styles.indexOf(`${selector} {`)
    return start === -1 ? '' : styles.slice(start, styles.indexOf('}', start))
  }

  it('系统底栏模式下关闭标签栏、附件栏和搜索按钮的过渡', () => {
    const match = styles.match(/(html\.ai-gist-mobile\.ai-gist-native-tabs ion-tab-bar,[^{]*)\{([^}]*)\}/)
    const selectors = match?.[1] ?? ''
    expect(match?.[2] ?? '').toContain('transition: none')
    for (const target of ['.mobile-tab-accessory', '.mobile-tab-search']) {
      expect(selectors).toContain(`html.ai-gist-mobile.ai-gist-native-tabs ${target}`)
    }
  })

  it('网页底栏的收起只认 data 属性', () => {
    expect(styles).toContain('html.ai-gist-mobile ion-tab-bar[data-nav-minimized] {')
    expect(styles).toContain('html.ai-gist-mobile .mobile-tab-search[data-nav-minimized],')
    expect(styles).not.toContain('.mobile-floating-nav')
  })

  it('附件栏和「标签栏 + 搜索按钮」这一行左右卡在同一对 inset 上', () => {
    const accessory = rule('html.ai-gist-mobile .mobile-tab-accessory')
    expect(accessory).toContain('left: var(--mobile-nav-inset-left);')
    expect(accessory).toContain('right: var(--mobile-nav-inset-right);')

    const tabBar = rule('html.ai-gist-mobile ion-tab-bar')
    expect(tabBar).toContain('left: var(--mobile-nav-inset-left);')
    expect(tabBar).toMatch(/width: calc\(\s*100% - var\(--mobile-nav-inset-left\) - var\(--mobile-nav-inset-right\) -\s*var\(--mobile-nav-tabbar-outer-height\) - var\(--mobile-nav-item-gap\)/)

    const search = rule('html.ai-gist-mobile .mobile-tab-search')
    expect(search).toContain('right: var(--mobile-nav-inset-right);')
    expect(search).toContain('width: var(--mobile-nav-tabbar-outer-height);')
  })

  it('左右安全区分开处理，不把一侧的 inset 套到两侧', () => {
    expect(styles).toContain('--mobile-nav-inset-left: max(var(--mobile-nav-gutter), env(safe-area-inset-left, 0px));')
    expect(styles).toContain('--mobile-nav-inset-right: max(var(--mobile-nav-gutter), env(safe-area-inset-right, 0px));')
    expect(styles).toMatch(/ion-content::part\(scroll\) \{\s*padding-left: calc\(var\(--padding-start, 0px\) \+ env\(safe-area-inset-left, 0px\)\);\s*padding-right: calc\(var\(--padding-end, 0px\) \+ env\(safe-area-inset-right, 0px\)\);/)
  })
})
