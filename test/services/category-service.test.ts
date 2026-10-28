import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { CategoryService } from '../../src/renderer/lib/services/category.service'
import {
  CategoryNameConflictError,
  findCategoryNameConflict,
  isCategoryNameConflictError,
} from '../../src/renderer/lib/utils/category-name'

const categoryInput = (name: string) => ({
  name,
  description: '',
  color: '#18a058',
  isActive: true,
})

describe('CategoryService', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
    globalThis.IDBKeyRange = IDBKeyRange
  })

  it('persists user-defined category order and appends new categories', async () => {
    const service = new CategoryService()
    const first = await service.createCategory(categoryInput('First'))
    const second = await service.createCategory(categoryInput('Second'))
    const third = await service.createCategory(categoryInput('Third'))

    await service.reorderCategories([
      { id: third.id!, sortOrder: 0 },
      { id: first.id!, sortOrder: 1 },
      { id: second.id!, sortOrder: 2 },
    ])

    expect((await service.getBasicCategories()).map(category => category.name)).toEqual([
      'Third',
      'First',
      'Second',
    ])

    const appended = await service.createCategory(categoryInput('Appended'))
    expect(appended.sortOrder).toBe(3)
    expect((await service.getAllCategories()).map(category => category.name)).toEqual([
      'Third',
      'First',
      'Second',
      'Appended',
    ])

    service.close()
  })

  it('trims names and rejects duplicates that differ only by surrounding spaces or case (#438)', async () => {
    const service = new CategoryService()
    const created = await service.createCategory(categoryInput('  社媒运营 '))
    expect(created.name).toBe('社媒运营')

    await expect(service.createCategory(categoryInput('社媒运营'))).rejects.toBeInstanceOf(CategoryNameConflictError)
    await expect(service.createCategory(categoryInput(' 社媒运营 '))).rejects.toMatchObject({
      code: 'CATEGORY_NAME_EXISTS',
      existingName: '社媒运营',
    })
    await service.createCategory(categoryInput('Marketing'))
    await expect(service.createCategory(categoryInput('marketing '))).rejects.toMatchObject({ existingName: 'Marketing' })
    await expect(service.createCategory(categoryInput('   '))).rejects.toThrow('Category name is required')

    expect((await service.getBasicCategories()).map(category => category.name)).toEqual(['社媒运营', 'Marketing'])
    service.close()
  })

  it('rejects renaming onto another category but allows changing the case of its own name', async () => {
    const service = new CategoryService()
    const first = await service.createCategory(categoryInput('Marketing & Communications'))
    await service.createCategory(categoryInput('工程与代码审查'))

    const error = await service.updateCategory(first.id!, { name: ' 工程与代码审查' }).catch(caught => caught)
    expect(isCategoryNameConflictError(error)).toBe(true)
    expect(error.existingName).toBe('工程与代码审查')

    expect((await service.updateCategory(first.id!, { name: ' marketing & communications ' })).name).toBe('marketing & communications')
    // 只改颜色时不检查名称
    expect((await service.updateCategory(first.id!, { color: '#ff0000' })).color).toBe('#ff0000')
    service.close()
  })

  it('finds name conflicts the same way the dialog validates while typing', () => {
    const categories = [{ id: 1, name: 'Traduzione' }, { id: 2, name: ' Spaced ' }]
    expect(findCategoryNameConflict(categories, ' traduzione ')?.id).toBe(1)
    expect(findCategoryNameConflict(categories, 'spaced')?.id).toBe(2)
    expect(findCategoryNameConflict(categories, 'Traduzione', 1)).toBeUndefined()
    expect(findCategoryNameConflict(categories, '   ')).toBeUndefined()
  })

  it('rolls back every order update when one category is missing', async () => {
    const service = new CategoryService()
    const first = await service.createCategory(categoryInput('First'))
    const second = await service.createCategory(categoryInput('Second'))

    await expect(service.reorderCategories([
      { id: second.id!, sortOrder: 0 },
      { id: 999, sortOrder: 1 },
      { id: first.id!, sortOrder: 2 },
    ])).rejects.toThrow('Category 999 not found')

    expect((await service.getBasicCategories()).map(category => [category.name, category.sortOrder])).toEqual([
      ['First', 0],
      ['Second', 1],
    ])

    service.close()
  })

  it('deletes a category that still holds prompts and moves them to "Uncategorized" (#461)', async () => {
    const service = new CategoryService()
    const marketing = await service.createCategory(categoryInput('Marketing'))
    const other = await service.createCategory(categoryInput('Other'))
    const store = service as unknown as { add: (store: string, data: unknown) => Promise<{ id: number }>; getAll: (store: string) => Promise<any[]> }
    const prompt = (title: string, categoryId: number) => ({ uuid: title, title, content: title, categoryId, tags: [], isFavorite: false, useCount: 0, isActive: true })
    await store.add('prompts', prompt('A', marketing.id!))
    await store.add('prompts', prompt('B', marketing.id!))
    await store.add('prompts', prompt('C', other.id!))

    expect(await service.deleteCategoryAndUncategorizePrompts(marketing.id!)).toBe(2)

    expect((await service.getBasicCategories()).map(category => category.name)).toEqual(['Other'])
    const prompts = await store.getAll('prompts')
    expect(prompts.map(item => [item.title, item.categoryId ?? null])).toEqual([['A', null], ['B', null], ['C', other.id]])

    service.close()
  })
})
