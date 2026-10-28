import { beforeEach, describe, expect, it, vi } from 'vitest'
import { webAIService } from '../../src/renderer/lib/services/web-ai.service'
import { GenerationStoppedError } from '../../src/renderer/lib/utils/ai-request'
import type { AIConfig, AIGenerationRequest } from '../../src/shared/types/ai'

const config: AIConfig = {
  configId: 'web-ai-test',
  name: 'Web AI Test',
  type: 'openai',
  baseURL: 'https://example.test/v1',
  apiKey: 'test-key',
  models: ['test-model'],
  defaultModel: 'test-model',
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date()
}

const request: AIGenerationRequest = {
  configId: 'web-ai-test',
  model: 'test-model',
  topic: '写一个测试提示词'
}

function createStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      lines.forEach(line => controller.enqueue(encoder.encode(line)))
      controller.close()
    }
  })
}

describe('WebAIService streaming generation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('emits progress events before returning the final result', async () => {
    const fetchMock = vi.fn(async () => new Response(createStream([
      JSON.stringify({ type: 'progress', charCount: 2, partialContent: '你好' }) + '\n',
      JSON.stringify({
        type: 'done',
        result: {
          id: 'web_gen_test',
          configId: 'web-ai-test',
          topic: request.topic,
          generatedPrompt: '你好',
          model: 'test-model',
          createdAt: new Date().toISOString()
        }
      }) + '\n'
    ]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const progress = vi.fn(() => true)
    const result = await webAIService.generatePromptStream(request, config, progress)

    expect(fetchMock).toHaveBeenCalledWith('/api/ai/generate-stream', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request, config })
    }))
    expect(progress).toHaveBeenCalledWith(2, '你好')
    expect(result.generatedPrompt).toBe('你好')
  })

  it('aborts the current Web request when progress asks to stop', async () => {
    const fetchMock = vi.fn(async () => new Response(createStream([
      JSON.stringify({ type: 'progress', charCount: 2, partialContent: '停止' }) + '\n'
    ]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    // 用户停止按「停止」处理（不是失败），也不再抛出写死的中文报错
    await expect(webAIService.generatePromptStream(request, config, () => false))
      .rejects
      .toBeInstanceOf(GenerationStoppedError)

    const fetchOptions = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(fetchOptions.signal).toBeInstanceOf(AbortSignal)
    expect((fetchOptions.signal as AbortSignal).aborted).toBe(true)
  })
})

describe('WebAIService fallback errors and test prompts (#422 / #474)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('reports a failed backend call as a bare HTTP status that ai-error.ts can translate', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 502 })))
    const error = await webAIService.testConfig(config).catch(err => err as Error)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('HTTP 502')

    const { classifyAIError } = await import('../../src/renderer/lib/utils/ai-error')
    expect(classifyAIError(error)).toBe('server')
  })

  it('keeps the backend reason when there is one', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, error: 'Invalid API key' }), { status: 401 })))
    await expect(webAIService.testConfig(config)).rejects.toThrow('Invalid API key')
  })

  it('passes the localized test prompt to the backend', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { success: true } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await webAIService.testModel(config, 'test-model', 'Introduce yourself in one sentence')
    await webAIService.intelligentTest(config, 'Presentati in una frase')
    const bodies = fetchMock.mock.calls.map(call => JSON.parse(String((call as unknown as [string, RequestInit])[1].body)))
    expect(bodies[0]).toMatchObject({ model: 'test-model', prompt: 'Introduce yourself in one sentence' })
    expect(bodies[1]).toMatchObject({ prompt: 'Presentati in una frase' })
  })

  it('has no hard-coded Chinese user-facing fallbacks left', async () => {
    const { readFileSync } = await import('node:fs')
    const code = readFileSync('src/renderer/lib/services/web-ai.service.ts', 'utf8')
      .split('\n')
      .filter(line => !/^\s*(\/\/|\*|\/\*\*)/.test(line))
      .join('\n')
    expect(code).not.toMatch(/[一-鿿]/)
  })
})
