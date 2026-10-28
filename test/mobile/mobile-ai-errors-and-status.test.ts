/**
 * 移动端 AI 出错说明（#470）、服务商支持范围与连接状态（#472）
 */
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AIConfig } from '@shared/types/ai'

vi.mock('~/lib/api', () => ({ api: { aiConfigs: { test: { mutate: vi.fn() } } } }))

import {
  MobileAIHttpError,
  UnsupportedProviderError,
  describeMobileAIError,
  describeMobileAIFailure,
  isMobileSupportedProvider,
} from '~/components/mobile/prompt/mobile-ai'
import {
  connectionBadgeOf,
  connectionStatuses,
  rememberConnectionStatus,
  statusForConfig,
} from '~/components/mobile/models/connection-status'

// 把 key 和参数原样拼出来，断言用的是哪条文案
const t = (key: string, named?: Record<string, unknown>) => (named ? `${key}${JSON.stringify(named)}` : key)

const OPENAI_401 = JSON.stringify({ error: { message: 'Incorrect API key provided: sk-***.', type: 'invalid_request_error', code: 'invalid_api_key' } })

const makeConfig = (overrides: Partial<AIConfig> = {}): AIConfig => ({
  id: 7,
  configId: 'cfg',
  name: 'OpenAI',
  type: 'openai',
  baseURL: 'https://api.openai.com/v1',
  apiKey: 'sk-test',
  models: ['gpt-4o-mini'],
  defaultModel: 'gpt-4o-mini',
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe('describeMobileAIError（复用共用的 ai-error 归类和文案）', () => {
  it('服务商返回 401：给出原因和处理办法，原始信息只取 error.message 收进详情', () => {
    const view = describeMobileAIError(new MobileAIHttpError(401, OPENAI_401), t)
    expect(view.kind).toBe('auth')
    expect(view.summary).toBe('aiError.auth.title')
    expect(view.hint).toBe('aiError.auth.message')
    expect(view.detail).toContain('HTTP 401')
    expect(view.detail).toContain('Incorrect API key provided')
    expect(view.detail).not.toContain('invalid_request_error')
  })

  it('浏览器的网络层失败归为「连不上服务地址」', () => {
    expect(describeMobileAIError(new TypeError('Failed to fetch'), t).kind).toBe('unreachable')
    expect(describeMobileAIError(new TypeError('Load failed'), t).kind).toBe('unreachable')
  })

  it('手机上没有「本机模型服务」：连不上 localhost 也提示检查地址和网络', () => {
    const view = describeMobileAIError(new Error('connect ECONNREFUSED 127.0.0.1:11434'), t)
    expect(view.kind).toBe('unreachable')
    expect(view.summary).toBe('aiError.unreachable.title')
  })

  it('生成服务的「API 调用失败: 500 …」也能认出状态码', () => {
    expect(describeMobileAIError(new Error('API 调用失败: 500 {"error":{"message":"boom"}}'), t).kind).toBe('server')
    expect(describeMobileAIError(new Error(`API 调用失败: 401 ${OPENAI_401}`), t).kind).toBe('auth')
  })

  it('不支持的服务商用对外名称，而不是小写的内部类型', () => {
    expect(describeMobileAIError(new UnsupportedProviderError('ollama'), t).summary)
      .toBe('mobilePrompt.providerUnsupported{"type":"Ollama"}')
  })

  it('toast 里带上下文：认得的给一句原因，认不出的给原文', () => {
    expect(describeMobileAIFailure('连接失败', '401 Incorrect API key', t))
      .toBe('mobileAI.failedWith{"context":"连接失败","reason":"aiError.auth.title"}')
    expect(describeMobileAIFailure('连接失败', 'odd', t))
      .toBe('mobileAI.failedWith{"context":"连接失败","reason":"odd"}')
    expect(describeMobileAIFailure('连接失败', '', t)).toBe('连接失败')
  })
})

describe('移动端支持的服务商', () => {
  it('Ollama、LM Studio、Azure 只能在桌面版使用', () => {
    for (const type of ['openai', 'deepseek', 'siliconflow', 'tencent', 'aliyun', 'zhipu', 'mistral', 'openrouter', 'anthropic', 'google'] as const) {
      expect(isMobileSupportedProvider(type)).toBe(true)
    }
    for (const type of ['ollama', 'lmstudio', 'azure'] as const) {
      expect(isMobileSupportedProvider(type)).toBe(false)
    }
  })

  it('可选模型只来自支持的服务商；添加面板隐藏其余服务商并说明原因', () => {
    const models = readFileSync('src/renderer/components/mobile/prompt/useMobileModels.ts', 'utf8')
    expect(models).toContain('enabled.filter(config => isMobileSupportedProvider(config.type))')
    const catalog = readFileSync('src/renderer/components/mobile/models/provider-catalog.ts', 'utf8')
    expect(catalog).toMatch(/providers: group\.providers\.filter\(choice => isMobileSupportedProvider\(choice\.type\)\)/)
    const edit = readFileSync('src/renderer/pages/mobile/MobileAIConfigEditPage.vue', 'utf8')
    expect(edit).toContain(':note="desktopOnlyNote"')
  })
})

describe('连接状态（列表、详情、首选卡片共用）', () => {
  beforeEach(() => {
    Object.keys(connectionStatuses).forEach(key => delete connectionStatuses[Number(key)])
    localStorage.clear()
  })

  it('没测试过显示「未验证」，而不是默认「可用」', () => {
    expect(connectionBadgeOf(makeConfig())).toBe('untested')
  })

  it('禁用、仅桌面版、没有模型都有各自的状态', () => {
    expect(connectionBadgeOf(makeConfig({ enabled: false }))).toBe('disabled')
    expect(connectionBadgeOf(makeConfig({ type: 'ollama' }))).toBe('desktopOnly')
    expect(connectionBadgeOf(makeConfig({ models: [], defaultModel: '', customModel: '' }))).toBe('noModel')
  })

  it('测试结果存到本机，重新加载后仍在；改了地址或凭据后失效', async () => {
    const config = makeConfig()
    rememberConnectionStatus(config, { state: 'error', error: '401' })
    expect(connectionBadgeOf(config)).toBe('error')
    expect(JSON.parse(localStorage.getItem('mobile_ai_connection_status') || '{}')[7].state).toBe('error')

    vi.resetModules()
    const reloaded = await import('~/components/mobile/models/connection-status')
    expect(reloaded.connectionBadgeOf(config)).toBe('error')

    expect(statusForConfig(makeConfig({ apiKey: 'sk-new' }))).toBeUndefined()
    expect(connectionBadgeOf(makeConfig({ apiKey: 'sk-new' }))).toBe('untested')
  })

  it('测试失败、0 个模型时不显示「可用」', () => {
    const config = makeConfig({ models: [], defaultModel: '' })
    rememberConnectionStatus(config, { state: 'ok', elapsed: 120 })
    expect(connectionBadgeOf(config)).toBe('noModel')
  })
})

describe('快速优化（#471）', () => {
  it('编辑页读取已启用的动作时会预置默认动作，提示文案不再让人去桌面版', () => {
    const edit = readFileSync('src/renderer/pages/mobile/MobilePromptEditPage.vue', 'utf8')
    expect(edit).toContain('api.quickOptimizationConfigs.getEnabled.query()')
    const api = readFileSync('src/renderer/lib/api/quick-optimization.api.ts', 'utf8')
    expect(api).toMatch(/getEnabled: \{[\s\S]*?ensureDefaultConfigs\(\)/)
    for (const locale of ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'it-IT']) {
      const messages = JSON.parse(readFileSync(`src/renderer/i18n/locales/${locale}.json`, 'utf8'))
      expect(messages.mobilePrompt.quickOptimizeEmpty).not.toMatch(/桌面|desktop|デスクトップ/i)
    }
  })
})
