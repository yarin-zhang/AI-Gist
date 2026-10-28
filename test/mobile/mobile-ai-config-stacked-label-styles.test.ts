import { readFileSync } from 'node:fs'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'

// 背景（回归测试的由来，issue #145）：
// 配置名称 / Base URL / API Key 的标签和输入框曾经挤在同一行，过长的地址或占位符被截断看不全。
// 旧实现靠 ion-input 的 label-placement="stacked"，还踩过一次「属性选择器永远不命中」的坑：
// Vue 给 Ionic 自定义元素传 label-placement 时走 DOM 属性赋值，不会反映成 HTML attribute，
// 所以 ion-input[label-placement="stacked"] 是一段从未生效的死代码，纯文本断言也没拦住它。
//
// V5 移动端改用共享的 .m-field：标签（span/label）独占一行，输入框占满下一行。
// 这里同时做两件事：
// 1. 钉住模板结构——三个字段都在 .m-field 里，标签在输入框之前；
// 2. 把真实的 mobile-v5.css 注入 jsdom，用 getComputedStyle 实测 .m-field 是纵向排列、
//    输入框宽度 100%，而不是只看源码里「写没写对选择器」。

const pageSource = readFileSync(
  'src/renderer/pages/mobile/MobileAIConfigEditPage.vue',
  'utf8'
)
const v5Styles = readFileSync('src/renderer/assets/styles/mobile-v5.css', 'utf8')

describe('mobile AI config stacked field layout (issue #145)', () => {
  let styleEl: HTMLStyleElement

  beforeEach(() => {
    document.documentElement.classList.add('ai-gist-mobile')
    styleEl = document.createElement('style')
    styleEl.textContent = v5Styles
    document.head.appendChild(styleEl)
  })

  afterEach(() => {
    styleEl.remove()
    document.documentElement.classList.remove('ai-gist-mobile')
    document.body.innerHTML = ''
  })

  it('stacks the caption above a full-width input through the shared .m-field style', () => {
    const field = document.createElement('label')
    field.className = 'm-field'
    const caption = document.createElement('span')
    caption.textContent = 'Base URL'
    const input = document.createElement('input')
    field.append(caption, input)
    document.body.appendChild(field)

    expect(getComputedStyle(field).display).toBe('flex')
    expect(getComputedStyle(field).flexDirection).toBe('column')
    expect(getComputedStyle(input).width).toBe('100%')
  })

  it('only applies the stacked layout on the mobile root (no leak into desktop pages)', () => {
    document.documentElement.classList.remove('ai-gist-mobile')
    const field = document.createElement('label')
    field.className = 'm-field'
    document.body.appendChild(field)

    expect(getComputedStyle(field).flexDirection).not.toBe('column')
  })

  it('puts configName / apiKey / baseURL in .m-field groups with the caption before the input', () => {
    expect(pageSource).toMatch(
      /<label class="m-field">\s*<span>\{\{ t\('aiConfig\.configName'\) \}\}<\/span>\s*<input v-model="formData\.name"/
    )
    expect(pageSource).toMatch(
      /<div v-if="needsApiKey" class="m-field">\s*<label for="ai-config-api-key">[\s\S]{0,200}<input id="ai-config-api-key" v-model="formData\.apiKey"/
    )
    expect(pageSource).toMatch(
      /<label v-if="needsBaseURL" class="m-field">\s*<span>\{\{ getBaseURLInfo\.label \}\}<\/span>\s*<input v-model="formData\.baseURL"/
    )
  })

  it('no longer relies on ion-input label placement, and never reintroduces the dead attribute selector', () => {
    expect(pageSource).not.toMatch(/<ion-input\b/)
    expect(pageSource).not.toMatch(/ion-input\[label-placement="stacked"\]\s*\{/)
  })
})

describe('mobile AI config service hint icon and test-connection button style', () => {
  it('prefixes the service description hint with an information icon (not an emoji)', () => {
    expect(pageSource).toContain('informationCircleOutline')
    expect(pageSource).toMatch(/service-description[\s\S]{0,20}>[\s\S]{0,120}informationCircleOutline/)
  })

  it('renders the test-connection action as a secondary (surface) button, not a solid accent block', () => {
    const testButton = pageSource.match(/<button[^>]*@click="handleTestConnection"[^>]*>/)?.[0] ?? ''
    expect(testButton).toMatch(/class="m-cta m-cta-2\b/)
    expect(testButton).not.toContain('expand="block"')
    expect(pageSource).toMatch(/handleTestConnection[\s\S]{0,400}flashOutline/)
    // 测试中显示转圈，且必填项不全时不可点
    expect(testButton).toContain(':disabled="testingConnection || !canTestConnection"')
  })
})
