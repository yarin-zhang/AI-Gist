import type { PromptWithRelations } from '@shared/types/database'

/**
 * Sort fields available for the desktop prompt library sidebar list.
 *
 * 'created' is the default so a prompt's position in the list stays stable
 * while it is edited or used — only creating a new prompt changes the
 * order. 'updated' intentionally sorts by last-modified/used time and is
 * reserved for the "Recently Used" view.
 */
export type PromptLibrarySortBy = 'created' | 'updated' | 'usage' | 'title'

/** 排序方向：asc 为升序（旧到新、少到多、A 到 Z），desc 为降序 */
export type PromptLibrarySortOrder = 'asc' | 'desc'

export const PROMPT_LIBRARY_SORT_FIELDS: PromptLibrarySortBy[] = ['created', 'updated', 'usage', 'title']

/** 每个字段第一次选中时的方向：时间和使用次数从新 / 多到旧 / 少，标题按字母顺序 */
export const defaultSortOrder = (sortBy: PromptLibrarySortBy): PromptLibrarySortOrder => (
  sortBy === 'title' ? 'asc' : 'desc'
)

const time = (value: Date | string | undefined) => (value ? new Date(value).getTime() : 0)

/** 升序比较 */
const ascending: Record<PromptLibrarySortBy, (a: PromptWithRelations, b: PromptWithRelations) => number> = {
  created: (a, b) => time(a.createdAt) - time(b.createdAt),
  updated: (a, b) => time(a.updatedAt) - time(b.updatedAt),
  usage: (a, b) => (a.useCount || 0) - (b.useCount || 0),
  title: (a, b) => a.title.localeCompare(b.title),
}

/**
 * Sorts prompts for the desktop prompt library sidebar list.
 * Returns a new array; does not mutate the input.
 */
export function sortPromptsForLibrary(
  prompts: PromptWithRelations[],
  sortBy: PromptLibrarySortBy,
  order: PromptLibrarySortOrder = defaultSortOrder(sortBy),
): PromptWithRelations[] {
  const compare = ascending[sortBy] || ascending.created
  const direction = order === 'asc' ? 1 : -1
  return [...prompts].sort((a, b) => direction * compare(a, b))
}
