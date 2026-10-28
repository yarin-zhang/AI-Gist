import { createApp, defineComponent, h, nextTick } from 'vue'
import { NConfigProvider, NDialogProvider, NMessageProvider } from 'naive-ui'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AIConfig } from '@shared/types/ai'
import i18n from '../../src/renderer/i18n'

const db = vi.hoisted(() => ({
  configs: [] as AIConfig[],
  created: [] as AIConfig[],
  preferredId: null as number | null,
}))

vi.mock('../../src/renderer/lib/db', () => ({
  databaseService: {
    aiConfig: {
      getAllAIConfigs: vi.fn(async () => db.configs),
      createAIConfig: vi.fn(async (data: AIConfig) => {
        const saved = { ...data, id: 100 + db.created.length }
        db.created.push(saved)
        return saved
      }),
      updateAIConfig: vi.fn(async (id: number, data: Partial<AIConfig>) => ({ ...db.configs.find(c => c.id === id), ...data })),
      setPreferredAIConfig: vi.fn(async (id: number) => { db.preferredId = id }),
      deleteAIConfig: vi.fn(async () => undefined),
    },
  },
}))

const { useAIConfigEditor } = await import('../../src/renderer/composables/ai/useAIConfigEditor')
const { useAIConfigWorkspace } = await import('../../src/renderer/composables/ai/useAIConfigWorkspace')

const config = (overrides: Partial<AIConfig> = {}): AIConfig => ({
  id: 1, configId: 'c1', name: 'OpenAI', type: 'openai', baseURL: 'https://api.openai.com/v1', apiKey: 'sk-test',
  models: ['gpt-4o'], defaultModel: 'gpt-4o', enabled: true, createdAt: new Date(), updatedAt: new Date(), ...overrides,
})

let app: ReturnType<typeof createApp> | undefined
let container: HTMLDivElement | undefined

const mount = async <T>(setup: () => T): Promise<T> => {
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
  i18n.global.locale.value = 'zh-CN'
  app.mount(container)
  await nextTick()
  return result
}

beforeEach(() => {
  db.configs = []
  db.created = []
  db.preferredId = null
})

afterEach(() => {
  app?.unmount()
  container?.remove()
  app = undefined
  container = undefined
  vi.useRealTimers()
  delete (window as any).electronAPI
})

describe('wizard model fields (#427)', () => {
  it('folds a legacy custom model into the model list and keeps the default inside the list', async () => {
    const editor = await mount(() => useAIConfigEditor(() => undefined))
    editor.openEdit(config({ models: ['gpt-4o'], defaultModel: '', customModel: 'my-model' }))
    await nextTick()

    expect(editor.formData.models).toEqual(['gpt-4o', 'my-model'])
    expect(editor.formData.defaultModel).toBe('my-model')
    expect(editor.dirty.value).toBe(false)
  })

  it('adds a typed default model to the list and picks a default when the first model is added', async () => {
    const editor = await mount(() => useAIConfigEditor(() => undefined))
    editor.openCreate()
    await nextTick()
    expect(editor.formData.defaultModel).toBe('')

    editor.formData.models = ['qwen2.5']
    await nextTick()
    expect(editor.formData.defaultModel).toBe('qwen2.5')
    expect(editor.selectedTestModel.value).toBe('qwen2.5')

    editor.setDefaultModel('deepseek-chat')
    expect(editor.formData.models).toEqual(['qwen2.5', 'deepseek-chat'])
    expect(editor.formData.defaultModel).toBe('deepseek-chat')

    editor.formData.models = ['qwen2.5']
    await nextTick()
    expect(editor.formData.defaultModel).toBe('qwen2.5')
  })
})

describe('first configuration becomes preferred (#428)', () => {
  const fillAndSave = async (editor: ReturnType<typeof useAIConfigEditor>) => {
    editor.openCreate()
    editor.formData.apiKey = 'sk-test'
    editor.formData.models = ['gpt-4o']
    await nextTick()
    editor.activeSection.value = 'models'
    await editor.save()
  }

  it('sets the first enabled configuration as preferred', async () => {
    const editor = await mount(() => useAIConfigEditor(() => undefined))
    await fillAndSave(editor)
    expect(db.created).toHaveLength(1)
    expect(db.created[0].customModel).toBe('')
    expect(db.preferredId).toBe(100)
  })

  it('leaves the preferred choice alone when another configuration is already enabled', async () => {
    db.configs = [config()]
    const editor = await mount(() => useAIConfigEditor(() => undefined))
    await fillAndSave(editor)
    expect(db.preferredId).toBeNull()
  })
})

describe('connection test timeout and cancel (#422)', () => {
  it('stops waiting after the timeout and explains it as a timeout', async () => {
    vi.useFakeTimers()
    ;(window as any).electronAPI = { ai: { testConfig: vi.fn(() => new Promise(() => undefined)) } }
    const editor = await mount(() => useAIConfigEditor(() => undefined))
    editor.openCreate()
    editor.formData.apiKey = 'sk-test'
    const running = editor.testConnection()
    expect(editor.testingConnection.value).toBe(true)
    await vi.advanceTimersByTimeAsync(45_000)
    await running
    expect(editor.testingConnection.value).toBe(false)
    expect(editor.connectionResult.value?.success).toBe(false)
    expect(editor.connectionResult.value?.error).toMatch(/timed out/)
  })

  it('ignores a late result after the user cancels', async () => {
    let resolveTest!: (value: unknown) => void
    ;(window as any).electronAPI = { ai: { testConfig: vi.fn(() => new Promise(resolve => { resolveTest = resolve })) } }
    const editor = await mount(() => useAIConfigEditor(() => undefined))
    editor.openCreate()
    editor.formData.apiKey = 'sk-test'
    const running = editor.testConnection()
    editor.cancelConnectionTest()
    expect(editor.testingConnection.value).toBe(false)
    resolveTest({ success: false, error: 'fetch failed' })
    await running
    expect(editor.connectionResult.value).toBeNull()
  })
})

describe('request test stop and partial output (#423)', () => {
  const streamWith = (impl: (onProgress: (count: number, partial?: string) => boolean) => Promise<unknown>) => {
    ;(window as any).electronAPI = {
      ai: {
        generatePromptStream: vi.fn((_request, _config, onProgress) => impl(onProgress)),
        stopGeneration: vi.fn(async () => ({ success: true })),
      },
    }
  }

  it('keeps what arrived and marks the answer as stopped', async () => {
    streamWith(() => new Promise(() => undefined))
    const workspace = await mount(() => useAIConfigWorkspace())
    const target = config()
    workspace.requestTestModels[1] = 'gpt-4o'
    const running = workspace.runRequestTest(target)
    const onProgress = (window as any).electronAPI.ai.generatePromptStream.mock.calls[0][2]
    onProgress(5, 'Hello')
    expect(workspace.requestResults[1].response).toBe('Hello')

    workspace.stopRequestTest(target)
    expect(workspace.requestTestingConfigs.value.has(1)).toBe(false)
    expect(workspace.requestResults[1]).toMatchObject({ success: true, response: 'Hello', stopped: true })
    expect(workspace.requestResults[1].elapsed).toBeTypeOf('number')
    expect((window as any).electronAPI.ai.stopGeneration).toHaveBeenCalled()
    // 停止后后台再有内容也不会覆盖
    expect(onProgress(9, 'Hello wor')).toBe(false)
    void running
  })

  it('keeps the partial answer when the stream fails midway', async () => {
    streamWith(async onProgress => {
      onProgress(5, 'Hello')
      throw new Error('Rate limit reached for gpt-4o')
    })
    const workspace = await mount(() => useAIConfigWorkspace())
    workspace.requestTestModels[1] = 'gpt-4o'
    await workspace.runRequestTest(config())
    expect(workspace.requestResults[1]).toMatchObject({ success: false, response: 'Hello', error: 'Rate limit reached for gpt-4o' })
    expect(workspace.requestTestingConfigs.value.has(1)).toBe(false)
  })
})

describe('custom service connection fields (#462)', () => {
  const choice = (editor: ReturnType<typeof useAIConfigEditor>, id: string) => editor.changeProviderChoice(id)

  it('labels a custom OpenAI-compatible service generically and names the endpoint field in the message', async () => {
    const editor = await mount(() => useAIConfigEditor(() => undefined))
    editor.openCreate()
    await choice(editor, 'custom:openai')
    expect(editor.selectedProviderChoiceId.value).toBe('custom:openai')
    expect(editor.apiKeyLabel.value).toBe('API Key')
    expect(editor.baseURLInfo.value.label).toBe('兼容服务地址')
    expect(editor.baseURLInfo.value.requiredMessage).toBe('请输入兼容服务地址')

    await choice(editor, 'preset:moonshot')
    expect(editor.apiKeyLabel.value).toBe('Moonshot AI API Key')
    await choice(editor, 'official:deepseek')
    expect(editor.apiKeyLabel.value).toBe('DeepSeek API Key')
  })

  it('rejects an endpoint without http:// or https:// before testing', async () => {
    const testConfig = vi.fn(async () => ({ success: true }))
    ;(window as any).electronAPI = { ai: { testConfig } }
    const editor = await mount(() => useAIConfigEditor(() => undefined))
    editor.openCreate()
    await choice(editor, 'custom:openai')
    editor.formData.apiKey = 'sk-test'
    editor.formData.baseURL = 'my-proxy.example.com/v1'
    await editor.testConnection()
    expect(testConfig).not.toHaveBeenCalled()
    expect(editor.formRules.value.baseURL[0].validator()).toBeInstanceOf(Error)

    editor.formData.baseURL = 'https://my-proxy.example.com/v1'
    expect(editor.formRules.value.baseURL[0].validator()).toBe(true)
    await editor.testConnection()
    expect(testConfig).toHaveBeenCalledTimes(1)
  })
})

describe('switching providers and stepping through an existing configuration (#462)', () => {
  const clickDialogButton = async (index: number) => {
    await nextTick()
    // 关掉的对话框在离场动画期间还留在 DOM 里，取最新的那个
    const dialogs = document.querySelectorAll('.n-dialog')
    dialogs[dialogs.length - 1].querySelectorAll<HTMLButtonElement>('.n-dialog__action .n-button')[index].click()
    await nextTick()
  }

  it('keeps the key when the selected card is clicked again', async () => {
    const editor = await mount(() => useAIConfigEditor(() => undefined))
    editor.openEdit(config())
    await nextTick()
    const current = editor.selectedProviderChoice.value!
    expect(await editor.selectProviderChoice(current)).toBe(true)
    expect(editor.formData.apiKey).toBe('sk-test')
    expect(document.querySelector('.n-dialog')).toBeNull()
  })

  it('asks before another provider clears the saved key, address and models', async () => {
    const editor = await mount(() => useAIConfigEditor(() => undefined))
    editor.openEdit(config())
    await nextTick()

    const declined = editor.changeProviderChoice('official:deepseek')
    await clickDialogButton(0) // 取消
    expect(await declined).toBe(false)
    expect(editor.selectedProviderChoiceId.value).toBe('official:openai')
    expect(editor.formData.apiKey).toBe('sk-test')
    expect(editor.formData.models).toEqual(['gpt-4o'])

    const accepted = editor.changeProviderChoice('official:deepseek')
    await clickDialogButton(1) // 切换
    expect(await accepted).toBe(true)
    expect(editor.formData.type).toBe('deepseek')
    expect(editor.formData.apiKey).toBe('')
    expect(editor.formData.models).toEqual([])
  })

  it('switches without asking while nothing has been filled in', async () => {
    const editor = await mount(() => useAIConfigEditor(() => undefined))
    editor.openCreate()
    expect(await editor.changeProviderChoice('official:ollama')).toBe(true)
    expect(editor.formData.type).toBe('ollama')
    expect(document.querySelector('.n-dialog')).toBeNull()
  })

  it('goes straight to the models step of an unchanged existing configuration', async () => {
    const editor = await mount(() => useAIConfigEditor(() => undefined))
    editor.openEdit(config())
    await nextTick()
    await editor.goToSection('models')
    expect(editor.activeSection.value).toBe('models')
    expect(document.querySelector('.n-dialog')).toBeNull()
  })

  it('still warns when the address or key of an existing configuration changed without a test', async () => {
    const editor = await mount(() => useAIConfigEditor(() => undefined))
    editor.openEdit(config())
    await nextTick()
    editor.formData.apiKey = 'sk-changed'
    const moving = editor.goToSection('models')
    await nextTick()
    expect(document.querySelector('.n-dialog')).not.toBeNull()
    await clickDialogButton(0) // 留下测试
    await moving
    expect(editor.activeSection.value).toBe('connection')
  })
})

describe('Enter on the connection step (#463)', () => {
  it('tests the connection first and moves on once it passed', async () => {
    const testConfig = vi.fn(async () => ({ success: true }))
    const getModels = vi.fn(async () => ({ models: ['gpt-4o'], modelSource: 'remote' }))
    ;(window as any).electronAPI = { ai: { testConfig, getModels } }
    const editor = await mount(() => useAIConfigEditor(() => undefined))
    editor.openCreate()
    editor.activeSection.value = 'connection'
    editor.formData.apiKey = 'sk-test'

    await editor.submitConnectionStep()
    expect(testConfig).toHaveBeenCalledTimes(1)
    expect(editor.connectionResult.value?.success).toBe(true)
    expect(editor.activeSection.value).toBe('connection')

    await editor.submitConnectionStep()
    expect(editor.activeSection.value).toBe('models')
    expect(testConfig).toHaveBeenCalledTimes(1)
  })
})

describe('model list filter keeps the detail in sync (#462)', () => {
  it('selects the first visible configuration and clears the selection when nothing matches', async () => {
    db.configs = [
      config({ id: 1, name: 'OpenAI' }),
      config({ id: 2, configId: 'c2', name: 'Proxy', baseURL: 'https://proxy.example.com/v1' }),
      config({ id: 3, configId: 'c3', name: 'Ollama', type: 'ollama', baseURL: 'http://localhost:11434', apiKey: '' }),
    ]
    const workspace = await mount(() => useAIConfigWorkspace())
    await workspace.loadConfigs()
    workspace.selectConfig(db.configs[0])
    expect(workspace.selectedConfigId.value).toBe(1)

    workspace.activeFilter.value = 'local'
    await nextTick()
    expect(workspace.filteredConfigs.value.map(item => item.id)).toEqual([3])
    expect(workspace.selectedConfigId.value).toBe(3)

    workspace.activeFilter.value = 'all'
    workspace.searchText.value = 'claude'
    await nextTick()
    expect(workspace.filteredConfigs.value).toEqual([])
  })
})
