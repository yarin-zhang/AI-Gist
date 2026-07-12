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
    expect(list.match(/\bflex-height\b/g)?.length).toBe(1)
    expect(list).toContain('grid-scroll-region')
    expect(list).toContain('.n-data-table-base-table-body) { min-height: 0; }')
    expect(list).toMatch(/\.advanced-filter-panel\s*\{[^}]*overflow-y:\s*auto/s)
    expect(list).toContain('<PromptFolderExplorer v-if="viewMode === \'tree\'"')
    expect(list).not.toContain('redesignedTreeTableColumns')
    expect(page).toContain('overflow: hidden')
  })

  it('uses a Finder-style folder explorer for prompt classification', () => {
    const list = readRendererFile('components/prompt-management/PromptList.vue')
    const explorer = readRendererFile('components/prompt-management/PromptFolderExplorer.vue')

    expect(explorer).toContain('class="folder-explorer ui-surface"')
    expect(explorer).toContain('class="folder-sidebar ui-surface-muted"')
    expect(explorer).toContain('class="asset-glyph folder-glyph"')
    expect(explorer).toContain('class="asset-glyph prompt-file-glyph"')
    expect(explorer).toContain('stroke-width: 3.1')
    expect(explorer).toContain('<line v-for="line in getSkeletonLines(prompt.content)"')
    expect(explorer).not.toContain('<NIcon size="58"><Folder')
    expect(explorer).toContain('class="prompt-file-attachments"')
    expect(explorer).toContain('getPromptImages(prompt).slice(0, 3)')
    expect(explorer).toContain('class="prompt-file-attachment-count"')
    expect(list).toContain(':resolve-image-url="getImageUrlFromBlob"')
    expect(explorer).toContain('@dblclick="navigateTo(category.id || null)"')
    expect(explorer).toContain('@dblclick="openPrompt(prompt)"')
    expect(explorer).toContain('@dragstart="handleDragStart($event, prompt)"')
    expect(explorer).toContain('handleDragLeave($event, `category-${category.id}`)')
    expect(explorer).toContain('event.dataTransfer.setDragImage(preview')
    expect(explorer).toContain("emit('move', prompt, categoryId)")
    expect(list).toContain('api.prompts.update.mutate({')
    expect(list).toContain('data: { categoryId: targetCategoryId ?? undefined }')
    expect(list).toContain('await loadFolderData(false)')
    expect(list).toContain('const requestId = ++folderLoadRequestId')
    expect(list).toContain('const folderPromptCache = ref<PromptWithRelations[]>([])')
    expect(list).toMatch(/handleFolderNavigate = \(categoryId[\s\S]*?applyFolderLocation\(categoryId\)/)
    expect(list).not.toContain('prompts.value = prompts.value.filter(item => item.id !== prompt.id)')
    expect(list).toContain('const globalResults = categoryId === null')
  })

  it('lets the card grid consume the full desktop workspace width', () => {
    const list = readRendererFile('components/prompt-management/PromptList.vue')

    expect(list).toMatch(/\.prompt-list\s*\{[^}]*flex:\s*1 1 0[^}]*width:\s*100%[^}]*max-width:\s*none[^}]*min-width:\s*0/s)
    expect(list).toMatch(/\.grid-scroll-region\s*\{[^}]*width:\s*100%/s)
    expect(list).toMatch(/\.prompt-grid\s*\{[^}]*width:\s*100%[^}]*max-width:\s*none[^}]*grid-template-columns:\s*repeat\(auto-fill, minmax\(286px, 1fr\)\)/s)
  })

  it('places category management in the folder sidebar instead of the filter toolbar', () => {
    const list = readRendererFile('components/prompt-management/PromptList.vue')
    const explorer = readRendererFile('components/prompt-management/PromptFolderExplorer.vue')
    const page = readRendererFile('pages/PromptManagementPage.vue')
    const toolbarMarkup = list.slice(0, list.indexOf('<PromptFolderExplorer'))

    expect(toolbarMarkup).not.toContain("$emit('manage-categories')")
    expect(explorer).toContain('class="folder-category-settings"')
    expect(explorer).toContain("emit('manage-categories')")
    expect(list).toContain("(e: 'manage-categories'): void")
    expect(page).toContain('@manage-categories="showCategoryManagement = true"')
  })

  it('records usage for copy actions in every legacy prompt view', () => {
    const list = readRendererFile('components/prompt-management/PromptList.vue')

    expect(list).toContain("import { recordPromptUsage } from '@/lib/utils/prompt-usage'")
    expect(list.match(/recordPromptUsage\(\{/g)?.length).toBe(2)
    expect(list).toContain('prompt.useCount = updated.useCount')
    expect(list).toContain('incrementUseCount: id => api.prompts.incrementUseCount.mutate(id)')
  })

  it('keeps the creation editor content and variable panes at full available height', () => {
    const creation = readRendererFile('components/prompt-management/PromptCreationModal.vue')
    const editModal = readRendererFile('components/prompt-management/PromptEditModal.vue')
    const regularEditor = readRendererFile('components/prompt-management/RegularPromptEditor.vue')

    expect(creation).toMatch(/\.creation-content\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/s)
    expect(creation).toMatch(/\.creation-content :deep\(\.prompt-edit-embedded\)\s*\{[^}]*height:\s*100%[^}]*min-height:\s*0/s)
    expect(editModal).toContain('class="edit-workspace-form"')
    expect(editModal).toContain(':pane-style="workspacePaneStyle"')
    expect(editModal).toContain(':pane-wrapper-style="workspacePaneWrapperStyle"')
    expect(editModal).toMatch(/\.edit-workspace-tabs\s*\{[^}]*flex:\s*1 1 0[^}]*height:\s*100%[^}]*min-height:\s*0/s)
    expect(regularEditor).toMatch(/\.prompt-editor-split\s*\{[^}]*height:\s*100%[^}]*min-height:\s*0/s)
    expect(regularEditor).toMatch(/\.editor-shell-panel :deep\(> \.n-card__content\)\s*\{[^}]*flex:\s*1 1 0[^}]*min-height:\s*0/s)
    expect(regularEditor).toContain('class="prompt-content-input"')
    expect(regularEditor).toContain(':show-feedback="false"')
    expect(regularEditor).toMatch(/\.prompt-content-field\s*\{[^}]*flex:\s*1 1 0[^}]*height:\s*0/s)
    expect(regularEditor).not.toContain('contentHeight - 130')
  })

  it('uses a cohesive full-height workspace for AI-assisted prompt creation', () => {
    const creation = readRendererFile('components/prompt-management/PromptCreationModal.vue')
    const generator = readRendererFile('components/ai/AIGeneratorComponent.vue')

    expect(creation).toContain("t('promptWorkspace.manualCreate')")
    expect(creation).toContain("t('promptManagement.aiGenerate')")
    expect(creation).not.toContain('<small>')
    expect(creation).toMatch(/\.ai-creation-pane\s*\{[^}]*padding:\s*var\(--content-padding\)[^}]*overflow:\s*hidden/s)
    expect(generator).toContain('class="generator-workspace-grid"')
    expect(generator).toContain('class="generator-panel requirement-panel"')
    expect(generator).toContain('class="generator-panel result-panel"')
    expect(generator).toContain('class="workspace-textarea result-textarea"')
    expect(generator).not.toContain('<n-split')
    expect(generator).toMatch(/\.generator-workspace-grid\s*\{[^}]*height:\s*100%[^}]*grid-template-columns:/s)
    expect(generator).toMatch(/\.generator-panel\s*\{[^}]*height:\s*100%[^}]*display:\s*flex[^}]*overflow:\s*hidden/s)
    expect(generator).toMatch(/\.requirement-form-item\s*\{[^}]*flex:\s*1 1 0[^}]*height:\s*0/s)
    expect(generator).toMatch(/\.history-scroll\s*\{[^}]*flex:\s*1 1 0[^}]*height:\s*0/s)
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

  it('shares navigation icons between the sidebar and page headers', () => {
    const icons = readRendererFile('theme/navigation-icons.ts')
    const mainPage = readRendererFile('pages/MainPage.vue')
    const promptPage = readRendererFile('pages/PromptManagementPage.vue')
    const aiConfigPage = readRendererFile('pages/AIConfigPage.vue')
    const settingsPage = readRendererFile('pages/SettingsPage.vue')

    expect(icons).toContain('Star as PromptNavigationIcon')
    expect(icons).toContain('Diamonds as AIConfigNavigationIcon')
    expect(icons).toContain('Settings as SettingsNavigationIcon')
    expect(mainPage).toContain('h(PromptNavigationIcon)')
    expect(mainPage).toContain('h(AIConfigNavigationIcon)')
    expect(mainPage).toContain('h(SettingsNavigationIcon)')
    expect(promptPage).toContain('<PromptNavigationIcon />')
    expect(aiConfigPage).toContain('<AIConfigNavigationIcon />')
    expect(settingsPage).toContain('<SettingsNavigationIcon />')
  })

  it('shows the About logo beside the expanded sidebar brand name', () => {
    const mainPage = readRendererFile('pages/MainPage.vue')

    expect(mainPage).toContain("new URL('../assets/images/logo.png', import.meta.url).href")
    expect(mainPage).toContain('<img :src="appIcon" class="main-sider-brand-logo" alt="" />')
    expect(mainPage).toMatch(/\.main-sider-brand-logo\s*\{[^}]*width:\s*30px/s)
    expect(mainPage).toMatch(/\.main-sider-brand-logo\s*\{[^}]*border-radius:\s*var\(--radius-image\)/s)
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
    const sidebar = readRendererFile('components/prompt-management/PromptLibrarySidebar.vue')
    const editor = readRendererFile('components/prompt-management/PromptEditModal.vue')
    const launcher = readRendererFile('components/shortcuts/PromptLauncher.vue')

    expect(list).toContain('color: getTagColor(tag)')
    expect(sidebar).toContain(':color="getTagColor(tag)"')
    expect(sidebar).toContain('getPromptTags(prompt).slice(0, 2)')
    expect(sidebar).toContain('prompt-list-tag-overflow')
    expect(editor).toContain(':render-tag="renderPromptTag"')
    expect(editor).toContain(':color="getTagColor(tag)"')
    expect(launcher).toContain(':color="getTagColor(tag)"')
  })

  it('uses neutral stars by default and warning color only for favorited prompts', () => {
    const list = readRendererFile('components/prompt-management/PromptList.vue')
    const sidebar = readRendererFile('components/prompt-management/PromptLibrarySidebar.vue')
    const workspace = readRendererFile('components/prompt-management/PromptWorkspace.vue')

    expect(list).not.toContain('Heart')
    expect(sidebar).not.toContain('Heart')
    expect(list).toContain('<Star />')
    expect(list).toContain("prompt.isFavorite ? 'var(--accent-warning)' : undefined")
    expect(list).toContain("row.isFavorite ? 'var(--accent-warning)' : undefined")
    expect(sidebar).not.toContain('iconColor')
    expect(workspace).toContain(":color=\"prompt.isFavorite ? 'var(--accent-warning)' : undefined\"")
    expect(list).not.toContain("isFavorite ? 'error' : 'default'")
  })

  it('uses colored category and tag chips in cards without empty taxonomy copy', () => {
    const list = readRendererFile('components/prompt-management/PromptList.vue')

    expect(list).not.toContain('prompt-card-kind')
    expect(list).not.toContain("prompt.isJinjaTemplate ? 'Jinja'")
    expect(list).toContain(':color="getCategoryTagColor(prompt.category)"')
    expect(list).toContain('getTagsArray(prompt.tags).slice(0, 2)')
    expect(list).not.toContain('<span v-else class="prompt-card-category">')
  })

  it('keeps settings dividers compact inside the scrollable detail area', () => {
    const settingsPage = readRendererFile('pages/SettingsPage.vue')

    expect(settingsPage).toMatch(/\.settings-content-inner :deep\(\.n-divider:not\(\.n-divider--vertical\)\)\s*\{[^}]*margin:\s*0/s)
    expect(settingsPage).not.toContain('.settings-content :deep(.n-divider')
  })
})
