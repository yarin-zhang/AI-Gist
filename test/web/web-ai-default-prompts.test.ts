/**
 * @vitest-environment node
 */

/**
 * #475 / #474：默认系统提示词、默认需求模板和测试提示词，桌面主进程、Web 后端和桌面界面用的是同一份。
 * scripts/web-server.js 里有一份同样的文字（它不能引用 TypeScript），这里按实际发出的请求核对。
 */
import http from 'http'
import type { AddressInfo } from 'net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_GENERATION_SYSTEM_PROMPT,
  DEFAULT_GENERATION_USER_PROMPT,
  DEFAULT_TEST_PROMPT,
  normalizeCustomSystemPrompt,
  resolveTestPrompt,
} from '@shared/ai-default-prompts'
import { buildPrompts } from '../../src/main/ai/providers/prompt-templates'

const webServerModule = await import('../../scripts/web-server.js')
const createWebRequestHandler = (
  webServerModule.createWebRequestHandler || webServerModule.default.createWebRequestHandler
) as typeof webServerModule.createWebRequestHandler

interface ChatMessage { role: string; content: string }

let server: http.Server
let provider: http.Server
let apiBase = ''
let providerURL = ''
const received: ChatMessage[][] = []

const post = async (path: string, body: unknown) => {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return (await response.json()).data
}

const config = (overrides: Record<string, unknown> = {}) => ({
  configId: 'cfg', type: 'openai', apiKey: 'sk-test', baseURL: providerURL, defaultModel: 'gpt-test', ...overrides,
})

beforeAll(async () => {
  // 假的 OpenAI 兼容服务：记下每次收到的 messages，回一句 ok
  provider = http.createServer((req, res) => {
    let raw = ''
    req.on('data', chunk => { raw += chunk })
    req.on('end', () => {
      received.push(JSON.parse(raw || '{}').messages || [])
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }))
    })
  })
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', () => resolve()))
  providerURL = `http://127.0.0.1:${(provider.address() as AddressInfo).port}/v1`

  server = http.createServer(createWebRequestHandler({ serveStaticFiles: false }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
  apiBase = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
  await new Promise<void>(resolve => provider.close(() => resolve()))
})

beforeEach(() => {
  received.length = 0
})

describe('shared default prompts', () => {
  it('treats a saved copy of the built-in default as "no custom prompt"', () => {
    expect(normalizeCustomSystemPrompt(`  ${DEFAULT_GENERATION_SYSTEM_PROMPT}\n`)).toBe('')
    expect(normalizeCustomSystemPrompt('')).toBe('')
    expect(normalizeCustomSystemPrompt(undefined)).toBe('')
    expect(normalizeCustomSystemPrompt('  You write prompts.  ')).toBe('You write prompts.')
  })

  it('uses the prompt passed in by the renderer and falls back to the default', () => {
    expect(resolveTestPrompt('Introduce yourself in one sentence')).toBe('Introduce yourself in one sentence')
    expect(resolveTestPrompt('   ')).toBe(DEFAULT_TEST_PROMPT)
    expect(resolveTestPrompt()).toBe(DEFAULT_TEST_PROMPT)
  })
})

describe('desktop main process templates (prompt-templates.ts)', () => {
  it('generates with the shared default when there is no custom system prompt, or a copy of the default', () => {
    for (const systemPrompt of [undefined, '', DEFAULT_GENERATION_SYSTEM_PROMPT]) {
      expect(buildPrompts({ topic: '写周报' }, { systemPrompt })).toEqual({
        systemPrompt: DEFAULT_GENERATION_SYSTEM_PROMPT,
        userPrompt: DEFAULT_GENERATION_USER_PROMPT.replace('{topic}', '写周报'),
      })
    }
  })

  it('keeps using a real custom system prompt as before', () => {
    expect(buildPrompts({ topic: '写周报' }, { systemPrompt: 'You write prompts.' }))
      .toEqual({ systemPrompt: 'You write prompts.', userPrompt: '主题：写周报' })
  })
})

describe('web backend sends the same prompts as the desktop main process', () => {
  it('generates with the shared default system prompt and request template', async () => {
    await post('/api/ai/generate', { request: { configId: 'cfg', topic: '写周报' }, config: config() })
    expect(received[0]).toEqual([
      { role: 'system', content: DEFAULT_GENERATION_SYSTEM_PROMPT },
      { role: 'user', content: DEFAULT_GENERATION_USER_PROMPT.replace('{topic}', '写周报') },
    ])
  })

  it('a saved copy of the default behaves exactly like the default', async () => {
    await post('/api/ai/generate', { request: { topic: '写周报' }, config: config({ systemPrompt: `${DEFAULT_GENERATION_SYSTEM_PROMPT}\n` }) })
    await post('/api/ai/generate', { request: { topic: '写周报' }, config: config() })
    expect(received[0]).toEqual(received[1])
  })

  it('uses a custom system prompt like the desktop does', async () => {
    await post('/api/ai/generate', { request: { topic: '写周报' }, config: config({ systemPrompt: 'You write prompts.' }) })
    expect(received[0]).toEqual([
      { role: 'system', content: 'You write prompts.' },
      { role: 'user', content: '主题：写周报' },
    ])
  })

  it('sends raw requests as they are, without the prompt-engineer system prompt', async () => {
    await post('/api/ai/generate', { request: { topic: 'Run this', customPrompt: 'Run this' }, config: config({ systemPrompt: 'You write prompts.' }) })
    expect(received[0][0].content).not.toBe(DEFAULT_GENERATION_SYSTEM_PROMPT)
    expect(received[0][0].content).not.toBe('You write prompts.')
    expect(received[0][1]).toEqual({ role: 'user', content: 'Run this' })
  })

  it('model test and request test send the localized prompt from the renderer', async () => {
    const model = await post('/api/ai/test-model', { config: config(), model: 'gpt-test', prompt: 'Introduce yourself in one sentence' })
    expect(model).toMatchObject({ success: true, response: 'ok' })
    expect(received[0][1]).toEqual({ role: 'user', content: 'Introduce yourself in one sentence' })

    const request = await post('/api/ai/intelligent-test', { config: config(), prompt: 'Presentati in una frase' })
    expect(request).toMatchObject({ success: true, inputPrompt: 'Presentati in una frase' })
    expect(received[1][1]).toEqual({ role: 'user', content: 'Presentati in una frase' })
  })

  it('falls back to the shared default test prompt when the renderer passes none', async () => {
    const request = await post('/api/ai/intelligent-test', { config: config() })
    expect(request.inputPrompt).toBe(DEFAULT_TEST_PROMPT)
    await post('/api/ai/test-model', { config: config(), model: 'gpt-test' })
    expect(received[1][1].content).toBe(DEFAULT_TEST_PROMPT)
  })
})
