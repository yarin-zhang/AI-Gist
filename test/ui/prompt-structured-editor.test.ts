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

  it('uses the shared fill canvas in the workspace and shortcut launcher', () => {
    const workspace = readRendererFile('components/prompt-management/PromptUseWorkspace.vue')
    const launcher = readRendererFile('components/shortcuts/PromptLauncher.vue')
    const canvas = readRendererFile('components/prompt-management/PromptFillCanvas.vue')

    expect(workspace).toContain('<PromptFillCanvas')
    expect(launcher).toContain('<PromptFillCanvas')
    expect(canvas).toContain("viewMode === 'fill'")
    expect(canvas).toContain('prompt.isJinjaTemplate')
    expect(canvas).toContain(':first-occurrence="segment.firstOccurrence"')
    expect(canvas).toContain('validateAndFocus')
  })

  it('shares one variable inspector across regular and Jinja editors', () => {
    const regular = readRendererFile('components/prompt-management/RegularPromptEditor.vue')
    const jinja = readRendererFile('components/prompt-management/JinjaPromptEditor.vue')
    const inspector = readRendererFile('components/prompt-management/VariableInspector.vue')

    expect(regular).toContain('<VariableInspector')
    expect(jinja).toContain('<VariableInspector')
    expect(inspector).toContain('typeTextarea')
    expect(inspector).toContain('typeNumber')
    expect(inspector).toContain('typeBoolean')
    expect(inspector).toContain('unusedVariables')
  })

  it('aligns the use workspace with the embedded editor geometry', () => {
    const useWorkspace = readRendererFile('components/prompt-management/PromptUseWorkspace.vue')
    const fillCanvas = readRendererFile('components/prompt-management/PromptFillCanvas.vue')
    const structuredEditor = readRendererFile('components/prompt-management/StructuredPromptEditor.vue')

    expect(useWorkspace).toMatch(/\.use-workspace\s*\{[^}]*padding:\s*8px var\(--content-padding\) 0/s)
    expect(useWorkspace).toMatch(/\.use-action-bar\s*\{[^}]*height:\s*58px/s)
    expect(fillCanvas).toContain('padding: var(--content-padding)')
    expect(fillCanvas).not.toContain('clamp(20px, 4vw, 48px)')
    expect(fillCanvas).not.toContain('max-width: 900px')
    expect(fillCanvas).toMatch(/\.fill-toolbar\s*\{[^}]*min-height:\s*46px/s)
    expect(structuredEditor).toMatch(/\.structured-editor-toolbar\s*\{[^}]*min-height:\s*46px/s)
  })

  it('keeps full-height prompt panels inside their parent boxes', () => {
    const regular = readRendererFile('components/prompt-management/RegularPromptEditor.vue')
    const structured = readRendererFile('components/prompt-management/StructuredPromptEditor.vue')
    const inspector = readRendererFile('components/prompt-management/VariableInspector.vue')
    const fillCanvas = readRendererFile('components/prompt-management/PromptFillCanvas.vue')
    const useWorkspace = readRendererFile('components/prompt-management/PromptUseWorkspace.vue')

    for (const source of [regular, structured, inspector, fillCanvas, useWorkspace]) {
      expect(source).toContain('box-sizing: border-box')
    }
    expect(regular).toMatch(/\.editor-secondary-toolbar\s*\{[^}]*flex:\s*0 0 46px/s)
    expect(regular).toContain('padding-bottom: 8px')
    expect(regular).toContain(':show-variables-button="compactInspector"')
    expect(regular).not.toContain('class="drawer-trigger"')
    expect(structured).toContain("'request-open-variables': []")
    expect(structured).toContain('@media (max-width: 620px)')
    expect(useWorkspace).toContain('@click="openHistory"')
    expect(useWorkspace).toContain('historyPromptId')
  })
})
