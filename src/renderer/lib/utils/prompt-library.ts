import type { PromptWithRelations } from '@shared/types/database'
import { sortPromptsForLibrary, type PromptLibrarySortBy, type PromptLibrarySortOrder } from './prompt-library-sort'
import { getTagsArray } from './tag-colors'

export type PromptLibraryScope = 'all' | 'recent' | 'favorites'

/** null 表示不按分类筛选，'none' 表示只看未分类 */
export type PromptCategoryFilter = number | 'none' | null

export interface PromptLibraryFilters {
  query: string
  scope: PromptLibraryScope
  categoryId: PromptCategoryFilter
  tags: string[]
  sortBy: PromptLibrarySortBy
  sortOrder: PromptLibrarySortOrder
}

export const RECENT_PROMPT_LIMIT = 12

export const createDefaultLibraryFilters = (): PromptLibraryFilters => ({
  query: '',
  scope: 'all',
  categoryId: null,
  tags: [],
  sortBy: 'created',
  sortOrder: 'desc',
})

const searchableText = (prompt: PromptWithRelations) => [
  prompt.title,
  prompt.description || '',
  prompt.content || '',
  getTagsArray(prompt.tags).join(' '),
  (prompt.variables || []).map(variable => variable.name).join(' '),
].join(' ').toLocaleLowerCase()

/**
 * 工作台列表和卡片、表格、文件夹视图共用的筛选：
 * 先按收藏、分类、标签和搜索词筛选，再排序。
 * 「最近」是在筛选结果里按更新时间取前 12 条（不套用排序选项）：
 * 先截取再搜索会漏掉不在最近 12 条里、但确实存在的提示词。
 */
export function filterPromptLibrary(
  prompts: PromptWithRelations[],
  filters: PromptLibraryFilters,
): PromptWithRelations[] {
  let result = [...prompts]

  if (filters.scope === 'favorites') result = result.filter(prompt => prompt.isFavorite)

  if (filters.categoryId === 'none') {
    result = result.filter(prompt => !prompt.categoryId)
  } else if (filters.categoryId !== null) {
    result = result.filter(prompt => prompt.categoryId === filters.categoryId)
  }

  if (filters.tags.length) {
    result = result.filter(prompt => {
      const tags = getTagsArray(prompt.tags)
      return filters.tags.every(tag => tags.includes(tag))
    })
  }

  const query = filters.query.trim().toLocaleLowerCase()
  if (query) result = result.filter(prompt => searchableText(prompt).includes(query))

  if (filters.scope === 'recent') return sortPromptsForLibrary(result, 'updated', 'desc').slice(0, RECENT_PROMPT_LIMIT)
  return sortPromptsForLibrary(result, filters.sortBy, filters.sortOrder)
}

/** 筛选按钮上的数字：只算分类和标签，搜索词和范围另有自己的控件 */
export function countActiveFilters(filters: PromptLibraryFilters): number {
  return (filters.categoryId !== null ? 1 : 0) + filters.tags.length
}

/** 标签按使用次数排序，供筛选面板列出 */
export function collectPromptTags(prompts: PromptWithRelations[]): { name: string; count: number }[] {
  const counts = new Map<string, number>()
  prompts.forEach(prompt => getTagsArray(prompt.tags).forEach(tag => counts.set(tag, (counts.get(tag) || 0) + 1)))
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}
