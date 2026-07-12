import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readRendererFile = (path: string) => readFileSync(`src/renderer/${path}`, 'utf8')

describe('prompt management detail regressions', () => {
  it('keeps the workspace header compact and free of decorative status metadata', () => {
    const workspace = readRendererFile('components/prompt-management/PromptWorkspace.vue')

    expect(workspace).not.toContain('workspace-breadcrumb')
    expect(workspace).not.toContain('edit-status-dot')
    expect(workspace).toContain('hasUnsavedChanges')
  })

  it('does not show required-variable errors before a field has been touched', () => {
    const useWorkspace = readRendererFile('components/prompt-management/PromptUseWorkspace.vue')

    expect(useWorkspace).toContain('touchedVariables')
    expect(useWorkspace).toContain('showVariableError(variable.name)')
    expect(useWorkspace).toContain('@blur="markVariableTouched(variable.name)"')
    expect(useWorkspace).not.toContain(':validation-status="missingVariables.includes(variable.name)')
  })

  it('uses normal-flow filters and flex-height data tables', () => {
    const list = readRendererFile('components/prompt-management/PromptList.vue')
    const page = readRendererFile('pages/PromptManagementPage.vue')

    expect(list).toContain('class="prompt-filter-bar ui-toolbar"')
    expect(list).not.toContain('position: sticky')
    expect(list).not.toContain("calc(100vh - 250px)")
    expect(list.match(/\bflex-height\b/g)?.length).toBe(2)
    expect(list).toContain('grid-scroll-region')
    expect(list).toContain('.n-data-table-base-table-body) { min-height: 0; }')
    expect(list).toMatch(/\.advanced-filter-panel\s*\{[^}]*overflow-y:\s*auto/s)
    expect(list).toMatch(/key:\s*'name',[\s\S]*?tree:\s*true/)
    expect(list).toMatch(/\.folder-category-cell\)[^}]*display:\s*inline-flex/)
    expect(page).toContain('overflow: hidden')
  })

  it('anchors the main sidebar toggle below the flexible menu region', () => {
    const mainPage = readRendererFile('pages/MainPage.vue')

    expect(mainPage).toContain('<div class="main-layout">')
    expect(mainPage).toContain('class="main-layout-body"')
    expect(mainPage).toMatch(/\.main-sider-menu\s*\{[^}]*flex:\s*1/s)
    expect(mainPage).toMatch(/\.main-sider-toggle\s*\{[^}]*margin-top:\s*auto/s)
  })

  it('uses shared prompt-tag colors in list and edit surfaces', () => {
    const list = readRendererFile('components/prompt-management/PromptList.vue')
    const editor = readRendererFile('components/prompt-management/PromptEditModal.vue')
    const launcher = readRendererFile('components/shortcuts/PromptLauncher.vue')

    expect(list).toContain('color: getTagColor(tag)')
    expect(editor).toContain(':render-tag="renderPromptTag"')
    expect(editor).toContain(':color="getTagColor(tag)"')
    expect(launcher).toContain(':color="getTagColor(tag)"')
  })
})
