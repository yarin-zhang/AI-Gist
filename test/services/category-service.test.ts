import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { CategoryService } from '../../src/renderer/lib/services/category.service'

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
})
