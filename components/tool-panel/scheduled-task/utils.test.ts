import {
  buildSchedulePayload,
  createScheduleDraft,
  cronFromScheduleDraft,
  DEFAULT_TASK_TIMEZONE,
  describeScheduleDraft,
  draftFromSchedule,
  formatCron,
  formatInterval,
  formatSchedule,
  intervalSecondsFromDraft,
  isValidCronExpression,
  parseTimeInput,
  timezoneForTask,
  toggleWeekday,
  validateScheduleDraft,
  type ScheduleDraft,
} from './utils'

/** 用默认草稿 + 覆盖字段构造用例，避免每个用例重复写全字段。 */
const draft = (overrides: Partial<ScheduleDraft>): ScheduleDraft => createScheduleDraft(overrides)

/** draftFromSchedule 的入参形状；未使用的一侧显式置 null，与后端请求字段一致。 */
type TaskSchedule = Parameters<typeof draftFromSchedule>[0]
const task = (patch: Partial<TaskSchedule>): TaskSchedule => ({
  schedule_type: 'cron',
  cron_expr: null,
  interval_seconds: null,
  ...patch,
})

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

    // 后端 APScheduler 的 0 是周一，不能按标准 crontab 显示成周日。
    it.each<[string, string]>([
      ['0 18 * * 0', '星期一'],
      ['0 18 * * 1,5', '星期二'],
      ['0 18 * * 1,5', '星期六'],
      ['0 18 * * mon,wed,fri', '星期三'],
      ['0 18 * * mon-fri', '星期一'],
    ])('reads weekdays with APScheduler semantics (0=周一): %s', (expr, weekday) => {
      expect(formatCron(expr)).toContain(weekday)
    })

    it('returns null for empty or invalid expressions', () => {
      expect(formatCron('')).toBeNull()
      expect(formatCron('   ')).toBeNull()
      expect(formatCron('not a cron')).toBeNull()
      expect(formatCron('99 * * * *')).toBeNull()
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

  describe('createScheduleDraft', () => {
    it('starts from a valid daily schedule on the next whole hour', () => {
      const initial = createScheduleDraft()
      expect(initial.mode).toBe('daily')
      expect(validateScheduleDraft(initial)).toBeNull()
      // 默认时刻取任务时区（Asia/Shanghai）下的下一个整点。
      expect(initial.time).toMatch(/^\d{2}:00$/)
    })
  })

  describe('parseTimeInput', () => {
    it.each<[string, { hour: number; minute: number } | null]>([
      ['09:05', { hour: 9, minute: 5 }],
      ['24:00', null],
      ['9', null],
    ])('parses valid values and rejects the rest: %s', (value, expected) => {
      expect(parseTimeInput(value)).toEqual(expected)
    })
  })

  describe('cronFromScheduleDraft', () => {
    it.each<[Partial<ScheduleDraft>, string | null]>([
      [{ mode: 'hourly', minute: '15' }, '15 * * * *'],
      [{ mode: 'daily', time: '18:30' }, '30 18 * * *'],
      [{ mode: 'weekly', time: '18:30', weekdays: [4, 0] }, '30 18 * * mon,fri'],
      [{ mode: 'monthly', time: '09:00', monthDay: '1' }, '0 9 1 * *'],
      [{ mode: 'custom', cronExpr: '  */5 * * * *  ' }, '*/5 * * * *'],
      [{ mode: 'weekly', weekdays: [] }, null],
      [{ mode: 'monthly', monthDay: '32' }, null],
      [{ mode: 'custom', cronExpr: '   ' }, null],
    ])('builds an expression per mode, null when incomplete: %#', (patch, expected) => {
      expect(cronFromScheduleDraft(draft(patch))).toBe(expected)
    })
  })

  describe('intervalSecondsFromDraft', () => {
    it.each<[Partial<ScheduleDraft>, number | null]>([
      [{ intervalValue: '2', intervalUnit: 'hours' }, 7200],
      [{ intervalValue: '30', intervalUnit: 'minutes' }, 1800],
      [{ intervalValue: '45', intervalUnit: 'seconds' }, 45],
      [{ intervalValue: '0' }, null],
      [{ intervalValue: '-3' }, null],
      [{ intervalValue: '' }, null],
    ])('converts every unit to seconds, null when non positive: %#', (patch, expected) => {
      expect(intervalSecondsFromDraft(draft(patch))).toBe(expected)
    })
  })

  describe('isValidCronExpression', () => {
    // 后端只接受 5 段；APScheduler 的星期最大值是 6，7 会直接报错。
    it.each<[string, boolean]>([
      ['0 9 * * *', true],
      ['*/5 * * * *', true],
      ['0 18 * * mon-fri', true],
      ['0 18 * * 0-6', true],
      ['0 0 9 * * *', false],
      ['0 9 * *', false],
      ['0 18 * * 7', false],
      ['0 25 * * *', false],
    ])('accepts exactly the expressions the backend can parse: %s', (expr, expected) => {
      expect(isValidCronExpression(expr)).toBe(expected)
    })
  })

  describe('validateScheduleDraft', () => {
    it.each<[Partial<ScheduleDraft>, string | null]>([
      [{ mode: 'daily', time: '18:30' }, null],
      [{ mode: 'monthly', time: '10:00' }, null],
      [{ mode: 'weekly', weekdays: [] }, '请至少选择一个星期'],
      [{ mode: 'custom', cronExpr: '' }, '请填写 Cron 表达式'],
      [{ mode: 'interval', intervalValue: '0' }, '请输入大于 0 的间隔时长'],
    ])('accepts complete drafts and names the missing field: %#', (patch, expected) => {
      expect(validateScheduleDraft(draft(patch))).toBe(expected)
    })

    it.each([
      ['0 9 * *', '5 段'],
      ['0 0 * * 7', '无效'],
    ])('rejects a malformed custom expression: %s', (cronExpr, expected) => {
      expect(validateScheduleDraft(draft({ mode: 'custom', cronExpr }))).toContain(expected)
    })
  })

  describe('buildSchedulePayload', () => {
    it.each<[Partial<ScheduleDraft>, TaskSchedule | null]>([
      [
        { mode: 'interval', intervalValue: '2', intervalUnit: 'hours' },
        { schedule_type: 'interval', cron_expr: null, interval_seconds: 7200 },
      ],
      [
        { mode: 'weekly', time: '18:30', weekdays: [0] },
        { schedule_type: 'cron', cron_expr: '30 18 * * mon', interval_seconds: null },
      ],
      [{ mode: 'monthly', monthDay: '99' }, null],
    ])('maps every mode to the backend request fields: %#', (patch, expected) => {
      expect(buildSchedulePayload(draft(patch))).toEqual(expected)
    })
  })

  describe('describeScheduleDraft', () => {
    it('describes cron-backed modes in Chinese', () => {
      expect(describeScheduleDraft(draft({ mode: 'daily', time: '09:00' }))).toContain('09:00')
      expect(describeScheduleDraft(draft({ mode: 'interval', intervalValue: '1' }))).toBe(
        '每 1 小时'
      )
    })

    it('returns null when nothing can be described', () => {
      expect(describeScheduleDraft(draft({ mode: 'custom', cronExpr: '' }))).toBeNull()
    })
  })

  describe('draftFromSchedule', () => {
    it('restores the interval mode with a readable unit', () => {
      const restored = draftFromSchedule(
        task({ schedule_type: 'interval', interval_seconds: 7200 })
      )
      expect(restored.mode).toBe('interval')
      expect(restored.intervalValue).toBe('2')
      expect(restored.intervalUnit).toBe('hours')
    })

    it.each<[string, Partial<ScheduleDraft>]>([
      ['15 * * * *', { mode: 'hourly', minute: '15' }],
      ['30 18 * * *', { mode: 'daily', time: '18:30' }],
      ['30 18 * * 0,4', { mode: 'weekly', weekdays: [0, 4], time: '18:30' }],
      ['0 9 1 * *', { mode: 'monthly', monthDay: '1', time: '09:00' }],
    ])('restores hourly / daily / weekly / monthly modes: %s', (expr, expected) => {
      expect(draftFromSchedule(task({ cron_expr: expr }))).toMatchObject(expected)
    })

    it('falls back to the custom mode when the expression has no structured equivalent', () => {
      // */5 无结构化等价；31 12 10 9 * 锁定了具体月日，同样交给自定义保留原文。
      for (const expr of ['*/5 * * * *', '31 12 10 9 *']) {
        const restored = draftFromSchedule(task({ cron_expr: expr }))
        expect(restored.mode).toBe('custom')
        expect(restored.cronExpr).toBe(expr)
      }
    })

    it('round-trips every generated expression back to the same mode', () => {
      const drafts: ScheduleDraft[] = [
        draft({ mode: 'hourly', minute: '5' }),
        draft({ mode: 'daily', time: '07:45' }),
        draft({ mode: 'weekly', time: '18:30', weekdays: [2, 4] }),
        draft({ mode: 'monthly', time: '23:59', monthDay: '28' }),
      ]
      for (const candidate of drafts) {
        const cronExpr = cronFromScheduleDraft(candidate)
        expect(cronExpr).not.toBeNull()
        const restored = draftFromSchedule(task({ cron_expr: cronExpr }))
        expect(restored.mode).toBe(candidate.mode)
        expect(cronFromScheduleDraft(restored)).toBe(cronExpr)
      }
    })
  })

  describe('toggleWeekday', () => {
    it('adds, removes and keeps the selection sorted', () => {
      expect(toggleWeekday([0, 4], 2)).toEqual([0, 2, 4])
      expect(toggleWeekday([0, 4], 0)).toEqual([4])
      expect(toggleWeekday([], 6)).toEqual([6])
    })
  })

  describe('timezoneForTask', () => {
    it('keeps the timezone the task was created with', () => {
      // 回归：编辑「每天 09:00 / America/New_York」的任务不能把时区改写成默认值，
      // 否则保存后触发时刻会整体平移。
      expect(timezoneForTask({ timezone: 'America/New_York' })).toBe('America/New_York')
      expect(timezoneForTask({ timezone: 'UTC' })).toBe('UTC')
    })

    it('falls back to the backend default when the task has no timezone', () => {
      expect(timezoneForTask({ timezone: '' })).toBe(DEFAULT_TASK_TIMEZONE)
    })
  })
})
