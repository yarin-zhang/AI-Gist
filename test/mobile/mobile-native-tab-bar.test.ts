/**
 * iOS 原生底栏接入测试
 *
 * iOS 26+ 上标签栏由 @rdlabo/capacitor-native-ui 投影成系统 UITabBar，iPhone Duo
 * 上再进一步进入系统侧边竖条。插件对网页侧的标记有几条硬性要求，任何一条被
 * 改坏都会静默退回网页底栏，lint 和类型检查都发现不了，所以在这里锁住：
 * - ion-tab-bar 必须是 ion-tabs 的直接子元素，并且自己带 slot="bottom"
 *   （插件按 slot 决定贴底还是贴顶，竖条样式只认 `ion-tabs > ion-tab-bar`）；
 * - 收起态不能用动态 class（IonTabBar 透传 class，Vue 覆写 className 会抹掉
 *   Stencil 的 hydrated 等 class），也不能在系统底栏上触发尺寸过渡。
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { supportsNativeTabBar } from '~/lib/mobile/native-tab-bar'

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

describe('MobileMainPage 标签栏标记', () => {
  const page = readFileSync(resolve(process.cwd(), 'src/renderer/pages/MobileMainPage.vue'), 'utf8')
  const template = page.slice(page.indexOf('<template>'), page.indexOf('<script'))

  it('ion-tab-bar 是 ion-tabs 的直接子元素并自带 slot="bottom"', () => {
    const tabBar = template.match(/<ion-tab-bar\b[^>]*>/)?.[0] ?? ''
    expect(tabBar).toContain('slot="bottom"')

    // 标签栏之前的同级元素都必须已经闭合：只剩 ion-tabs 一层未闭合的祖先
    const before = template.slice(template.indexOf('<ion-tabs>') + '<ion-tabs>'.length, template.indexOf('<ion-tab-bar'))
    const opened = (before.match(/<div\b/g) ?? []).length
    const closed = (before.match(/<\/div>/g) ?? []).length
    expect(opened).toBe(closed)
  })

  it('收起态用 data 属性，不在 ion-tab-bar 上绑定动态 class', () => {
    const tabBar = template.match(/<ion-tab-bar\b[^>]*>/)?.[0] ?? ''
    expect(tabBar).not.toMatch(/:class=/)
    expect(tabBar).toContain(':data-nav-minimized="isNavMinimized && !isNativeTabBar ? \'true\' : undefined"')
  })
})

describe('系统底栏的样式约束', () => {
  const styles = readFileSync(resolve(process.cwd(), 'src/renderer/assets/styles/mobile.css'), 'utf8')

  it('系统底栏模式下关闭 ion-tab-bar 的过渡', () => {
    const rule = styles.match(/html\.ai-gist-mobile\.ai-gist-native-tabs ion-tab-bar,[^{]*\{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toContain('transition: none')
  })

  it('网页底栏的收起只认 data 属性', () => {
    expect(styles).toContain('html.ai-gist-mobile ion-tab-bar[data-nav-minimized] {')
    expect(styles).not.toContain('.mobile-floating-nav--minimized ion-tab-bar')
  })

  it('左右安全区分开处理，不把一侧的 inset 套到两侧', () => {
    expect(styles).toContain('--mobile-nav-inset-left: max(var(--mobile-nav-gutter), env(safe-area-inset-left, 0px));')
    expect(styles).toContain('--mobile-nav-inset-right: max(var(--mobile-nav-gutter), env(safe-area-inset-right, 0px));')
    expect(styles).toMatch(/ion-content::part\(scroll\) \{\s*padding-left: calc\(var\(--padding-start, 0px\) \+ env\(safe-area-inset-left, 0px\)\);\s*padding-right: calc\(var\(--padding-end, 0px\) \+ env\(safe-area-inset-right, 0px\)\);/)
  })
})
