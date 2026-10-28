/**
 * #475：系统提示词页显示的「默认」和 AI 生成实际发出的默认系统提示词是同一段文字。
 */
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AIConfig } from '@shared/types/ai'
import { PlatformDetector } from '@shared/platform'
import i18n from '~/i18n'
import {
  AIGeneratorService,
  DEFAULT_SYSTEM_PROMPT_KEY,
  getDefaultSystemPrompt,
} from '~/lib/services/mobile-ai-generator.service'

const config = (overrides: Partial<AIConfig> = {}): AIConfig => ({
  configId: 'cfg',
  name: 'OpenAI',
  type: 'openai',
  baseURL: '',
  apiKey: 'sk-test',
  models: ['gpt-4o-mini'],
  defaultModel: 'gpt-4o-mini',
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const sentSystemPrompt = async (overrides: Partial<AIConfig> = {}) => {
  const fetchMock = vi.mocked(fetch)
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  }))
  await AIGeneratorService.generatePrompt({ configId: 'cfg', topic: '写一个代码审查提示词' }, config(overrides))
  const [, options] = fetchMock.mock.calls[0]
  return JSON.parse(String((options as RequestInit).body)).messages[0]
}

describe('默认系统提示词只有一个来源', () => {
  beforeEach(() => {
    ;(PlatformDetector as any)._platform = null
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    i18n.global.locale.value = 'zh-CN'
  })

  it('没有自定义时，发出的 system 消息就是页面上显示的默认文字', async () => {
    const message = await sentSystemPrompt()
    expect(message.role).toBe('system')
    expect(message.content).toBe(getDefaultSystemPrompt())
    expect(message.content).toBe(i18n.global.t(DEFAULT_SYSTEM_PROMPT_KEY))
  })

  it('跟随界面语言：英文界面发的也是英文默认', async () => {
    i18n.global.locale.value = 'en-US'
    const message = await sentSystemPrompt()
    expect(message.content).toMatch(/^You are a professional AI prompt engineer/)
  })

  it('自定义了就用自定义的；只有空白时仍用默认', async () => {
    expect((await sentSystemPrompt({ systemPrompt: 'Be brief.' })).content).toBe('Be brief.')
    vi.mocked(fetch).mockReset()
    expect((await sentSystemPrompt({ systemPrompt: '   ' })).content).toBe(getDefaultSystemPrompt())
  })

  it('系统提示词页读同一个 key，服务里不再另写一段', () => {
    const page = readFileSync('src/renderer/pages/mobile/MobileSystemPromptEditPage.vue', 'utf8')
    expect(page).toContain('const defaultPrompt = computed(() => t(DEFAULT_SYSTEM_PROMPT_KEY))')
    const service = readFileSync('src/renderer/lib/services/mobile-ai-generator.service.ts', 'utf8')
    expect(service).not.toMatch(/const DEFAULT_SYSTEM_PROMPT\s*=/)
  })
})
