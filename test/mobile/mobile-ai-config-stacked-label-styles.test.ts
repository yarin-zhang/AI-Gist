import { readFileSync } from 'node:fs'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'

// 背景（回归测试的由来）：
// 之前的实现给 stacked 输入框写了属性选择器 `ion-item ion-input[label-placement="stacked"]`。
// 但 Vue 给 Ionic 自定义元素传 `label-placement="stacked"` 这个 prop 时，走的是 DOM 属性
// 赋值（`el.labelPlacement = 'stacked'`），不会反映成真实的 HTML attribute——所以
// `input.hasAttribute('label-placement')` 始终是 false，属性选择器永远不会命中，是一段
// "语法正确但从未生效"的死代码。视觉上看起来没问题，纯粹是 Ionic 自己给渲染后的元素挂的
// `input-label-placement-stacked` class 内置间距凑巧够用，跟这条自定义 CSS 毫无关系。
// 之前的测试（mobile-ai-config-default / mobile-ai-config-openai-v1 / ai-config-workspace-
// regressions）全部是纯文本正则匹配，不会真的把 CSS 应用到 DOM 上计算样式，所以这个死代码
// bug 没有被任何自动化测试拦下来。
//
// 这个测试文件直接把源文件里 <style scoped> 的真实 CSS 文本注入 jsdom，再用
// getComputedStyle 实测计算结果，而不是只检查源码文本里"写没写对选择器"——
// 这样如果未来又有人把选择器改回属性选择器（或者改错成别的不会命中的写法），
// 这里会用真实的 CSS 匹配失败并报错，而不是像上次一样被"看起来没问题"糊弄过去。

const pageSource = readFileSync(
  'src/renderer/pages/mobile/MobileAIConfigEditPage.vue',
  'utf8'
)

const extractScopedStyle = (source: string): string => {
  const match = source.match(/<style scoped>([\s\S]*?)<\/style>/)
  if (!match) {
    throw new Error('未找到 <style scoped> 区块，页面结构可能已变化')
  }
  return match[1]
}

describe('mobile AI config stacked-label input spacing (regression for the dead attribute-selector bug)', () => {
  let styleEl: HTMLStyleElement

  beforeEach(() => {
    styleEl = document.createElement('style')
    styleEl.textContent = extractScopedStyle(pageSource)
    document.head.appendChild(styleEl)
  })

  afterEach(() => {
    styleEl.remove()
    document.body.innerHTML = ''
  })

  it('applies --padding-top/--padding-bottom via the real "input-label-placement-stacked" class Ionic renders', () => {
    // 复刻 Ionic 在真实浏览器里对 label-placement="stacked" 的 ion-input 渲染出的
    // class（用浏览器实测确认过：hasAttribute('label-placement') 是 false，
    // 但 classList 里真实存在 'input-label-placement-stacked'）。
    const item = document.createElement('ion-item')
    const input = document.createElement('ion-input')
    input.classList.add('input-label-placement-stacked')
    item.appendChild(input)
    document.body.appendChild(item)

    const computed = getComputedStyle(input)
    expect(computed.getPropertyValue('--padding-top').trim()).toBe('10px')
    expect(computed.getPropertyValue('--padding-bottom').trim()).toBe('10px')
  })

  it('does NOT apply the stacked padding when only the HTML attribute is set without the class (reproduces the original bug scenario)', () => {
    // 这是导致上次 bug 的真实场景：只有 label-placement="stacked" 这个 HTML 属性，
    // 没有 input-label-placement-stacked 这个 class（对应 Vue 用 DOM 属性赋值、
    // 不反映成 HTML attribute 的行为）。如果选择器又被写回属性选择器，这里就会
    // 变成 10px 从而测试失败。
    const item = document.createElement('ion-item')
    const input = document.createElement('ion-input')
    input.setAttribute('label-placement', 'stacked')
    item.appendChild(input)
    document.body.appendChild(item)

    const computed = getComputedStyle(input)
    expect(computed.getPropertyValue('--padding-top').trim()).not.toBe('10px')
    expect(computed.getPropertyValue('--padding-bottom').trim()).not.toBe('10px')
  })

  it('does not leak the stacked padding onto inputs without the class (e.g. the inline "customModel" field)', () => {
    const item = document.createElement('ion-item')
    const input = document.createElement('ion-input')
    // 不加 input-label-placement-stacked class，模拟模型配置区里仍保持内联标签的
    // 「自定义模型」输入框。
    item.appendChild(input)
    document.body.appendChild(item)

    const computed = getComputedStyle(input)
    expect(computed.getPropertyValue('--padding-top').trim()).not.toBe('10px')
    expect(computed.getPropertyValue('--padding-bottom').trim()).not.toBe('10px')
  })

  it('marks configName / baseURL / apiKey inputs with label-placement="stacked" in the template', () => {
    expect(pageSource).toMatch(/v-model="formData\.name"[\s\S]{0,80}label-placement="stacked"/)
    expect(pageSource).toMatch(/v-model="formData\.baseURL"[\s\S]{0,80}label-placement="stacked"/)
    expect(pageSource).toMatch(/v-model="formData\.apiKey"[\s\S]{0,80}label-placement="stacked"/)
  })

  it('never reintroduces the dead [label-placement="stacked"] attribute selector', () => {
    // 用「选择器 + 紧跟着的 { 」匹配真正生效的 CSS 规则，避免命中解释性注释里
    // 提到的同一段文字（注释里没有紧跟 { ，不会误报）。
    expect(pageSource).not.toMatch(/ion-input\[label-placement="stacked"\]\s*\{/)
    expect(pageSource).toContain('ion-item ion-input.input-label-placement-stacked')
  })
})

describe('mobile AI config service hint icon and test-connection button style', () => {
  it('prefixes the service description hint with an information icon (not an emoji)', () => {
    expect(pageSource).toContain('informationCircleOutline')
    expect(pageSource).toMatch(/service-description[\s\S]{0,20}>[\s\S]{0,120}informationCircleOutline/)
  })

  it('renders the test-connection action as an iOS list-row item, not a full-width solid button', () => {
    expect(pageSource).toMatch(/button\s+:detail="false"[\s\S]{0,200}@click="handleTestConnection"/)
    expect(pageSource).toMatch(/handleTestConnection[\s\S]{0,400}flashOutline/)
    // 不应该再回退成撑满宽度的纯色块状按钮
    expect(pageSource).not.toMatch(/expand="block"[\s\S]{0,120}handleTestConnection/)
  })
})
