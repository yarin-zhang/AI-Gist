import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { PromptService } from '../../src/renderer/lib/services/prompt.service'

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
})
