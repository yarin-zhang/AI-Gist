import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readRendererFile = (path: string) => readFileSync(`src/renderer/${path}`, 'utf8')

describe('prompt management detail regressions', () => {

  it('lets prompts be dragged onto a folder to change their category', () => {
    const folder = readRendererFile('components/prompts/PromptFolderView.vue')
    const page = readRendererFile('pages/PromptsPage.vue')

    expect(folder).toContain('draggable="true"')
    expect(folder).toContain('@drop.prevent="drop(category.id!)"')
    expect(folder).toContain("emit('move', prompt, categoryId)")
    expect(page).toContain('@move="handleFolderMove"')
    expect(page).toMatch(/const handleFolderMove = async[\s\S]*?actions\.moveToCategory\(\[prompt\], categoryId/)
  })

  it('does not accept drops on "All prompts", only on categories and Uncategorized (#408)', () => {
    const folder = readRendererFile('components/prompts/PromptFolderView.vue')
    const allButton = folder.match(/<button[^>]*filters\.categoryId = null"[^>]*>/)?.[0] || ''
    const noneButton = folder.match(/<button[^>]*filters\.categoryId = 'none'"[^>]*>/)?.[0] || ''

    expect(allButton).not.toBe('')
    expect(allButton).not.toMatch(/@drag|@drop/)
    expect(noneButton).toContain('@drop.prevent="drop(null)"')
    expect(folder).not.toContain("markDrop('all')")
  })

  it('lets the card grid consume the full desktop workspace width', () => {
    const grid = readRendererFile('components/prompts/PromptCardGrid.vue')

    expect(grid).toMatch(/\.card-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill, minmax\(min\(280px, 100%\), 1fr\)\)/s)
  })

  it('lets users persistently adjust category order', () => {
    const modal = readRendererFile('components/prompt-management/CategoryManageModal.vue')
    const service = readRendererFile('lib/services/category.service.ts')

    expect(modal).toContain('<GripVertical />')
    expect(modal).toContain(':draggable="orderedCategories.length > 1')
    expect(modal).toContain('@dragstart="handleCategoryDragStart($event, category)"')
    expect(modal).toContain('@dragover.prevent="handleCategoryDragOver($event, category)"')
    expect(modal).toContain('@drop.prevent="handleCategoryDrop(category)"')
    expect(modal).toContain("dropPosition === 'before'")
    expect(modal).toContain("dropPosition === 'after'")
    expect(modal).toContain('event.dataTransfer.setDragImage(item, 24, 24)')
    expect(modal).not.toContain('aria-keyshortcuts')
    expect(modal).not.toContain('@keydown.up')
    expect(modal).not.toContain('@keydown.down')
    expect(modal).not.toContain('handleMove')
    expect(modal).toContain('api.categories.reorder.mutate')
    expect(service).toContain('async reorderCategories(')
    expect(service).toContain('sortCategoriesByOrder(await this.getAll<Category>')
  })

  it('records usage for copy actions in the card, table and folder views', () => {
    const actions = readRendererFile('composables/prompt/usePromptActions.ts')

    expect(actions).toContain("import { recordPromptUsage } from '@/lib/utils/prompt-usage'")
    expect(actions).toContain('incrementUseCount: id => api.prompts.incrementUseCount.mutate(id)')
    expect(actions).toContain('`[${variable.name}]`')
  })

  it('shows categories as neutral tags with a color dot in cards', () => {
    const grid = readRendererFile('components/prompts/PromptCardGrid.vue')

    expect(grid).toContain('<span class="ui-tag prompt-card__category" :title="categoryName(prompt)">')
    // 分类名放进 .ui-tag__text：太长时省略，不再压到「使用 N 次」上（#453）
    expect(grid).toContain('<UiCategoryDot :color="category(prompt)?.color" /><span class="ui-tag__text">{{ categoryName(prompt) }}</span>')
    expect(grid).not.toContain('getCategoryTagColor')
  })

  it('keeps settings sections inside panels instead of divider-separated cards', () => {
    const settingsPage = readRendererFile('pages/SettingsPage.vue')

    expect(settingsPage).not.toContain('<NDivider')
    expect(settingsPage).not.toContain('<NCard')
  })
})
