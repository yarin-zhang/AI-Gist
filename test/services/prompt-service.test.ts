import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { PromptService } from '../../src/renderer/lib/services/prompt.service'
import { onDataChange } from '../../src/renderer/lib/services/data-change-events'

class TestPromptService extends PromptService {
  readonly deleteCalls: { storeName: string; id: number }[] = []

  protected override async delete(storeName: string, id: number): Promise<void> {
    this.deleteCalls.push({ storeName, id })
  }
}

describe('PromptService', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
    globalThis.IDBKeyRange = IDBKeyRange
  })

  it('deletes prompt histories through the shared delete path so tombstones are written', async () => {
    const service = new TestPromptService()

    const result = await service.deletePromptHistory(42)

    expect(result).toBe(true)
    expect(service.deleteCalls).toEqual([
      { storeName: 'promptHistories', id: 42 }
    ])
  })

  it('increments usage atomically when copies happen concurrently', async () => {
    const service = new PromptService()
    const prompt = await service.createPrompt({
      title: 'Concurrent usage',
      content: 'content',
      tags: [],
      variables: [],
      isFavorite: false,
      useCount: 0,
      isActive: true,
    })

    await Promise.all(Array.from({ length: 12 }, () => service.incrementPromptUseCount(prompt.id!)))

    expect((await service.getPromptById(prompt.id!))?.useCount).toBe(12)
    service.close()
  })

  it('records a use without touching updatedAt and marks the change as usage only (#488)', async () => {
    const service = new PromptService()
    const prompt = await service.createPrompt({
      title: 'Copied often',
      content: 'content',
      tags: [],
      variables: [],
      isFavorite: false,
      useCount: 0,
      isActive: true,
    })
    const changes: any[] = []
    const unsubscribe = onDataChange('prompts', change => changes.push(change))

    try {
      await service.incrementPromptUseCount(prompt.id!)

      const used = await service.getPromptById(prompt.id!)
      expect(used?.useCount).toBe(1)
      expect(new Date(used!.updatedAt).getTime()).toBe(new Date(prompt.updatedAt).getTime())
      expect(used?.lastUsedAt).toBeInstanceOf(Date)
      expect(changes).toEqual([expect.objectContaining({ action: 'update', id: prompt.id, usageOnly: true })])
    } finally {
      unsubscribe()
      service.close()
    }
  })
})
