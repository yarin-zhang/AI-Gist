import { describe, expect, it } from 'vitest'
import { formatDateTime, formatFriendlyDate } from '../src/renderer/lib/utils/date'

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

describe('formatFriendlyDate (#450)', () => {
  const now = new Date(2026, 9, 27, 12, 0, 0)
  const today = new Date(2026, 9, 27, 9, 30, 0)

  it('capitalizes a standalone relative day', () => {
    expect(formatFriendlyDate(today, 'en-US', { withTime: false, now })).toBe('Today')
    expect(formatFriendlyDate(today, 'it-IT', { withTime: false, now })).toBe('Oggi')
  })

  it('keeps the relative day lowercase inside a sentence', () => {
    expect(formatFriendlyDate(today, 'en-US', { withTime: false, now, capitalize: false })).toBe('today')
    expect(formatFriendlyDate(today, 'it-IT', { withTime: false, now, capitalize: false })).toBe('oggi')
    expect(formatFriendlyDate(today, 'ja-JP', { withTime: false, now, capitalize: false })).toBe('今日')
  })

  it('shows seconds only when asked (#489)', () => {
    const withSeconds = new Date(2026, 9, 27, 9, 30, 7)
    expect(formatFriendlyDate(withSeconds, 'en-US', { withTime: true, now })).toBe('Today 09:30')
    expect(formatFriendlyDate(withSeconds, 'en-US', { withTime: true, withSeconds: true, now })).toBe('Today 09:30:07')
    expect(formatFriendlyDate(withSeconds, 'zh-CN', { withTime: true, withSeconds: true, now })).toBe('今天 09:30:07')
  })
})
