import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearPromptUsageHistory, countPromptUsageToday, deletePromptUsageRecord, getLastUsedValues, readPromptUsageHistory,
  recordPromptUsage,
} from '@/lib/utils/prompt-usage'

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

describe('usage history can be cleaned up (#433)', () => {
  beforeEach(() => localStorage.clear())

  const copy = (content: string, variables: Record<string, any>, iso: string) => recordPromptUsage({
    promptId: 5,
    content,
    variables,
    incrementUseCount: vi.fn().mockResolvedValue({}),
    now: () => new Date(iso),
  })

  it('merges consecutive copies of the same values into one entry with a count', async () => {
    await copy('周报 A', { project: 'A', week: 1 }, '2026-10-27T01:00:00.000Z')
    await copy('周报 A', { week: 1, project: 'A' }, '2026-10-27T02:00:00.000Z')
    await copy('周报 A', { project: 'A', week: 1 }, '2026-10-27T03:00:00.000Z')
    await copy('周报 B', { project: 'B', week: 1 }, '2026-10-27T04:00:00.000Z')
    await copy('周报 A', { project: 'A', week: 1 }, '2026-10-27T05:00:00.000Z')

    expect(readPromptUsageHistory(5).map(record => [record.content, record.count || 1, record.date])).toEqual([
      ['周报 A', 1, '2026-10-27T05:00:00.000Z'],
      ['周报 B', 1, '2026-10-27T04:00:00.000Z'],
      ['周报 A', 3, '2026-10-27T03:00:00.000Z'],
    ])
    expect(countPromptUsageToday(new Date('2026-10-27T12:00:00.000Z'))).toBe(5)
  })

  it('deletes a single entry and clears the whole history', async () => {
    await copy('周报 A', { project: 'A' }, '2026-10-27T01:00:00.000Z')
    await copy('周报 B', { project: 'B' }, '2026-10-27T02:00:00.000Z')

    expect(deletePromptUsageRecord(5, '2026-10-27T02:00:00.000Z').map(record => record.content)).toEqual(['周报 A'])
    expect(getLastUsedValues(5)).toEqual({ project: 'A' })

    deletePromptUsageRecord(5, '2026-10-27T01:00:00.000Z')
    expect(localStorage.getItem('prompt_history_5')).toBeNull()

    await copy('周报 C', { project: 'C' }, '2026-10-27T03:00:00.000Z')
    clearPromptUsageHistory(5)
    expect(readPromptUsageHistory(5)).toEqual([])
    expect(getLastUsedValues(5)).toEqual({})
  })
})
