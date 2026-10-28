import { readFileSync } from 'node:fs'
import { nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PromptWithRelations } from '@shared/types/database'

// 提示词页编辑 / AI 生成的几处修复（Gitea #409–#414）

const mocks = vi.hoisted(() => ({
  histories: [] as any[],
  createPrompt: vi.fn(),
  updatePrompt: vi.fn(),
  createHistory: vi.fn(),
  streamGeneration: vi.fn(),
  recordGeneration: vi.fn(),
}))

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('naive-ui', () => ({ useMessage: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }) }))
vi.mock('@/lib/api', () => ({
  api: {
    prompts: {
      getAll: { query: async () => [] },
      create: { mutate: (...args: unknown[]) => mocks.createPrompt(...args) },
      update: { mutate: (...args: unknown[]) => mocks.updatePrompt(...args) },
    },
    promptHistories: {
      getByPromptId: { query: async () => [...mocks.histories].sort((a, b) => b.version - a.version) },
      create: { mutate: (...args: unknown[]) => mocks.createHistory(...args) },
    },
    aiGenerationHistory: {
      create: { mutate: (...args: unknown[]) => mocks.recordGeneration(...args) },
      getPaginated: { query: async () => ({ data: [] }) },
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

const { rankVariableCompletions, findCompletionMatch } = await import('@/lib/utils/variable-completion')
const { applyChangedDefaults, createVariable } = await import('@/lib/utils/prompt-template')
const { historyMatchesPrompt } = await import('@/lib/utils/prompt-editor')
const { usePromptEditor } = await import('@/composables/prompt/usePromptEditor')
const { usePromptGeneration } = await import('@/composables/prompt/usePromptGeneration')
const { GenerationStoppedError } = await import('@/lib/utils/ai-request')

describe('#409 variable completion after {{', () => {
  const names = ['customer_name', 'issue', 'compensation', 'issue_date']

  it('puts exact and prefix matches first so Enter picks the typed variable', () => {
    expect(rankVariableCompletions(names, 'issue')).toEqual(['issue', 'issue_date'])
    expect(rankVariableCompletions(names, 'iss')).toEqual(['issue', 'issue_date'])
    expect(rankVariableCompletions(names, 'name')).toEqual(['customer_name'])
    expect(rankVariableCompletions(names, 'ISS')).toEqual(['issue', 'issue_date'])
  })

  it('lists every variable before anything is typed and nothing when nothing matches', () => {
    expect(rankVariableCompletions([...names, 'issue'], '')).toEqual(names)
    expect(rankVariableCompletions(names, 'zzz')).toEqual([])
  })

  it('highlights the matched part of the name', () => {
    expect(findCompletionMatch('customer_name', 'name')).toEqual([9, 13])
    expect(findCompletionMatch('issue', '')).toEqual([])
  })

  it('only ranks the create entry first when no existing variable matches', () => {
    const editor = readFileSync('src/renderer/components/prompt-management/StructuredPromptEditor.vue', 'utf8')
    expect(editor).toContain('rankVariableCompletions(existingNames, typed)')
    expect(editor).toMatch(/if \(matchedNames\.length\) options\.push\(createOption\)\s*else options\.unshift\(createOption\)/)
  })
})

describe('#410 fill values follow changed defaults', () => {
  const variable = (name: string, type: string, defaultValue = '') => ({ ...createVariable(name), type, defaultValue })

  it('fills empty values and values still on the old default, keeps what the user typed', () => {
    const before = [variable('role', 'text'), variable('tone', 'select'), variable('include_risks', 'boolean'), variable('max_items', 'number'), variable('note', 'text')]
    const after = [variable('role', 'text', '项目经理'), variable('tone', 'select', '正式'), variable('include_risks', 'boolean', 'true'), variable('max_items', 'number', '8'), variable('note', 'text', '默认')]
    const values = { role: '', tone: '', include_risks: false, max_items: '', note: '我自己写的' }
    expect(applyChangedDefaults(before, after, values)).toEqual({
      role: '项目经理', tone: '正式', include_risks: true, max_items: '8', note: '我自己写的',
    })
  })

  it('moves a value that still equals the previous default and ignores unchanged defaults', () => {
    expect(applyChangedDefaults([variable('tone', 'text', '正式')], [variable('tone', 'text', '轻松')], { tone: '正式' }))
      .toEqual({ tone: '轻松' })
    expect(applyChangedDefaults([variable('tone', 'text', '正式')], [variable('tone', 'text', '正式')], { tone: '' })).toBeNull()
  })

  it('copies only filled values when a new prompt is saved', () => {
    const page = readFileSync('src/renderer/pages/PromptsPage.vue', 'utf8')
    expect(page).toContain('filter(([, value]) => !isEmptyPromptValue(value))')
    const promptPage = readFileSync('src/renderer/components/prompts/PromptPage.vue', 'utf8')
    expect(promptPage).toContain('applyChangedDefaults(previous.variables, list, props.draft)')
  })
})

const storedPrompt = (overrides: Partial<PromptWithRelations> = {}) => ({
  id: 3,
  uuid: 'p3',
  title: '周报',
  description: '旧描述',
  content: '原来的正文 {{name}}',
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

const recordedVersions = () => mocks.createHistory.mock.calls.map(([record]) => ({
  version: record.version,
  content: record.content,
  changeDescription: record.changeDescription,
}))

describe('#411 version history keeps every content before a save', () => {
  beforeEach(() => {
    mocks.histories = []
    mocks.createHistory.mockReset().mockImplementation(async (record: any) => {
      mocks.histories.push({ ...record, id: mocks.histories.length + 1 })
      return record
    })
    mocks.createPrompt.mockReset().mockImplementation(async (data: any) => ({ ...data, id: 9 }))
    mocks.updatePrompt.mockReset().mockImplementation(async ({ id, data }: any) => ({ ...data, id }))
  })

  it('records the created content as v1', async () => {
    const editor = usePromptEditor(ref(null))
    editor.form.value.title = '新提示词'
    editor.form.value.content = '第一版正文'
    await editor.save()
    expect(recordedVersions()).toEqual([{ version: 1, content: '第一版正文', changeDescription: 'promptHistory.createdVersion' }])
  })

  it('records the content before the first save of a prompt that has no history yet', async () => {
    const editor = usePromptEditor(ref(storedPrompt()))
    await nextTick()
    editor.form.value.content = '改过的正文'
    await editor.save()
    expect(recordedVersions()).toEqual([
      { version: 1, content: '原来的正文 {{name}}', changeDescription: 'promptHistory.beforeEdit' },
      { version: 2, content: '改过的正文', changeDescription: 'promptManagement.editUpdate' },
    ])
    expect(mocks.createHistory.mock.calls[0][0].createdAt).toEqual(new Date('2026-01-02T00:00:00Z'))
  })

  it('adds only the new version when the latest one already matches the stored prompt', async () => {
    const prompt = storedPrompt()
    mocks.histories = [{ id: 1, promptId: 3, version: 1, title: prompt.title, description: prompt.description, content: prompt.content, isJinjaTemplate: false }]
    const editor = usePromptEditor(ref(prompt))
    await nextTick()
    editor.form.value.content = '改过的正文'
    await editor.save()
    expect(recordedVersions()).toEqual([{ version: 2, content: '改过的正文', changeDescription: 'promptManagement.editUpdate' }])
  })

  it('backfills content that was changed elsewhere since the latest version', async () => {
    mocks.histories = [{ id: 1, promptId: 3, version: 1, title: '周报', description: '旧描述', content: '更早的正文', isJinjaTemplate: false }]
    const editor = usePromptEditor(ref(storedPrompt()))
    await nextTick()
    editor.form.value.content = '改过的正文'
    await editor.save({ changeDescription: '补充约束' })
    expect(recordedVersions()).toEqual([
      { version: 2, content: '原来的正文 {{name}}', changeDescription: 'promptHistory.beforeEdit' },
      { version: 3, content: '改过的正文', changeDescription: '补充约束' },
    ])
  })

  it('does not write a version when the update itself fails', async () => {
    mocks.updatePrompt.mockReset().mockRejectedValue(new Error('db locked'))
    const editor = usePromptEditor(ref(storedPrompt()))
    await nextTick()
    editor.form.value.content = '改过的正文'
    expect(await editor.save()).toBeNull()
    expect(mocks.createHistory).not.toHaveBeenCalled()
  })

  it('treats the latest version as current only when it matches the stored prompt', () => {
    const prompt = { title: 'A', description: '', content: 'x', isJinjaTemplate: false }
    expect(historyMatchesPrompt({ ...prompt, description: undefined }, prompt)).toBe(true)
    expect(historyMatchesPrompt({ ...prompt, content: 'y' }, prompt)).toBe(false)
    expect(historyMatchesPrompt(undefined, prompt)).toBe(false)
  })
})

describe('#414 generation status tells success, failure, stop and interruption apart', () => {
  beforeEach(() => {
    mocks.streamGeneration.mockReset()
    mocks.recordGeneration.mockReset().mockResolvedValue({})
  })

  it('reports success only when the model returned content', async () => {
    mocks.streamGeneration.mockImplementation(async ({ onPartial }: any) => {
      onPartial('# 角色')
      return { generatedPrompt: '# 角色\n完整内容' }
    })
    const generation = usePromptGeneration()
    expect(await generation.generate('写周报', () => undefined)).toBe('# 角色\n完整内容')
    expect(generation.status.value).toBe('success')
    expect(generation.partial.value).toBe(false)
    expect(generation.request.value).toBe('写周报')
  })

  it('marks a failure before any content as error', async () => {
    mocks.streamGeneration.mockRejectedValue(new Error('401 Incorrect API key'))
    const generation = usePromptGeneration()
    expect(await generation.generate('写周报', () => undefined)).toBeNull()
    expect(generation.status.value).toBe('error')
    expect(generation.errorMessage.value).toBe('401 Incorrect API key')
    expect(generation.partial.value).toBe(false)
  })

  it('marks a failure after partial content as interrupted', async () => {
    mocks.streamGeneration.mockImplementation(async ({ onPartial }: any) => {
      onPartial('# 角色\n# 要')
      throw new Error('Request timed out')
    })
    const generation = usePromptGeneration()
    await generation.generate('写周报', () => undefined)
    expect(generation.status.value).toBe('interrupted')
    expect(generation.partial.value).toBe(true)
  })

  it('marks a user stop as stopped and keeps track of partial content', async () => {
    mocks.streamGeneration.mockImplementation(async ({ onPartial }: any) => {
      onPartial('# 角色')
      throw new GenerationStoppedError()
    })
    const generation = usePromptGeneration()
    await generation.generate('写周报', () => undefined)
    expect(generation.status.value).toBe('stopped')
    expect(generation.partial.value).toBe(true)
    generation.reset()
    expect(generation.status.value).toBe('idle')
  })

  it('treats an empty reply as a failure', async () => {
    mocks.streamGeneration.mockResolvedValue({ generatedPrompt: '  ' })
    const generation = usePromptGeneration()
    expect(await generation.generate('写周报', () => undefined)).toBeNull()
    expect(generation.status.value).toBe('error')
  })

  it('shows "generated" in the panel only for a real success', () => {
    const panel = readFileSync('src/renderer/components/prompts/PromptGeneratePanel.vue', 'utf8')
    expect(panel).not.toContain('finished')
    expect(panel).toContain(`v-else-if="status === 'success'"`)
    expect(panel).toContain("@click=\"emit('revert')\"")
  })
})

describe('#412 #413 AI results never overwrite user content silently', () => {
  const page = readFileSync('src/renderer/components/prompts/PromptPage.vue', 'utf8')
  const section = (start: string, end: string) => page.slice(page.indexOf(start), page.indexOf(end, page.indexOf(start)))

  it('asks before generation or a history record replaces text the user wrote', () => {
    expect(section('const generateFromDescription', 'const revertGeneration')).toContain('await confirmReplaceContent()')
    expect(section('const useGenerationHistory', '// ---------- 版本历史')).toContain('await confirmReplaceContent()')
    expect(page).toContain("title: t('promptGenerate.replaceTitle')")
  })

  it('previews a generated title and description instead of writing and saving them', () => {
    const summarize = section('const summarize = async', 'const adoptSummary')
    expect(summarize).toContain('summaryPreview.value = result')
    expect(summarize).not.toContain('saveChanges')
    expect(summarize).not.toContain('form.value.title =')
    expect(section('const adoptSummary', 'const discardSummary')).not.toContain('saveChanges')
  })

  it('only fills blank fields after generation and skips auto-save without a title', () => {
    const fill = section('const fillSummaryBlanks', '// ---------- 新建：AI 生成')
    expect(fill).toContain('if (!form.value.title.trim()) form.value.title = result.title')
    const generate = section('const generateFromDescription', 'const revertGeneration')
    expect(generate).toContain('if (hasTitle) await saveChanges()')
    expect(generate).toContain("message.warning(t('promptGenerate.autoSaveNeedsTitle'))")
  })
})
