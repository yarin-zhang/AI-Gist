import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readRendererFile = (path: string) => readFileSync(`src/renderer/${path}`, 'utf8')

describe('structured prompt editor wiring', () => {
  it('keeps the stored template syntax compatible while presenting variable blocks', () => {
    const editor = readRendererFile('components/prompt-management/StructuredPromptEditor.vue')
    const core = readRendererFile('lib/utils/prompt-template.ts')

    expect(editor).toContain('Decoration.replace')
    expect(editor).toContain('EditorView.atomicRanges')
    expect(editor).toContain('autocompletion')
    expect(editor).toContain('setVisualMode(false)')
    expect(editor).toContain('`{{${name}}}`')
    expect(core).toContain('PLACEHOLDER_PATTERN')
    expect(core).toContain('reconcilePromptVariables')
  })

  it('syncs content only after IME composition and drops transient variable names', () => {
    const editor = readRendererFile('components/prompt-management/StructuredPromptEditor.vue')
    const state = readRendererFile('composables/prompt/usePromptEditor.ts')

    expect(editor).toContain('update.view.composing')
    expect(editor).toContain('compositionend')
    expect(state).toContain('{ retainUnused }')
    expect(state).toContain('retainedNames.has(variable.name) || isVariableConfigured(variable)')
  })

  it('renders variable names as V5 chips in the borderless editor used by the prompt page', () => {
    const editor = readRendererFile('components/prompt-management/StructuredPromptEditor.vue')
    const page = readRendererFile('components/prompts/PromptPage.vue')

    expect(editor).toContain("button.className = `ui-var ui-var--name${this.selected ? ' ui-var--active' : ''}`")
    expect(editor).toContain('<div v-if="!bare" class="structured-editor-toolbar ui-toolbar">')
    expect(page).toContain('<StructuredPromptEditor v-else-if="bodyEditable" ref="editorRef" bare')
    expect(page).toContain('@select-variable="selectDefinition"')
  })

  it('lets every existing variable be inserted at the editor cursor (issue 373)', () => {
    const structured = readRendererFile('components/prompt-management/StructuredPromptEditor.vue')
    const page = readRendererFile('components/prompts/PromptPage.vue')

    // Toolbar: existing variables first, then a create entry.
    expect(structured).toContain('<NDropdown v-if="insertableVariableNames.length"')
    expect(structured).toContain('NEW_VARIABLE_KEY')
    expect(structured).toContain("{ key: 'divider', type: 'divider' }")
    expect(structured).toMatch(/handleInsertVariableSelect[\s\S]*?emit\('request-add-variable'\)[\s\S]*?insertVariable\(String\(key\)\)/)

    // Inserts reuse the editor's own selection after blur instead of a stale snapshot.
    expect(structured).not.toContain('lastSelection')
    expect(structured).toContain('hasUserCursor || editorView.hasFocus')
    expect(structured).toContain("emit('variable-inserted', name)")

    // 「新建变量」按钮把占位符插到光标处
    expect(page).toMatch(/const addVariableAtCursor = async \(\) => \{[\s\S]*?editorRef\.value\?\.insertVariable/)
  })
})
