import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// #439：在「最近 / 收藏」里搜不到时，四种视图都给「在全部提示词中查找」，免得以为提示词不见了
const read = (path: string) => readFileSync(`src/renderer/components/prompts/${path}`, 'utf8')
const VIEWS = ['PromptLibraryList.vue', 'PromptCardGrid.vue', 'PromptTable.vue', 'PromptFolderView.vue']

describe('scoped empty state offers searching all prompts (#439)', () => {
  it.each(VIEWS)('%s switches the scope back to all', view => {
    const source = read(view)
    expect(source).toMatch(/<NButton[^>]*@click="filters\.scope = 'all'">\{\{ t\('promptBrowse\.searchAll'\) \}\}<\/NButton>/)
  })

  it('the workbench list explains the scope and keeps "clear filters" for search, category and tag filters', () => {
    const source = read('PromptLibraryList.vue')
    expect(source).toContain('<template v-if="scopeHint">')
    expect(source).toContain('<span class="library__empty-hint">{{ scopeHint }}</span>')
    expect(source).toContain("t('promptBrowse.noResultsInScope'")
    expect(source).toContain('<NButton v-if="hasOtherFilters || !scopeHint" quaternary size="tiny" @click="clearAll">')
    expect(source).toContain('const hasOtherFilters = computed(() => Boolean(filters.query.trim()) || filters.categoryId !== null || filters.tags.length > 0)')
  })
})
