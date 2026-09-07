import { formatCron, formatInterval, formatSchedule } from './utils'

describe('scheduled-task utils', () => {
  describe('formatCron', () => {
    it('formats a daily 5-field cron in Chinese', () => {
      const text = formatCron('0 9 * * *')
      expect(text).not.toBeNull()
      expect(text).toContain('09:00')
    })

    it('formats day-of-week ranges and lists', () => {
      expect(formatCron('0 9 * * 1-5')).toContain('09:00')
      expect(formatCron('0 9 * * 1,3,5')).toContain('09:00')
    })

    it('handles 6-field (seconds) and 7-field (year) expressions', () => {
      expect(formatCron('0 0 9 * * *')).not.toBeNull()
      expect(formatCron('0 0 9 * * * 2026')).not.toBeNull()
    })

    it('returns null for empty or invalid expressions', () => {
      expect(formatCron('')).toBeNull()
      expect(formatCron('   ')).toBeNull()
      expect(formatCron('not a cron')).toBeNull()
    })
  })

  describe('formatInterval', () => {
    it('formats hours, minutes and seconds', () => {
      expect(formatInterval(3600)).toBe('每 1 小时')
      expect(formatInterval(7200)).toBe('每 2 小时')
      expect(formatInterval(60)).toBe('每 1 分钟')
      expect(formatInterval(90)).toBe('每 90 秒')
    })
  })

  describe('formatSchedule', () => {
    it('prefers interval schedules', () => {
      expect(
        formatSchedule({
          schedule_type: 'interval',
          cron_expr: null,
          interval_seconds: 3600,
        })
      ).toBe('每 1 小时')
    })

    it('falls back to the raw cron expression when unformattable', () => {
      expect(
        formatSchedule({
          schedule_type: 'cron',
          cron_expr: 'bad expr',
          interval_seconds: null,
        })
      ).toBe('bad expr')
    })

    it('returns a placeholder when no schedule is available', () => {
      expect(
        formatSchedule({
          schedule_type: 'interval',
          cron_expr: null,
          interval_seconds: null,
        })
      ).toBe('—')
    })
  })
})
