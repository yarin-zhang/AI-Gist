import { describe, expect, it } from 'vitest'
import type { Category } from '../src/shared/types/database'
import { reorderCategoriesByDrop } from '../src/renderer/lib/utils/category-order'

const category = (id: number, name: string): Category => ({
  id,
  uuid: `category-${id}`,
  name,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
})

const categories = [category(1, 'First'), category(2, 'Second'), category(3, 'Third')]

describe('category drag ordering', () => {
  it('moves a category after the hovered target', () => {
    expect(reorderCategoriesByDrop(categories, 1, 3, 'after').map(item => item.id)).toEqual([2, 3, 1])
  })

  it('moves a category before the hovered target', () => {
    expect(reorderCategoriesByDrop(categories, 3, 1, 'before').map(item => item.id)).toEqual([3, 1, 2])
  })

  it('keeps the existing order for invalid or self-targeted drops', () => {
    expect(reorderCategoriesByDrop(categories, 1, 1, 'after').map(item => item.id)).toEqual([1, 2, 3])
    expect(reorderCategoriesByDrop(categories, 1, 999, 'after').map(item => item.id)).toEqual([1, 2, 3])
  })
})
