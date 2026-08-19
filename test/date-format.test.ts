import { describe, expect, it } from 'vitest'
import { formatDateTime } from '../src/renderer/lib/utils/date'

describe('formatDateTime', () => {
  it('formats a date as yyyy-MM-dd HH:mm:ss', () => {
    const date = new Date(2026, 7, 19, 19, 21, 30) // 2026-08-19 19:21:30 local time
    expect(formatDateTime(date)).toBe('2026-08-19 19:21:30')
  })

  it('pads single-digit month, day, hour, minute, and second components', () => {
    const date = new Date(2026, 0, 5, 3, 4, 5) // 2026-01-05 03:04:05 local time
    expect(formatDateTime(date)).toBe('2026-01-05 03:04:05')
  })

  it('accepts an ISO string in addition to a Date instance', () => {
    const iso = new Date(2026, 7, 19, 19, 21, 30).toISOString()
    expect(formatDateTime(iso)).toBe(formatDateTime(new Date(iso)))
  })

  it('falls back to the original value for an invalid date', () => {
    expect(formatDateTime('not-a-date')).toBe('not-a-date')
  })
})
