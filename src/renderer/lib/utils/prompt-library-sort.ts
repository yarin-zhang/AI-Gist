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

/**
 * Sorts prompts for the desktop prompt library sidebar list.
 * Returns a new array; does not mutate the input.
 */
export function sortPromptsForLibrary(
  prompts: PromptWithRelations[],
  sortBy: PromptLibrarySortBy
): PromptWithRelations[] {
  const result = [...prompts]

  if (sortBy === 'usage') {
    result.sort((a, b) => (b.useCount || 0) - (a.useCount || 0))
  } else if (sortBy === 'title') {
    result.sort((a, b) => a.title.localeCompare(b.title))
  } else if (sortBy === 'updated') {
    result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  } else {
    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  return result
}
