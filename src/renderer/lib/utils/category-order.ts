import type { Category } from '@shared/types/database'

export type CategoryDropPosition = 'before' | 'after'

const fallbackCategoryOrder = (category: Pick<Category, 'id' | 'sortOrder'>): number => {
  const sortOrder = Number(category.sortOrder)
  if (Number.isFinite(sortOrder)) return sortOrder

  const id = Number(category.id)
  return Number.isFinite(id) ? id : Number.MAX_SAFE_INTEGER
}

export const compareCategoriesByOrder = (left: Category, right: Category): number => {
  const orderDifference = fallbackCategoryOrder(left) - fallbackCategoryOrder(right)
  if (orderDifference) return orderDifference

  const idDifference = Number(left.id || 0) - Number(right.id || 0)
  return idDifference || left.name.localeCompare(right.name)
}

export const sortCategoriesByOrder = <T extends Category>(categories: T[]): T[] => (
  [...categories].sort(compareCategoriesByOrder)
)

export const getNextCategorySortOrder = (categories: Category[]): number => {
  if (!categories.length) return 0
  return Math.max(...categories.map(fallbackCategoryOrder)) + 1
}

export const reorderCategoriesByDrop = <T extends Category>(
  categories: T[],
  sourceId: number,
  targetId: number,
  position: CategoryDropPosition,
): T[] => {
  if (sourceId === targetId) return [...categories]

  const nextOrder = [...categories]
  const sourceIndex = nextOrder.findIndex(category => category.id === sourceId)
  if (sourceIndex < 0) return nextOrder

  const [movedCategory] = nextOrder.splice(sourceIndex, 1)
  const targetIndex = nextOrder.findIndex(category => category.id === targetId)
  if (targetIndex < 0) return [...categories]

  nextOrder.splice(targetIndex + (position === 'after' ? 1 : 0), 0, movedCategory)
  return nextOrder
}
