import { createApp, defineComponent, h, nextTick } from 'vue'
import { NConfigProvider, NDialogProvider, NMessageProvider } from 'naive-ui'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AIModelListResult } from '@shared/types/ai'
import i18n from '../../src/renderer/i18n'
import { useAIConfigEditor, type AIConfigEditor } from '../../src/renderer/composables/ai/useAIConfigEditor'
import { normalizeModelListResult } from '../../src/renderer/lib/services/web-ai.service'

describe('model list source (#415)', () => {
  let app: ReturnType<typeof createApp> | undefined
  let container: HTMLDivElement | undefined

  const mountEditor = async (result: AIModelListResult) => {
    ;(window as any).electronAPI = { ai: { getModels: vi.fn().mockResolvedValue(result) } }
    let editor!: AIConfigEditor
    const Probe = defineComponent({
      setup() {
        editor = useAIConfigEditor(() => undefined)
        return () => null
      }
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    app = createApp(defineComponent({
      setup: () => () => h(NConfigProvider, null, {
        default: () => h(NMessageProvider, null, { default: () => h(NDialogProvider, null, { default: () => h(Probe) }) })
      })
    }))
    app.use(i18n)
    i18n.global.locale.value = 'zh-CN'
    app.mount(container)
    await nextTick()
    editor.openCreate()
    editor.formData.apiKey = 'sk-test'
    return editor
  }

  afterEach(() => {
    app?.unmount()
    container?.remove()
    app = undefined
    container = undefined
  })

  it('only reports success for a list that really came from the service', async () => {
    const editor = await mountEditor({ models: ['gpt-4.1', 'gpt-4o'], modelSource: 'remote' })

    expect(await editor.fetchModelList()).toBe(true)
    expect(editor.modelFetchState.value).toBe('success')
    expect(editor.modelFetchMessage.value).toContain('2')
    expect(editor.formData.models).toEqual(['gpt-4.1', 'gpt-4o'])
  })

  it('reports a failed fetch as a failure and offers the common models as an explicit choice', async () => {
    const editor = await mountEditor({
      models: [],
      modelSource: 'unavailable',
      fallbackModels: ['gpt-4o-mini', 'gpt-4o'],
      error: 'fetch failed (ECONNREFUSED)'
    })

    expect(await editor.fetchModelList()).toBe(false)
    expect(editor.modelFetchState.value).toBe('error')
    // 原始报错交给界面按原因解释，不再直接拼进提示文字
    expect(editor.modelFetchError.value).toContain('ECONNREFUSED')
    expect(editor.modelFetchMessage.value).not.toContain('已更新')
    expect(editor.formData.models).toEqual([])
    expect(editor.commonModels.value).toEqual(['gpt-4o-mini', 'gpt-4o'])

    editor.fillCommonModels()
    expect(editor.formData.models).toEqual(['gpt-4o-mini', 'gpt-4o'])
    expect(editor.formData.defaultModel).toBe('gpt-4o-mini')
    expect(editor.modelFetchState.value).toBe('builtin')
    expect(editor.modelFetchMessage.value).toContain('常见模型')
  })

  it('warns that a built-in list is not from the service', async () => {
    const editor = await mountEditor({ models: ['glm-4-flash'], modelSource: 'default' })

    expect(await editor.fetchModelList()).toBe(true)
    expect(editor.modelFetchState.value).toBe('builtin')
    expect(editor.modelFetchMessage.value).not.toContain('已更新')
    expect(editor.formData.models).toEqual(['glm-4-flash'])
  })

  it('treats an empty list from the service as empty, not as success', async () => {
    const editor = await mountEditor({ models: [], modelSource: 'unavailable', fallbackModels: [] })

    expect(await editor.fetchModelList()).toBe(false)
    expect(editor.modelFetchState.value).toBe('empty')
    expect(editor.commonModels.value).toEqual([])
  })
})

describe('normalizeModelListResult', () => {
  it('never treats an unlabeled or legacy default list as fetched from the service', () => {
    expect(normalizeModelListResult(['a', 'b'])).toEqual({ models: ['a', 'b'], modelSource: 'default' })
    expect(normalizeModelListResult({ models: ['llama3.1'], modelSource: 'default' }))
      .toEqual({ models: ['llama3.1'], modelSource: 'default' })
    expect(normalizeModelListResult({ models: ['x', 'x', ''], modelSource: 'remote' }))
      .toEqual({ models: ['x'], modelSource: 'remote' })
    expect(normalizeModelListResult({ models: [], modelSource: 'unavailable', fallbackModels: ['m'], error: 'boom' }))
      .toEqual({ models: [], modelSource: 'unavailable', fallbackModels: ['m'], error: 'boom' })
    expect(normalizeModelListResult(undefined)).toEqual({ models: [], modelSource: 'unavailable' })
  })
})
