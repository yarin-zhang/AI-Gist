import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readPromptUsageHistory, recordPromptUsage } from '@/lib/utils/prompt-usage'

describe('prompt usage recording', () => {
  beforeEach(() => localStorage.clear())

  it('increments the count and prepends a use-history record', async () => {
    const incrementUseCount = vi.fn().mockResolvedValue({ useCount: 4 })

    const updated = await recordPromptUsage({
      promptId: 7,
      content: 'Rendered prompt',
      variables: { topic: 'UI' },
      incrementUseCount,
      now: () => new Date('2026-07-12T12:00:00.000Z'),
    })

    expect(updated.useCount).toBe(4)
    expect(incrementUseCount).toHaveBeenCalledWith(7)
    expect(readPromptUsageHistory(7)).toEqual([{
      date: '2026-07-12T12:00:00.000Z',
      content: 'Rendered prompt',
      variables: { topic: 'UI' },
    }])
  })

  it('rolls history back when the usage count cannot be persisted', async () => {
    localStorage.setItem('prompt_history_9', JSON.stringify([{
      date: '2026-07-11T12:00:00.000Z',
      content: 'Previous prompt',
      variables: {},
    }]))

    await expect(recordPromptUsage({
      promptId: 9,
      content: 'Failed prompt',
      incrementUseCount: vi.fn().mockRejectedValue(new Error('database unavailable')),
    })).rejects.toThrow('database unavailable')

    expect(readPromptUsageHistory(9)).toEqual([{
      date: '2026-07-11T12:00:00.000Z',
      content: 'Previous prompt',
      variables: {},
    }])
  })
})
