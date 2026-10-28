/**
 * #474 / #422：模型测试、请求测试的提示词由渲染层按界面语言传入，三端一致。
 * #475：桌面「系统提示词」弹窗里的「默认」就是实际生成时用的那段；和默认一样的内容保存成空，生成行为不变。
 */
import { readFileSync } from 'node:fs'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { NConfigProvider, NDialogProvider, NMessageProvider } from 'naive-ui'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AIConfig } from '@shared/types/ai'
import { DEFAULT_GENERATION_SYSTEM_PROMPT, DEFAULT_TEST_PROMPT } from '@shared/ai-default-prompts'
import i18n from '../../src/renderer/i18n'

const db = vi.hoisted(() => ({
  updates: [] as { id: number; data: Partial<AIConfig> }[],
}))

vi.mock('../../src/renderer/lib/db', () => ({
  databaseService: {
    aiConfig: {
      getAllAIConfigs: vi.fn(async () => []),
      updateAIConfig: vi.fn(async (id: number, data: Partial<AIConfig>) => { db.updates.push({ id, data }); return { id, ...data } }),
      createAIConfig: vi.fn(),
      setPreferredAIConfig: vi.fn(),
      deleteAIConfig: vi.fn(),
    },
  },
}))

const { useAIConfigEditor } = await import('../../src/renderer/composables/ai/useAIConfigEditor')
const { useAIConfigWorkspace } = await import('../../src/renderer/composables/ai/useAIConfigWorkspace')
const { intelligentTestAIConfig } = await import('../../src/renderer/lib/services/mobile-ai.service')

const config = (overrides: Partial<AIConfig> = {}): AIConfig => ({
  id: 1, configId: 'c1', name: 'OpenAI', type: 'openai', baseURL: 'https://api.openai.com/v1', apiKey: 'sk-test',
  models: ['gpt-4o'], defaultModel: 'gpt-4o', enabled: true, createdAt: new Date(), updatedAt: new Date(), ...overrides,
})

let app: ReturnType<typeof createApp> | undefined
let container: HTMLDivElement | undefined

const mount = async <T>(setup: () => T, locale = 'zh-CN'): Promise<T> => {
  let result!: T
  const Probe = defineComponent({ setup() { result = setup(); return () => null } })
  container = document.createElement('div')
  document.body.appendChild(container)
  app = createApp(defineComponent({
    setup: () => () => h(NConfigProvider, null, {
      default: () => h(NMessageProvider, null, { default: () => h(NDialogProvider, null, { default: () => h(Probe) }) }),
    }),
  }))
  app.use(i18n)
  i18n.global.locale.value = locale as never
  app.mount(container)
  await nextTick()
  return result
}

beforeEach(() => {
  db.updates = []
})

afterEach(() => {
  app?.unmount()
  container?.remove()
  app = undefined
  container = undefined
  i18n.global.locale.value = 'zh-CN' as never
  delete (window as any).electronAPI
  vi.unstubAllGlobals()
})

describe('model test prompt follows the interface language', () => {
  it.each([
    ['en-US', 'Introduce yourself in one sentence'],
    ['zh-CN', '用一句话介绍你自己'],
  ])('the wizard sends the %s test prompt to the backend', async (locale, expected) => {
    const testModel = vi.fn(async () => ({ success: true, response: 'ok' }))
    ;(window as any).electronAPI = { ai: { testModel } }
    const editor = await mount(() => useAIConfigEditor(() => undefined), locale)
    editor.openEdit(config())
    editor.selectedTestModel.value = 'gpt-4o'
    await editor.testSelectedModel()
    expect(testModel).toHaveBeenCalledWith(expect.anything(), 'gpt-4o', i18n.global.t('models.requestTestDefaultPrompt'))
    expect(i18n.global.t('models.requestTestDefaultPrompt')).toBe(expected)
  })

  it('the mobile request test sends the prompt it is given and reports it back', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'Hi' } }] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await intelligentTestAIConfig(config(), 'Presentati in una frase')
    expect(result).toMatchObject({ success: true, inputPrompt: 'Presentati in una frase' })
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'Presentati in una frase' })

    const fallback = await intelligentTestAIConfig(config())
    expect(fallback.inputPrompt).toBe(DEFAULT_TEST_PROMPT)
  })

  it('the mobile detail page and the API client pass the localized prompt through', () => {
    const page = readFileSync('src/renderer/pages/mobile/MobileAIConfigDetailPage.vue', 'utf8')
    const api = readFileSync('src/renderer/lib/api/ai-config.api.ts', 'utf8')
    expect(page).toContain("api.aiConfigs.intelligentTest.mutate(config.value.id!, t('models.requestTestDefaultPrompt'))")
    expect(api).toContain('window.electronAPI.ai.intelligentTest(config, prompt)')
    expect(api).toContain('intelligentTestAIConfig(config, prompt)')
  })
})

describe('desktop system prompt default is the one actually used (#475)', () => {
  it('saving the built-in default stores no custom prompt, so generation keeps using the default template', async () => {
    const workspace = await mount(() => useAIConfigWorkspace())
    await workspace.saveSystemPrompt(config(), `${DEFAULT_GENERATION_SYSTEM_PROMPT}\n`)
    expect(db.updates.at(-1)).toEqual({ id: 1, data: { systemPrompt: undefined } })

    await workspace.saveSystemPrompt(config(), '  You write prompts.  ')
    expect(db.updates.at(-1)).toEqual({ id: 1, data: { systemPrompt: 'You write prompts.' } })
  })

  it('the modal shows and resets to the shared default, with a note outside Chinese interfaces', () => {
    const modal = readFileSync('src/renderer/components/models/SystemPromptModal.vue', 'utf8')
    expect(modal).toContain('const defaultPrompt = computed(() => DEFAULT_GENERATION_SYSTEM_PROMPT)')
    expect(modal).not.toContain("t('aiConfig.workspace.defaultSystemPrompt')")
    expect(modal).toContain('@click="content = defaultPrompt"')
    expect(modal).toContain(`<p v-if="showsDefault && !locale.startsWith('zh')" class="ui-help">{{ t('models.systemPromptDefaultLanguageNote') }}</p>`)
  })
})
