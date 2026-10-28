import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readRendererFile = (path: string) => readFileSync(`src/renderer/${path}`, 'utf8')

describe('prompt realtime sync details', () => {
  it('refreshes workspace and legacy views from committed database change events', () => {
    const page = readRendererFile('pages/PromptsPage.vue')

    expect(page).toContain("import { onDataChange } from '@/lib/services/data-change-events'")
    expect(page).toContain("['prompts', 'categories', 'promptVariables']")
    expect(page).toContain('refreshPending')
    expect(page).toContain('reconcileSelection()')
    // 卡片、表格、文件夹视图直接用同一份提示词列表，不再各自查询
    expect(page).toContain('const browsePrompts = computed(() => filterPromptLibrary(prompts.value, filters))')
  })

  it('keeps unsaved edits when a background refresh replaces the prompt list', () => {
    const page = readRendererFile('pages/PromptsPage.vue')
    const editor = readRendererFile('composables/prompt/usePromptEditor.ts')

    expect(page).toContain('if (!hasUnsavedChanges()) selectedPrompt.value = refreshed')
    expect(editor).toContain('if (sameRecord && dirty.value) return')
  })

  it('keeps a previous successful sync green while only a routine check is scheduled', () => {
    // 状态栏和设置页共用 resolveDataSyncStatusKind：没有本地变更、只是定期检查时，
    // 之前同步成功过就保持绿色（行为见 test/data-sync-status.test.ts）
    const indicator = readRendererFile('components/common/CloudSyncStatusIndicator.vue')

    expect(indicator).toContain("if (visualState.value === 'success') return 'ui-dot--success'")
    expect(indicator).toContain("case 'current': return 'success';")
    expect(indicator).toContain('resolveDataSyncStatusKind(createDataSyncStatusInput(status.value, {')
  })
})
