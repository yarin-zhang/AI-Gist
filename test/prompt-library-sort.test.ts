import { describe, expect, it } from 'vitest'
import type { PromptWithRelations } from '../src/shared/types/database'
import { sortPromptsForLibrary } from '../src/renderer/lib/utils/prompt-library-sort'

const prompt = (overrides: Partial<PromptWithRelations> = {}): PromptWithRelations => ({
  id: 1,
  uuid: `uuid-${overrides.id ?? 1}`,
  title: 'Untitled',
  content: 'content',
  tags: [],
  isFavorite: false,
  useCount: 0,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
})

describe('sortPromptsForLibrary', () => {
  it('sorts by creation time (newest first) for the default "created" sort', () => {
    const older = prompt({ id: 1, title: 'Older', createdAt: new Date('2026-01-01T00:00:00Z') })
    const newer = prompt({ id: 2, title: 'Newer', createdAt: new Date('2026-03-01T00:00:00Z') })
    const middle = prompt({ id: 3, title: 'Middle', createdAt: new Date('2026-02-01T00:00:00Z') })

    const result = sortPromptsForLibrary([older, newer, middle], 'created')

    expect(result.map(p => p.title)).toEqual(['Newer', 'Middle', 'Older'])
  })

  it('does not change list order when a prompt is edited or used (updatedAt/useCount change) under the default sort', () => {
    // Regression test for issue #15: using or editing a prompt bumps its
    // updatedAt/useCount, but the default sidebar order must stay stable
    // because it sorts by createdAt, not updatedAt.
    const a = prompt({ id: 1, title: 'A', createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z') })
    const b = prompt({ id: 2, title: 'B', createdAt: new Date('2026-01-02T00:00:00Z'), updatedAt: new Date('2026-01-02T00:00:00Z') })
    const c = prompt({ id: 3, title: 'C', createdAt: new Date('2026-01-03T00:00:00Z'), updatedAt: new Date('2026-01-03T00:00:00Z') })

    const before = sortPromptsForLibrary([a, b, c], 'created').map(p => p.title)

    // Simulate the user opening/using the oldest prompt: its updatedAt and
    // useCount jump far ahead of the others, which is exactly what happens
    // when incrementPromptUseCount touches updatedAt on every use.
    const usedA = { ...a, updatedAt: new Date('2026-06-01T00:00:00Z'), useCount: a.useCount + 1 }

    const after = sortPromptsForLibrary([usedA, b, c], 'created').map(p => p.title)

    expect(after).toEqual(before)
    expect(after).toEqual(['C', 'B', 'A'])
  })

  it('still sorts by updated time (newest first) when explicitly requested, e.g. for the "recent" view', () => {
    const a = prompt({ id: 1, title: 'A', createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z') })
    const b = prompt({ id: 2, title: 'B', createdAt: new Date('2026-01-02T00:00:00Z'), updatedAt: new Date('2026-06-01T00:00:00Z') })

    const result = sortPromptsForLibrary([a, b], 'updated')

    expect(result.map(p => p.title)).toEqual(['B', 'A'])
  })

  it('sorts by usage count (highest first) for the "usage" sort', () => {
    const low = prompt({ id: 1, title: 'Low', useCount: 2 })
    const high = prompt({ id: 2, title: 'High', useCount: 9 })

    const result = sortPromptsForLibrary([low, high], 'usage')

    expect(result.map(p => p.title)).toEqual(['High', 'Low'])
  })

  it('sorts alphabetically by title for the "title" sort', () => {
    const zebra = prompt({ id: 1, title: 'Zebra' })
    const apple = prompt({ id: 2, title: 'Apple' })

    const result = sortPromptsForLibrary([zebra, apple], 'title')

    expect(result.map(p => p.title)).toEqual(['Apple', 'Zebra'])
  })

  it('does not mutate the input array', () => {
    const a = prompt({ id: 1, title: 'A', createdAt: new Date('2026-01-01T00:00:00Z') })
    const b = prompt({ id: 2, title: 'B', createdAt: new Date('2026-02-01T00:00:00Z') })
    const input = [a, b]

    sortPromptsForLibrary(input, 'created')

    expect(input).toEqual([a, b])
  })
})
