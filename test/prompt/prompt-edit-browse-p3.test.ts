import { readFileSync } from 'node:fs'
import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 编辑与变量、版本历史与 AI 页签、浏览视图的打磨（Gitea #459、#460、#461、#466）

const mocks = vi.hoisted(() => ({
  streamGeneration: vi.fn(),
}))

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('naive-ui', async importOriginal => ({
  ...(await importOriginal<typeof import('naive-ui')>()),
  useMessage: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}))
vi.mock('@/lib/api', () => ({
  api: {
    aiGenerationHistory: { create: { mutate: async () => ({}) } },
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

const { usePromptAISession } = await import('@/composables/prompt/usePromptAISession')
const { parseMoveAction } = await import('@/composables/prompt/usePromptMenu')
const { compareVersionFields, localizeHistoryDescription } = await import('@/lib/utils/prompt-history-display')

const read = (path: string) => readFileSync(`src/renderer/${path}`, 'utf8')

beforeEach(() => {
  mocks.streamGeneration.mockReset()
})

describe('#460 version history', () => {
  // 把 key 和参数原样拼出来，看得出认成了哪条说明、取出了什么参数
  const t = (key: string, named?: Record<string, unknown>) => (named && Object.keys(named).length ? `${key} ${JSON.stringify(named)}` : key)

  it('re-translates automatic change descriptions stored in any language', () => {
    expect(localizeHistoryDescription('编辑更新', t)).toBe('promptManagement.editUpdate')
    expect(localizeHistoryDescription('Edited', t)).toBe('promptManagement.editUpdate')
    expect(localizeHistoryDescription('Edit Update', t)).toBe('promptManagement.editUpdate')
    expect(localizeHistoryDescription('修改前的内容', t)).toBe('promptHistory.beforeEdit')
    expect(localizeHistoryDescription('AI 生成标题和描述', t)).toBe('promptHistory.aiSummary')
    expect(localizeHistoryDescription('恢复自 v3', t)).toBe('promptHistory.restoredFrom {"version":"3"}')
    expect(localizeHistoryDescription('采纳 AI 修改：更简短', t)).toBe('promptHistory.adoptedAI {"label":"更简短"}')
    expect(localizeHistoryDescription('Modifica AI accettata: Più breve', t)).toBe('promptHistory.adoptedAI {"label":"Più breve"}')
  })

  it('keeps descriptions the user wrote as they are', () => {
    expect(localizeHistoryDescription('改了开头的语气', t)).toBe('改了开头的语气')
    expect(localizeHistoryDescription('  ', t)).toBe('')
    expect(localizeHistoryDescription(undefined, t)).toBe('')
  })

  it('lists title, description, category, tag and variable-setting changes besides the body', () => {
    const before = {
      title: 'Weekly status',
      description: '旧描述',
      categoryId: 1,
      tags: 'report,weekly',
      variables: JSON.stringify([{ name: 'tone', type: 'select', options: ['A', 'B'], required: true }, { name: 'topic', type: 'text', required: true }]),
    }
    const after = {
      title: 'Weekly status',
      description: '新描述',
      categoryId: null,
      tags: ['report', 'team'],
      variables: [{ name: 'tone', type: 'select', options: ['A', 'B'], defaultValue: 'A', required: true }, { name: 'topic', type: 'text', required: true }],
    }
    const changes = compareVersionFields(before, after, id => (id === null ? '未分类' : `分类 ${id}`))
    expect(changes.map(change => change.key)).toEqual(['description', 'category', 'tags', 'variables'])
    expect(changes[0]).toMatchObject({ before: '旧描述', after: '新描述' })
    expect(changes[1]).toMatchObject({ before: '分类 1', after: '未分类' })
    expect(changes[2]).toMatchObject({ added: ['team'], removed: ['weekly'] })
    expect(changes[3].added).toEqual(['tone'])
  })

  it('reports nothing for an identical snapshot, treating empty and missing settings the same', () => {
    const snapshot = { title: 'A', description: '', tags: '', variables: '[{"name":"x","type":"text","required":true,"defaultValue":""}]' }
    expect(compareVersionFields(snapshot, { title: 'A', tags: [], variables: [{ name: 'x', type: 'text', required: true }] }, () => '')).toEqual([])
  })

  it('lets the current version description be edited and keeps the input inside the panel', () => {
    const panel = read('components/prompts/PromptHistoryPanel.vue')
    expect(panel).toContain('editingCurrent')
    expect(panel).toContain('localizeHistoryDescription(version.changeDescription, t)')
    expect(panel).toMatch(/\.history-item \{[^}]*box-sizing: border-box;/)
    const page = read('components/prompts/PromptPage.vue')
    expect(page).toContain("t('promptHistory.bodyUnchanged')")
    expect(page).toContain('compareVersionFields(version')
  })
})

describe('#460 AI session notes follow what happened to the suggestion', () => {
  const session = () => usePromptAISession({ content: () => '原文', rendered: () => '原文', title: () => '标题' })
  const notes = (ai: ReturnType<typeof session>) => ai.messages.value.filter(item => item.kind === 'note').map(item => item.text)

  it('marks a suggestion as replaced, discarded or adopted instead of leaving "adopt or discard below"', async () => {
    mocks.streamGeneration.mockResolvedValue({ generatedPrompt: '新文' })
    const ai = session()
    await ai.adjust('更简短')
    expect(notes(ai)).toEqual(['promptAI.suggestionReady'])
    await ai.regenerate()
    expect(notes(ai)).toEqual(['promptAI.suggestionReplacedNote', 'promptAI.suggestionReady'])
    ai.discard()
    expect(notes(ai)).toEqual(['promptAI.suggestionReplacedNote', 'promptAI.suggestionDiscardedNote'])
    await ai.adjust('换个说法')
    expect(ai.adopt()?.proposed).toBe('新文')
    expect(notes(ai).at(-1)).toBe('promptAI.suggestionAdoptedNote')
  })

  it('updates the title-and-description note when the preview is adopted or discarded', async () => {
    mocks.streamGeneration.mockResolvedValue({ generatedPrompt: '{"title":"周报","description":"整理周报"}' })
    const ai = session()
    await ai.summarize([], { echo: true })
    expect(notes(ai)).toEqual(['promptAI.summaryReady'])
    ai.resolveSummary(false)
    expect(notes(ai)).toEqual(['promptAI.summaryDiscardedNote'])
  })

  it('explains a greyed-out test run, asks before leaving a pending suggestion and puts units on the counts', () => {
    const panel = read('components/prompts/PromptAIPanel.vue')
    expect(panel).toContain(':disabled="busy || !canEdit" @click="emit(\'run\')"')
    expect(panel).toContain('{{ runHint }}')
    const page = read('components/prompts/PromptPage.vue')
    expect(page).toContain('hasPendingAISuggestion')
    expect(page).toContain("t('promptAI.charUnit', { count: suggestionCharCount }, suggestionCharCount)")
    const prompts = read('pages/PromptsPage.vue')
    expect(prompts).toContain("activePage()?.hasPendingAISuggestion")
    expect(prompts).toContain("t('promptAI.pendingSuggestionTitle')")
  })
})

describe('#460 selection after deleting and after leaving a filter', () => {
  it('selects the neighbour in list order instead of the first prompt', () => {
    const page = read('pages/PromptsPage.vue')
    expect(page).toContain('const rememberListPosition = (ids: number[])')
    expect(page).not.toContain('selectedPrompt.value = prompts.value[0] || null\n      dirtyPromptId')
  })

  it('keeps the open prompt in the library list until the user moves on or changes the filter', () => {
    const list = read('components/prompts/PromptLibraryList.vue')
    expect(list).toContain('const kept = ref<{ id: number; index: number } | null>(null)')
    expect(list).toContain('watch([matched, filterKey, () => props.selectedId]')
  })
})

describe('#459 editing details', () => {
  it('guides `{{` without reporting the placeholder that is still being typed, and opens a created variable', () => {
    const editor = read('components/prompt-management/StructuredPromptEditor.vue')
    expect(editor).toContain("t('promptEditor.typeVariableName')")
    expect(editor).toContain('const findTypingStart = ')
    expect(editor).toContain("if (created) emit('variable-created', name)")
    expect(read('components/prompts/PromptPage.vue')).toContain('@variable-created="handleVariableCreated"')
  })

  it('lets the borderless theme win so both body modes share font and margins', () => {
    const editor = read('components/prompt-management/StructuredPromptEditor.vue')
    expect(editor.indexOf('...(props.bare ? [bareTheme] : []),')).toBeLessThan(editor.indexOf('      editorTheme,'))
  })

  it('shows boolean defaults as yes / no, validates numbers and hides "required" for toggles', () => {
    const list = read('components/prompts/VariableDefinitionList.vue')
    expect(list).toContain("if (variable.defaultValue === 'true') return t('promptPage.yes')")
    expect(list).toContain('<NInputNumber v-else-if="normalizedType(variable) === \'number\'"')
    expect(list).toContain('v-if="normalizedType(variable) !== \'boolean\' || jinja"')
    expect(list).toContain("t('promptPage.variableDescriptionPlaceholder')")
    expect(list).toContain('commitOption(variable, true)')
    expect(read('components/prompts/PromptHeader.vue')).toContain('commitTag(true)')
  })

  it('focuses selects, toggles and button groups when a body chip is clicked', () => {
    const fields = read('components/prompts/VariableFieldList.vue')
    expect(fields).toContain('[tabindex]:not([tabindex="-1"])')
    expect(fields).toContain("next.closest('.ui-var')")
    expect(fields).toContain("'field--active'")
  })

  it('carries the filled value over to a renamed variable', () => {
    const page = read('components/prompts/PromptPage.vue')
    expect(page).toContain('@update="updateDefinition"')
    expect(page).toContain('pendingRenames.forEach((next, previous) => {')
  })
})

describe('#461 browse views', () => {
  it('parses "move to category" menu keys', () => {
    expect(parseMoveAction('move:12')).toBe(12)
    expect(parseMoveAction('move:none')).toBeNull()
    expect(parseMoveAction('copy')).toBeUndefined()
  })

  it('offers the same menu, including copy with defaults and move, in cards, table rows and folders', () => {
    const menu = read('composables/prompt/usePromptMenu.ts')
    expect(menu).toContain("{ key: 'copy', label: t('promptBrowse.copyWithDefaults')")
    expect(menu).toContain("key: 'move'")
    for (const view of ['PromptCardGrid', 'PromptTable', 'PromptFolderView']) {
      expect(read(`components/prompts/${view}.vue`)).toContain('usePromptMenu(props.canSetShortcut, () => props.categories)')
    }
  })

  it('opens folder tiles on a single click and shows the drop hint beside the row', () => {
    const folder = read('components/prompts/PromptFolderView.vue')
    expect(folder).toContain('@dragstart="startDrag($event, prompt)" @dragend="endDrag" @click="emit(\'open\', prompt)"')
    expect(folder).not.toContain('folder-item__hint')
    expect(folder).toContain('trigger="manual" placement="right"')
  })

  it('keeps loaded cards after a delete and shows the filtered count', () => {
    expect(read('components/prompts/PromptCardGrid.vue')).not.toContain('watch(() => props.prompts.length')
    const header = read('components/prompts/PromptBrowseHeader.vue')
    expect(header).toContain('matchedCount === total ? total : `${matchedCount} / ${total}`')
    expect(header).toContain("t('promptBrowse.tagsMatchAll')")
    expect(header).toContain('closeFilterOnEscape')
  })

  it('lets a category with prompts be deleted, moving its prompts to "Uncategorized"', () => {
    const modal = read('components/prompt-management/CategoryManageModal.vue')
    expect(modal).toContain('movePromptsToUncategorized: promptCount > 0')
    expect(modal).not.toContain(":disabled=\"getCategoryPromptCount(category.id!) > 0")
  })
})

describe('#466 placeholders', () => {
  it('ends long single-line placeholders with an ellipsis', () => {
    const scss = read('assets/scss/overrides/naive-override.scss')
    expect(scss).toMatch(/\.n-input:not\(\.n-input--textarea\) \.n-input__placeholder > span \{[^}]*text-overflow: ellipsis;/)
  })
})
