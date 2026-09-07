import { formatDateTime, getRunDate, parseDateSafe } from '../date-utils'

describe('parseDateSafe', () => {
  it('returns null for missing/empty/invalid values', () => {
    expect(parseDateSafe(null)).toBeNull()
    expect(parseDateSafe(undefined)).toBeNull()
    expect(parseDateSafe('')).toBeNull()
    expect(parseDateSafe('not-a-date')).toBeNull()
  })

  it('parses valid ISO timestamps', () => {
    expect(parseDateSafe('2026-08-04T06:30:00Z')?.getTime()).not.toBeNaN()
  })
})

describe('getRunDate', () => {
  it('returns the run date or the fallback', () => {
    const date = getRunDate({ started_at: '2026-08-04T06:30:00Z' })
    expect(date.getTime()).toBe(new Date('2026-08-04T06:30:00Z').getTime())

    const fallback = new Date(0)
    expect(getRunDate({ started_at: null, created_at: null }, fallback)).toBe(fallback)
  })

  it('falls back to created_at when started_at is an empty string', () => {
    const date = getRunDate({ started_at: '', created_at: '2026-08-01T00:00:00Z' })
    expect(date.getTime()).toBe(new Date('2026-08-01T00:00:00Z').getTime())

    const fallback = new Date(0)
    expect(getRunDate({ started_at: '', created_at: '' }, fallback)).toBe(fallback)
  })
})

describe('formatDateTime', () => {
  it('returns a placeholder for missing values', () => {
    expect(formatDateTime(null)).toBe('--')
    expect(formatDateTime(undefined)).toBe('--')
    expect(formatDateTime('')).toBe('--')
  })

  it('formats valid ISO timestamps', () => {
    expect(formatDateTime('2026-08-04T06:30:00Z')).not.toBe('--')
  })
})
