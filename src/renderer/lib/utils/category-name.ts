import type { Category } from '@shared/types/database'

/** 分类名保存前去掉首尾空格，「 社媒运营 」和「社媒运营」是同一个名字 */
export const normalizeCategoryName = (name: string | null | undefined): string => (name || '').trim()

const nameKey = (name: string | null | undefined) => normalizeCategoryName(name).toLocaleLowerCase()

/**
 * 在已有分类里找同名的：去掉首尾空格、不区分大小写后相同就算重名。
 * 改名时传 excludeId（分类自己），只改大小写不算和自己重名。
 */
export function findCategoryNameConflict<T extends Pick<Category, 'id' | 'name'>>(
  categories: T[],
  name: string | null | undefined,
  excludeId?: number,
): T | undefined {
  const key = nameKey(name)
  if (!key) return undefined
  return categories.find(category => category.id !== excludeId && nameKey(category.name) === key)
}

/** 分类重名。界面按 code 认出来，用 existingName 告诉用户是和哪个分类重名 */
export class CategoryNameConflictError extends Error {
  readonly code = 'CATEGORY_NAME_EXISTS'

  constructor(readonly existingName: string) {
    super(`A category named "${existingName}" already exists`)
    this.name = 'CategoryNameConflictError'
  }
}

export const isCategoryNameConflictError = (error: unknown): error is CategoryNameConflictError => (
  error instanceof CategoryNameConflictError
  || (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'CATEGORY_NAME_EXISTS')
)
