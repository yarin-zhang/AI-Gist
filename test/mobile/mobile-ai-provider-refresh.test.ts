import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AIGeneratorService } from '../../src/renderer/lib/services/mobile-ai-generator.service'
import { testAIConfig } from '../../src/renderer/lib/services/mobile-ai.service'
import { PlatformDetector } from '@shared/platform'
import type { AIConfig, AIGenerationRequest } from '@shared/types/ai'

function makeConfig(overrides: Partial<AIConfig> = {}): AIConfig {
  return {
    configId: 'cfg-provider-refresh',
    name: 'Provider Refresh',
    type: 'openai',
    baseURL: '',
    apiKey: 'test-key',
    models: [],
    defaultModel: '',
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  }
}

function makeRequest(overrides: Partial<AIGenerationRequest> = {}): AIGenerationRequest {
  return {
    configId: 'cfg-provider-refresh',
    topic: '写一个测试提示词',
    ...overrides
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

describe('mobile AI provider 2026 refresh', () => {
  beforeEach(() => {
    ;(PlatformDetector as any)._platform = null
    vi.stubGlobal('fetch', vi.fn())
  })

  it('uses DashScope compatible-mode endpoint for Aliyun when baseURL is empty', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse({
      choices: [{ message: { content: 'generated prompt' } }]
    }))

    await AIGeneratorService.generatePrompt(
      makeRequest({ model: 'qwen-plus-latest' }),
      makeConfig({ type: 'aliyun', defaultModel: 'qwen-plus-latest' })
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key'
        })
      })
    )

    const [, options] = fetchMock.mock.calls[0]
    expect(JSON.parse(String((options as RequestInit).body)).model).toBe('qwen-plus-latest')
  })

  it('sends OpenRouter attribution headers on mobile direct calls', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse({
      choices: [{ message: { content: 'generated prompt' } }]
    }))

    await AIGeneratorService.generatePrompt(
      makeRequest({ model: 'openai/gpt-5.4-mini' }),
      makeConfig({ type: 'openrouter', defaultModel: 'openai/gpt-5.4-mini' })
    )

    const [, options] = fetchMock.mock.calls[0]
    expect((options as RequestInit).headers).toEqual(expect.objectContaining({
      'HTTP-Referer': 'https://getaigist.com',
      'X-OpenRouter-Title': 'AI Gist',
      'X-Title': 'AI Gist'
    }))
  })

  it('uses the refreshed Gemini fallback model and v1beta endpoint', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse({
      candidates: [{ content: { parts: [{ text: 'generated prompt' }] } }]
    }))

    await AIGeneratorService.generatePrompt(
      makeRequest(),
      makeConfig({ type: 'google' })
    )

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=test-key'
    )
  })

  it('marks Aliyun model discovery as default after validating chat completions', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse({
      choices: [{ message: { content: '' } }]
    }))

    const result = await testAIConfig({
      type: 'aliyun',
      baseURL: '',
      apiKey: 'test-key'
    })

    expect(fetchMock.mock.calls[0][0]).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions')
    expect(result.success).toBe(true)
    expect(result.modelSource).toBe('default')
    expect(result.models).toContain('qwen3.6-flash')
  })

  it('uses the real DeepSeek models endpoint instead of the chat base path', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse({
      data: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }]
    }))

    const result = await testAIConfig({
      type: 'deepseek',
      baseURL: 'https://api.deepseek.com/v1',
      apiKey: 'test-key'
    })

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.deepseek.com/models')
    expect(result.success).toBe(true)
    expect(result.modelSource).toBe('remote')
    expect(result.models).toEqual(['deepseek-chat', 'deepseek-reasoner'])
  })

  it('does not return fake LM Studio models when none are loaded', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }))

    const result = await testAIConfig({
      type: 'lmstudio',
      baseURL: 'http://localhost:1234/v1'
    })

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:1234/v1/models')
    expect(result.success).toBe(true)
    expect(result.modelSource).toBe('unavailable')
    expect(result.models).toEqual([])
  })

  // 回归测试：Gitea issue #62
  // 移动端（iOS，使用 WKWebView/Safari 引擎）下，fetch() 网络层失败
  // （CORS 拦截、DNS 失败、ATS 拦截等）抛出的是 TypeError，但各引擎的
  // message 文案不同：Chrome 是 "Failed to fetch"，Firefox 是
  // "NetworkError when attempting to fetch resource."，而 Safari/WebKit
  // 是 "Type error"（或新版本的 "Load failed"）。
  // 之前的代码只识别了 Chrome/Firefox 的文案，导致 WebKit 抛出的原始
  // "TypeError: Type error" 被当作未知错误直接展示给用户，
  // 这正是「测试连接」在移动端点击后显示 "Type error" 的根本原因。
  // 如果回退到旧实现（只匹配 'Failed to fetch' / 'Network' 子串），
  // 这个测试会失败——因为 error 会变成裸的 "Type error"。
  it('translates a WebKit-style network TypeError into a friendly message instead of leaking "Type error"', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockRejectedValueOnce(new TypeError('Type error'))

    const result = await testAIConfig({
      type: 'deepseek',
      baseURL: 'https://api.deepseek.com',
      apiKey: 'sk-fake-invalid-key'
    })

    expect(result.success).toBe(false)
    expect(result.error).not.toBe('Type error')
    expect(result.error).toBe('无法连接到服务器，请检查 Base URL 和网络连接')
  })

  it('translates the newer Safari "Load failed" network TypeError the same way', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockRejectedValueOnce(new TypeError('Load failed'))

    const result = await testAIConfig({
      type: 'deepseek',
      baseURL: 'https://api.deepseek.com',
      apiKey: 'sk-fake-invalid-key'
    })

    expect(result.success).toBe(false)
    expect(result.error).not.toBe('Load failed')
    expect(result.error).toBe('无法连接到服务器，请检查 Base URL 和网络连接')
  })
})
