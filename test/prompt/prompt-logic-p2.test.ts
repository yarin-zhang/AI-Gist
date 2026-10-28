import { readFileSync } from 'node:fs'
import { nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PromptWithRelations } from '@shared/types/database'

// 提示词页编辑 / AI 会话的几处修复（Gitea #423、#431、#435、#436）

const mocks = vi.hoisted(() => ({
  allPrompts: [] as any[],
  createPrompt: vi.fn(),
  updatePrompt: vi.fn(),
  streamGeneration: vi.fn(),
}))

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('naive-ui', () => ({ useMessage: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }) }))
vi.mock('@/lib/api', () => ({
  api: {
    prompts: {
      getAll: { query: async () => ({ data: mocks.allPrompts }) },
      create: { mutate: (...args: unknown[]) => mocks.createPrompt(...args) },
      update: { mutate: (...args: unknown[]) => mocks.updatePrompt(...args) },
    },
    promptHistories: {
      getByPromptId: { query: async () => [] },
      create: { mutate: async (record: unknown) => record },
    },
    aiGenerationHistory: {
      create: { mutate: async () => ({}) },
    },
  },
}))
vi.mock('@/lib/utils/ai-request', () => {
  class GenerationStoppedError extends Error {}
  return {
    GenerationStoppedError,
    streamGeneration: (...args: unknown[]) => mocks.streamGeneration(...args),
    stopGeneration: async () => undefined,
  }
})
vi.mock('@/composables/prompt/useAIModels', () => ({
  useAIModels: () => ({ selected: ref({ config: { configId: 'cfg' }, model: 'model-a' }) }),
}))

const { usePromptEditor } = await import('@/composables/prompt/usePromptEditor')
const { usePromptAISession } = await import('@/composables/prompt/usePromptAISession')
const { GenerationStoppedError } = await import('@/lib/utils/ai-request')
const { handleEnterKey, isImeComposing } = await import('@/lib/utils/ime')

const storedPrompt = (overrides: Partial<PromptWithRelations> = {}) => ({
  id: 3,
  uuid: 'p3',
  title: 'Weekly status',
  description: '旧描述',
  content: '本周：{{work_log}}，项目：{{project_name}}',
  tags: [],
  variables: [],
  isJinjaTemplate: false,
  isFavorite: false,
  useCount: 0,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
  ...overrides,
}) as PromptWithRelations

const names = (variables: { name: string }[]) => variables.map(variable => variable.name)

beforeEach(() => {
  mocks.allPrompts = []
  mocks.createPrompt.mockReset().mockImplementation(async (data: any) => ({ ...data, id: 9 }))
  mocks.updatePrompt.mockReset().mockImplementation(async ({ id, data }: any) => ({ ...data, id }))
  mocks.streamGeneration.mockReset()
})

describe('#431 discarding edits leaves no abandoned variables behind', () => {
  it('restores the saved variables after renames and saves only those', async () => {
    const editor = usePromptEditor(ref(storedPrompt()))
    await nextTick()
    const [workLog, projectName] = editor.form.value.variables
    editor.updateVariable('work_log', { ...workLog, name: 'notes' })
    editor.updateVariable('project_name', { ...projectName, name: '项目名称' })
    await nextTick()
    expect(names(editor.activeVariables.value)).toEqual(['notes', '项目名称'])

    editor.discard()
    await nextTick()
    expect(editor.form.value.content).toBe('本周：{{work_log}}，项目：{{project_name}}')
    expect(names(editor.form.value.variables)).toEqual(['work_log', 'project_name'])
    expect(editor.unusedVariables.value).toEqual([])
    expect(editor.dirty.value).toBe(false)

    editor.form.value.description = '新描述'
    await editor.save()
    expect(names(mocks.updatePrompt.mock.calls[0][0].data.variables)).toEqual(['work_log', 'project_name'])
  })

  it('still keeps configured variables in "unused" while editing, before any discard', async () => {
    const editor = usePromptEditor(ref(storedPrompt()))
    await nextTick()
    const [workLog] = editor.form.value.variables
    editor.updateVariable('work_log', { ...workLog, description: '这周做了什么' })
    editor.form.value.content = '项目：{{project_name}}'
    await nextTick()
    expect(names(editor.unusedVariables.value)).toEqual(['work_log'])
  })

  it('does not carry Jinja variables back into a plain template', async () => {
    const editor = usePromptEditor(ref(null))
    await nextTick()
    editor.setTemplateType(true)
    editor.form.value.content = 'Hello {{ name }}'
    await nextTick()
    expect(names(editor.form.value.variables)).toEqual(['name'])

    editor.setTemplateType(false)
    editor.form.value.content = '写一份关于 {{topic}} 的总结'
    await nextTick()
    expect(names(editor.form.value.variables)).toEqual(['topic'])
    expect(editor.unusedVariables.value).toEqual([])
  })
})

describe('#436 duplicate titles are never renamed silently', () => {
  it('asks before creating a prompt whose title already exists and keeps the title as typed', async () => {
    mocks.allPrompts = [{ id: 1, title: 'Weekly status' }]
    const confirmDuplicateTitle = vi.fn().mockResolvedValue(true)
    const editor = usePromptEditor(ref(null))
    editor.form.value.title = 'Weekly status'
    editor.form.value.content = '正文'
    await editor.save({ confirmDuplicateTitle })
    expect(confirmDuplicateTitle).toHaveBeenCalledWith('Weekly status')
    expect(mocks.createPrompt.mock.calls[0][0].title).toBe('Weekly status')
    expect(editor.form.value.title).toBe('Weekly status')
  })

  it('does not save when the user chooses to change the title', async () => {
    mocks.allPrompts = [{ id: 1, title: 'Weekly status' }]
    const editor = usePromptEditor(ref(null))
    editor.form.value.title = 'Weekly status'
    editor.form.value.content = '正文'
    expect(await editor.save({ confirmDuplicateTitle: async () => false })).toBeNull()
    expect(mocks.createPrompt).not.toHaveBeenCalled()
    expect(editor.saving.value).toBe(false)
  })

  it('does not ask when the title is unique or unchanged on an existing prompt', async () => {
    const confirmDuplicateTitle = vi.fn().mockResolvedValue(false)
    mocks.allPrompts = [{ id: 1, title: 'Weekly status' }, { id: 3, title: 'Weekly status' }]
    const editor = usePromptEditor(ref(storedPrompt()))
    await nextTick()
    editor.form.value.description = '只改描述'
    await editor.save({ confirmDuplicateTitle })
    expect(confirmDuplicateTitle).not.toHaveBeenCalled()
    expect(mocks.updatePrompt.mock.calls[0][0].data.title).toBe('Weekly status')

    const fresh = usePromptEditor(ref(null))
    fresh.form.value.title = '全新的标题'
    fresh.form.value.content = '正文'
    await fresh.save({ confirmDuplicateTitle })
    expect(confirmDuplicateTitle).not.toHaveBeenCalled()
    expect(mocks.createPrompt.mock.calls[0][0].title).toBe('全新的标题')
  })

  it('asks when an existing prompt is renamed to another prompt\'s title', async () => {
    mocks.allPrompts = [{ id: 1, title: '日报' }]
    const confirmDuplicateTitle = vi.fn().mockResolvedValue(true)
    const editor = usePromptEditor(ref(storedPrompt()))
    await nextTick()
    editor.form.value.title = '日报'
    await editor.save({ confirmDuplicateTitle })
    expect(confirmDuplicateTitle).toHaveBeenCalledWith('日报')
    expect(mocks.updatePrompt.mock.calls[0][0].data.title).toBe('日报')
  })
})

describe('#423 stopped or failed try-runs are marked incomplete', () => {
  const session = () => usePromptAISession({ content: () => '正文', rendered: () => '填好的正文', title: () => '周报' })

  it('keeps the partial answer, the real duration and a "stopped" outcome when the user stops', async () => {
    mocks.streamGeneration.mockImplementation(async ({ onPartial }: any) => {
      onPartial('回答的前半')
      await new Promise(resolve => setTimeout(resolve, 20))
      throw new GenerationStoppedError()
    })
    const ai = session()
    await ai.run()
    const answer = ai.messages.value[1]
    expect(answer).toMatchObject({ kind: 'run', text: '回答的前半', streaming: false, outcome: 'stopped' })
    expect(answer.meta?.durationMs).toBeGreaterThanOrEqual(15)
    expect(ai.running.value).toBe(false)
  })

  it('keeps what arrived before a mid-stream failure together with the reason', async () => {
    mocks.streamGeneration.mockImplementation(async ({ onPartial }: any) => {
      onPartial('回答的前半')
      throw new Error('Request timed out after 60000ms')
    })
    const ai = session()
    await ai.run()
    expect(ai.messages.value[1]).toMatchObject({
      kind: 'run', text: '回答的前半', outcome: 'failed', error: 'Request timed out after 60000ms',
    })
  })

  it('marks a failure before any text as failed without inventing an answer', async () => {
    mocks.streamGeneration.mockRejectedValue(new Error('401 Incorrect API key'))
    const ai = session()
    await ai.run()
    expect(ai.messages.value[1]).toMatchObject({ kind: 'run', text: '', outcome: 'failed', error: '401 Incorrect API key' })
  })

  it('leaves complete answers unmarked', async () => {
    mocks.streamGeneration.mockResolvedValue({ generatedPrompt: '完整回答' })
    const ai = session()
    await ai.run()
    expect(ai.messages.value[1].outcome).toBeUndefined()
    expect(ai.messages.value[1].text).toBe('完整回答')
  })

  it('shows the incomplete state, a partial-copy label and a retry button on the card', () => {
    const panel = readFileSync('src/renderer/components/prompts/PromptAIPanel.vue', 'utf8')
    expect(panel).toContain('v-if="item.outcome" class="ai-card__status"')
    expect(panel).toContain("t('promptAI.copyPartialAnswer')")
    expect(panel).toContain(`@click="emit('run')">`)
    expect(panel).toContain("t('promptAI.answerMeta', { seconds, count: item.text.length }, item.text.length)")
  })
})

describe('#435 Enter that confirms an IME candidate does not send or commit', () => {
  const keydown = (init: Partial<KeyboardEvent>) => ({ key: 'Enter', isComposing: false, keyCode: 13, preventDefault: vi.fn(), ...init }) as unknown as KeyboardEvent

  it('recognises composition by isComposing and by keyCode 229 (Safari)', () => {
    expect(isImeComposing(keydown({ isComposing: true, keyCode: 229 }))).toBe(true)
    expect(isImeComposing(keydown({ keyCode: 229 }))).toBe(true)
    expect(isImeComposing(keydown({}))).toBe(false)
  })

  it('only runs the action for a plain Enter', () => {
    const action = vi.fn()
    const composing = keydown({ isComposing: true, keyCode: 229 })
    handleEnterKey(composing, action)
    expect(action).not.toHaveBeenCalled()
    expect(composing.preventDefault).not.toHaveBeenCalled()
    const plain = keydown({})
    handleEnterKey(plain, action)
    expect(action).toHaveBeenCalledTimes(1)
    expect(plain.preventDefault).toHaveBeenCalled()
  })

  it('guards every Enter-to-submit field on the prompt page and the launcher', () => {
    const read = (path: string) => readFileSync(`src/renderer/${path}`, 'utf8')
    const aiPanel = read('components/prompts/PromptAIPanel.vue')
    expect(aiPanel).toContain('@keydown.enter="sendOnEnter"')
    expect(aiPanel).toContain('if (isImeComposing(event) || event.shiftKey || event.altKey) return')
    const generatePanel = read('components/prompts/PromptGeneratePanel.vue')
    expect(generatePanel).toContain('@keydown.enter="submitOnEnter"')
    expect(generatePanel).toContain('if (isImeComposing(event) || event.shiftKey || event.altKey) return')
    expect(read('components/prompts/PromptEmptyState.vue')).toContain('@keydown.enter.meta="handleEnterKey($event, generateFromKeyboard)"')
    // #459 起回车加标签后输入框留着，仍走 handleEnterKey
    expect(read('components/prompts/PromptHeader.vue')).toContain('@keydown.enter="handleEnterKey($event, () => commitTag(true))"')
    expect(read('components/prompts/VariableDefinitionList.vue')).toContain('@keydown.enter="handleEnterKey($event, commitName)"')
    expect(read('components/shortcuts/PromptLauncher.vue')).toContain('if (event.isComposing || event.keyCode === 229) return;')
  })
})
