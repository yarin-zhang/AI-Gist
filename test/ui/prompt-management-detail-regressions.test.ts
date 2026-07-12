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

  it('anchors the main sidebar toggle to the bottom of the sidebar region', () => {
    const mainPage = readRendererFile('pages/MainPage.vue')

    expect(mainPage).toContain('<div class="main-layout">')
    expect(mainPage).toContain('class="main-layout-body"')
    expect(mainPage).toContain('content-style="height: 100%;"')
    expect(mainPage).toMatch(/\.main-sider-content\s*\{[^}]*display:\s*grid/s)
    expect(mainPage).toMatch(/\.main-sider-content\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) 48px/s)
    expect(mainPage).toMatch(/\.main-sider-brand\s*\{[^}]*grid-row:\s*1/s)
    expect(mainPage).toMatch(/\.main-sider-menu\s*\{[^}]*grid-row:\s*2/s)
    expect(mainPage).toMatch(/\.main-sider-menu\s*\{[^}]*overflow-y:\s*auto/s)
    expect(mainPage).toMatch(/\.main-sider-toggle\s*\{[^}]*grid-row:\s*3/s)
    expect(mainPage).toMatch(/\.main-sider-toggle\s*\{[^}]*box-sizing:\s*border-box/s)
    expect(mainPage).not.toMatch(/\.main-sider-toggle\s*\{[^}]*position:\s*absolute/s)
  })

  it('keeps the workspace split drag gutter visually flush with both panes', () => {
    const page = readRendererFile('pages/PromptManagementPage.vue')

    expect(page).toContain(':resize-trigger-size="1"')
    expect(page).toMatch(/n-split__resize-trigger-wrapper\)[^}]*background:\s*transparent/s)
    expect(page).toMatch(/n-split__resize-trigger-wrapper\)::before[^}]*inset:\s*0 -4px/s)
    expect(page).toMatch(/\.workspace-resize-line\s*\{[^}]*width:\s*1px/s)
  })

  it('allows the category pane to collapse to a single visible category row', () => {
    const sidebar = readRendererFile('components/prompt-management/PromptLibrarySidebar.vue')

    expect(sidebar).toContain('MIN_CATEGORY_PANE_HEIGHT = 82')
    expect(sidebar).toContain(':max="librarySplitMax"')
    expect(sidebar).toContain('new ResizeObserver(updateLibrarySplitBounds)')
    expect(sidebar).not.toContain(':max="0.82"')
  })

  it('allows the active category filter to be clicked again to clear it', () => {
    const sidebar = readRendererFile('components/prompt-management/PromptLibrarySidebar.vue')

    expect(sidebar).toMatch(/key\.startsWith\('category:'\)\s*&&\s*activeFilter\.value\s*===\s*key/)
    expect(sidebar).toMatch(/activeFilter\.value\s*=\s*'all'[\s\S]*?return/)
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
