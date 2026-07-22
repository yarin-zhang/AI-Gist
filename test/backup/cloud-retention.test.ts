import { describe, expect, it } from 'vitest'
import {
  CLOUD_RETENTION_DELETE_GRACE_MS,
  planCloudRetention
} from '@shared/cloud-retention'

describe('cloud retention planner', () => {
  it('keeps the newest versions by remote modification time and always protects the current revision', () => {
    const result = planCloudRetention([
      { key: 'old-protected', modifiedAt: '2026-07-01T00:00:00.000Z', protected: true },
      { key: 'payload-newer', createdAt: '2026-07-03T00:00:00.000Z' },
      { key: 'remote-newest', modifiedAt: '2026-07-04T00:00:00.000Z', createdAt: '2026-06-01T00:00:00.000Z' },
      { key: 'old', modifiedAt: '2026-07-02T00:00:00.000Z' }
    ], 2, {
      now: new Date('2026-07-22T00:00:00.000Z')
    })

    expect(result.retained.map(item => item.key)).toEqual(['remote-newest', 'old-protected'])
    expect(result.deleted.map(item => item.key)).toEqual(['payload-newer', 'old'])
  })

  it('defers deleting fresh concurrent publications until the grace window expires', () => {
    const now = Date.parse('2026-07-22T00:10:00.000Z')
    const candidates = [
      { key: 'newest', modifiedAt: '2026-07-22T00:09:00.000Z' },
      { key: 'concurrent', modifiedAt: new Date(now - CLOUD_RETENTION_DELETE_GRACE_MS + 1).toISOString() },
      { key: 'expired', modifiedAt: new Date(now - CLOUD_RETENTION_DELETE_GRACE_MS).toISOString() }
    ]

    const result = planCloudRetention(candidates, 1, { now })

    expect(result.retained.map(item => item.key)).toEqual(['newest'])
    expect(result.deferred.map(item => item.key)).toEqual(['concurrent'])
    expect(result.deleted.map(item => item.key)).toEqual(['expired'])
  })

  it('deduplicates repeated remote entries by keeping the newest metadata regardless of list order', () => {
    const result = planCloudRetention([
      { key: 'same', modifiedAt: '2026-07-01T00:00:00.000Z' },
      { key: 'other', modifiedAt: '2026-07-02T00:00:00.000Z' },
      { key: 'same', modifiedAt: '2026-07-03T00:00:00.000Z' }
    ], 2, { now: new Date('2026-07-22T00:00:00.000Z') })

    expect(result.retained).toEqual([
      expect.objectContaining({ key: 'same', modifiedAt: '2026-07-03T00:00:00.000Z' }),
      expect.objectContaining({ key: 'other' })
    ])
  })
})
