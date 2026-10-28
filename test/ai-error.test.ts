import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '../src/renderer/i18n'
import {
  AIRequestTimeoutError,
  classifyAIError,
  describeAIError,
  extractAIErrorDetail,
  isLocalAIConfig,
  withAIRequestTimeout,
} from '../src/renderer/lib/utils/ai-error'

const LOCALES = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'it-IT'] as const
const HAN = /[一-鿿]/
const t = (key: string, named?: Record<string, unknown>) => (i18n.global.t as any)(key, named ?? {}) as string

describe('classifyAIError (#422)', () => {
  it.each([
    ['AI 请求失败（HTTP 401）：{"error":{"message":"Incorrect API key provided: sk-test-1234567890abcdef","type":"invalid_request_error","code":"invalid_api_key"}}', 'auth'],
    ['Request failed with status code 401: Incorrect API key provided: sk-test-****', 'auth'],
    ['API Key 无效或已过期', 'auth'],
    ['OpenAI API Key 不能为空', 'auth'],
    ['AI 请求失败（HTTP 429）：You exceeded your current quota, please check your plan and billing details.', 'quota'],
    ['DeepSeek 请求失败（HTTP 402）：Insufficient Balance', 'quota'],
    ['Rate limit reached for gpt-4.1 in organization org-xxx on tokens per min (TPM)', 'rateLimit'],
    ['AI 请求失败（HTTP 429）：Too Many Requests', 'rateLimit'],
    ['The model `gpt-5-turbo` does not exist or you do not have access to it.', 'model'],
    ['Ollama 请求失败（HTTP 404）：model "llama9" not found, try pulling it first', 'model'],
    ['AI 请求失败（HTTP 404）：<html><body><h1>404 Not Found</h1></body></html>', 'endpoint'],
    ['Unexpected token < in JSON at position 0', 'endpoint'],
    ['fetch failed (ENOTFOUND)', 'unreachable'],
    ['Failed to fetch', 'unreachable'],
    ['无法连接到服务器，请检查网络连接', 'unreachable'],
    ['AI 请求失败（HTTP 500）：Internal Server Error', 'server'],
    ['Anthropic 请求失败（HTTP 529）：Overloaded', 'server'],
    ['Request timed out after 45s', 'timeout'],
    ['生成超时，请检查网络连接或服务状态', 'timeout'],
    ['something odd happened', 'generic'],
  ])('%s → %s', (raw, kind) => {
    expect(classifyAIError(raw)).toBe(kind)
  })

  it('treats a refused connection to a local service as "service not running"', () => {
    expect(classifyAIError('fetch failed (ECONNREFUSED)', { local: true })).toBe('localService')
    expect(classifyAIError('fetch failed (ECONNREFUSED)')).toBe('unreachable')
    expect(classifyAIError('connect ECONNREFUSED 127.0.0.1:11434')).toBe('localService')
  })

  it('recognizes the timeout error object itself', () => {
    expect(classifyAIError(new AIRequestTimeoutError(45_000))).toBe('timeout')
  })
})

describe('extractAIErrorDetail', () => {
  it('reads the provider message out of a JSON body and keeps the HTTP status', () => {
    const detail = extractAIErrorDetail('AI 请求失败（HTTP 401）：{"error":{"message":"Incorrect API key provided","type":"invalid_request_error"}}')
    expect(detail).toBe('HTTP 401 · Incorrect API key provided')
  })

  it('turns an HTML error page into its title', () => {
    expect(extractAIErrorDetail('AI 请求失败（HTTP 404）：<html><head><title>404 Not Found</title></head><body><h1>404 Not Found</h1></body></html>'))
      .toBe('404 Not Found')
  })

  it('drops the Chinese wrappers added by the backend and the main process', () => {
    expect(extractAIErrorDetail('❌ 模型 gpt-4o 测试失败: Connection error.')).toBe('Connection error.')
    expect(extractAIErrorDetail('Web AI 后端请求失败（HTTP 502）')).toBe('HTTP 502')
  })

  it('hides keys that leak into error messages', () => {
    const detail = extractAIErrorDetail('Incorrect API key provided: sk-proj-abcdefghijklmnop1234. Authorization: Bearer abcdefghijklmnop')
    expect(detail).not.toContain('abcdefghijklmnop')
    expect(detail).toContain('sk-proj-****')
  })
})

describe('describeAIError', () => {
  afterEach(() => { i18n.global.locale.value = 'zh-CN' })

  it('explains every kind in all five locales without leaking Chinese into the others', () => {
    const samples = ['401 Unauthorized', 'HTTP 402', 'HTTP 429', 'fetch failed (ENOTFOUND)', 'Request timed out after 45s',
      'model not found', 'HTTP 404', 'HTTP 500', 'boom']
    for (const locale of LOCALES) {
      i18n.global.locale.value = locale
      for (const sample of samples) {
        const diagnosis = describeAIError(sample, {}, t)
        expect(diagnosis.title).not.toMatch(/^aiError\./)
        expect(diagnosis.message).not.toMatch(/^aiError\./)
        if (!locale.startsWith('zh') && locale !== 'ja-JP') {
          expect(diagnosis.title).not.toMatch(HAN)
          expect(diagnosis.message).not.toMatch(HAN)
        }
      }
      const local = describeAIError('fetch failed (ECONNREFUSED)', { local: true }, t)
      expect(local.kind).toBe('localService')
      expect(local.message).toContain('Ollama')
    }
  })

  it('keeps the raw message as a secondary detail', () => {
    const diagnosis = describeAIError(new Error('fetch failed (ENOTFOUND)'), {}, t)
    expect(diagnosis.kind).toBe('unreachable')
    expect(diagnosis.detail).toBe('fetch failed (ENOTFOUND)')
    expect(diagnosis.retryable).toBe(true)
    expect(describeAIError('HTTP 401', {}, t).retryable).toBe(false)
  })
})

describe('withAIRequestTimeout', () => {
  afterEach(() => { vi.useRealTimers() })

  it('rejects with a timeout error when the request hangs', async () => {
    vi.useFakeTimers()
    const pending = withAIRequestTimeout(new Promise(() => undefined), 45_000)
    const assertion = expect(pending).rejects.toBeInstanceOf(AIRequestTimeoutError)
    await vi.advanceTimersByTimeAsync(45_000)
    await assertion
  })

  it('passes through results that arrive in time', async () => {
    await expect(withAIRequestTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok')
  })
})

describe('isLocalAIConfig', () => {
  it('detects local providers and localhost addresses', () => {
    expect(isLocalAIConfig({ type: 'ollama', baseURL: '' })).toBe(true)
    expect(isLocalAIConfig({ type: 'openai', baseURL: 'http://127.0.0.1:8000/v1' })).toBe(true)
    expect(isLocalAIConfig({ type: 'openai', baseURL: 'http://localhost:1234/v1' })).toBe(true)
    expect(isLocalAIConfig({ type: 'openai', baseURL: 'https://api.openai.com/v1' })).toBe(false)
  })
})
