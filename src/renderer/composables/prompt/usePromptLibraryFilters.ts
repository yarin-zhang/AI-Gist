import { reactive, watch } from 'vue'
import { createDefaultLibraryFilters, type PromptLibraryFilters } from '@/lib/utils/prompt-library'
import {
  PROMPT_LIBRARY_SORT_FIELDS,
  defaultSortOrder,
  type PromptLibrarySortBy,
  type PromptLibrarySortOrder,
} from '@/lib/utils/prompt-library-sort'

const SORT_STORAGE_KEY = 'prompt_library_sort'
const ORDER_STORAGE_KEY = 'prompt_library_sort_order'

const readStoredSort = (): PromptLibrarySortBy => {
  const stored = localStorage.getItem(SORT_STORAGE_KEY) as PromptLibrarySortBy | null
  return stored && PROMPT_LIBRARY_SORT_FIELDS.includes(stored) ? stored : 'created'
}

const readStoredOrder = (sortBy: PromptLibrarySortBy): PromptLibrarySortOrder => {
  const stored = localStorage.getItem(ORDER_STORAGE_KEY)
  return stored === 'asc' || stored === 'desc' ? stored : defaultSortOrder(sortBy)
}

// 工作台列表和卡片、表格、文件夹视图共用同一组筛选条件，切换显示方式时保持不变
const storedSort = readStoredSort()
const filters = reactive<PromptLibraryFilters>({
  ...createDefaultLibraryFilters(),
  sortBy: storedSort,
  sortOrder: readStoredOrder(storedSort),
})
watch(() => filters.sortBy, sortBy => localStorage.setItem(SORT_STORAGE_KEY, sortBy))
watch(() => filters.sortOrder, sortOrder => localStorage.setItem(ORDER_STORAGE_KEY, sortOrder))

export function usePromptLibraryFilters() {
  const clear = () => {
    filters.query = ''
    filters.categoryId = null
    filters.tags = []
  }
  const toggleTag = (tag: string) => {
    filters.tags = filters.tags.includes(tag) ? filters.tags.filter(item => item !== tag) : [...filters.tags, tag]
  }
  /** 换字段时用这个字段的默认方向；再点同一个字段（表格列头）切换升降序 */
  const sortByField = (sortBy: PromptLibrarySortBy) => {
    if (filters.sortBy === sortBy) {
      filters.sortOrder = filters.sortOrder === 'asc' ? 'desc' : 'asc'
      return
    }
    filters.sortBy = sortBy
    filters.sortOrder = defaultSortOrder(sortBy)
  }
  return { filters, clear, toggleTag, sortByField }
}
