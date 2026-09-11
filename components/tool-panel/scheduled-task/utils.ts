import cronstrue from 'cronstrue'
import 'cronstrue/locales/zh_CN'
import 'cronstrue/locales/en'

import i18n from '@/lib/i18n/config'
import type { ScheduledTask, ScheduledTaskRunStatus } from '@/services/scheduled-task-service'

/** 当前界面语言对应的 cronstrue 语言标识。 */
function getCronLocale(): string {
  return i18n.language.startsWith('zh') ? 'zh_CN' : 'en'
}

/** 将 interval 秒数格式化为人类可读文本，例如 3600 -> "每 1 小时"。 */
export function formatInterval(seconds: number): string {
  if (seconds % 3600 === 0) {
    return i18n.t('tool-panel:scheduledTask.interval.hours', { count: seconds / 3600 })
  }
  if (seconds % 60 === 0) {
    return i18n.t('tool-panel:scheduledTask.interval.minutes', { count: seconds / 60 })
  }
  return i18n.t('tool-panel:scheduledTask.interval.seconds', { count: seconds })
}

/**
 * 星期序号与后端 APScheduler 一致：0=周一 … 6=周日（标准 crontab 是 0=周日，且不接受 7）。
 * 生成表达式统一用英文星期名，避免数字在标准 crontab 语义下被误读。
 */
export const WEEKDAY_CRON_NAMES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

/** 数字是否落在 APScheduler 的星期区间（展示归一化与反解共用同一判定）。 */
const isWeekdayIndex = (value: number): boolean => value >= 0 && value <= 6

/** 展示前把数字星期改写成英文名，保证文案与实际触发日一致（见 WEEKDAY_CRON_NAMES）。 */
function normalizeCronDayOfWeek(field: string): string {
  return field
    .split(',')
    .map(part => {
      const [spec, step] = part.split('/')
      const normalized = spec
        .split('-')
        .map(token => {
          if (!/^\d+$/.test(token)) return token
          const index = Number(token)
          return isWeekdayIndex(index) ? WEEKDAY_CRON_NAMES[index] : token
        })
        .join('-')
      return step ? `${normalized}/${step}` : normalized
    })
    .join(',')
}

/**
 * 将标准 5/6/7 段 Cron 表达式格式化为当前语言的自然语义文本，
 * 例如 "0 9 * * *" -> "在 09:00" / "At 09:00"。无法识别的表达式返回 null，
 * 由调用方决定回退展示原文。
 */
export function formatCron(expr: string): string | null {
  const trimmed = expr.trim()
  if (!trimmed) return null
  const fields = trimmed.split(/\s+/)
  // 只对后端支持的 5 段表达式归一化星期字段；段数异常保持原文，由校验逻辑提示用户。
  const normalized =
    fields.length === 5
      ? [...fields.slice(0, 4), normalizeCronDayOfWeek(fields[4])].join(' ')
      : trimmed
  try {
    const text = cronstrue.toString(normalized, {
      locale: getCronLocale(),
      use24HourTimeFormat: true,
    })
    // cronstrue zh_CN 的“在09:00”缺少空格，统一补充提升可读性。
    return text.replace(/在(?=\d)/g, '在 ')
  } catch {
    return null
  }
}

/** 新建任务弹窗中可选的常用时区。 */
export const TIMEZONE_OPTIONS = [
  'Asia/Shanghai',
  'UTC',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
]

/** 生成卡片底部展示的调度规则文本。 */
export function formatSchedule(
  task: Pick<ScheduledTask, 'schedule_type' | 'cron_expr' | 'interval_seconds'>
): string {
  if (task.schedule_type === 'interval' && task.interval_seconds) {
    return formatInterval(task.interval_seconds)
  }
  if (task.schedule_type === 'cron' && task.cron_expr) {
    return formatCron(task.cron_expr) ?? task.cron_expr
  }
  return '—'
}

/** 调度字段子集：格式化、payload 拼装与草稿反推共用的最小任务形状。 */
type TaskSchedule = Pick<ScheduledTask, 'schedule_type' | 'cron_expr' | 'interval_seconds'>

/** 重复方式：单一真相源，顺序即用户心智中的由简到繁；类型与下拉文案键均由该表派生。 */
const REPEAT_MODES = ['interval', 'hourly', 'daily', 'weekly', 'monthly', 'custom'] as const
export type RepeatMode = (typeof REPEAT_MODES)[number]
export const REPEAT_MODE_OPTIONS: Array<{ value: RepeatMode; labelKey: string }> = REPEAT_MODES.map(
  value => ({ value, labelKey: `scheduledTask.schedule.repeatMode.${value}` })
)

/** 间隔单位 -> 换算秒数（后端只认 interval_seconds）；下拉选项由同一张表派生，避免两处重复。 */
export const INTERVAL_UNIT_SECONDS = { seconds: 1, minutes: 60, hours: 3600 }
export type IntervalUnit = keyof typeof INTERVAL_UNIT_SECONDS
export const INTERVAL_UNIT_OPTIONS = (Object.keys(INTERVAL_UNIT_SECONDS) as IntervalUnit[]).map(
  value => ({ value, labelKey: `scheduledTask.schedule.intervalUnit.${value}` })
)

/** 每周模式下可勾选的星期（value 同 WEEKDAY_CRON_NAMES 下标）；文案键由星期名派生。 */
export const WEEKDAY_OPTIONS = WEEKDAY_CRON_NAMES.map((name, value) => ({
  value,
  labelKey: `scheduledTask.schedule.weekdayShort.${name}`,
  fullKey: `scheduledTask.schedule.weekdayFull.${name}`,
}))

/** 每月模式下可选的日期。 */
export const MONTH_DAY_OPTIONS: number[] = Array.from({ length: 31 }, (_, index) => index + 1)

/** 表单里的计划时间草稿：各模式各持字段，切换模式不会丢失已填内容。 */
export interface ScheduleDraft {
  mode: RepeatMode
  /** 每天 / 每周 / 每月：执行时刻 HH:mm。 */
  time: string
  /** 每小时：第几分钟（0-59）。 */
  minute: string
  /** 间隔：数值，配合 intervalUnit 换算成秒。 */
  intervalValue: string
  intervalUnit: IntervalUnit
  /** 每周：选中的星期（0=周一 … 6=周日）。 */
  weekdays: number[]
  /** 每月：几号（1-31）。 */
  monthDay: string
  /** 自定义：原始 cron 表达式。 */
  cronExpr: string
}

const pad2 = (value: number): string => String(value).padStart(2, '0')

/** 表单数字文本 -> 落在 [min,max] 内的整数（沿用 Number 语义，空串按 0 计）；非法返回 null。 */
const toInt = (value: string, min: number, max: number): number | null => {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric >= min && numeric <= max ? numeric : null
}

/**
 * 新建任务时的默认草稿：默认「每天」，时刻取任务时区（而非浏览器时区）下的下一个整点，
 * 避免默认时刻落在过去时间里；只做墙上时间加减，故用本地 Date 承载值再按本地取值格式化。
 */
export function createScheduleDraft(overrides: Partial<ScheduleDraft> = {}): ScheduleDraft {
  const now = nowWallClock(DEFAULT_TASK_TIMEZONE)
  const nextHour = new Date(now.year, now.month - 1, now.day, now.hour, now.minute)
  nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0)
  return {
    mode: 'daily',
    time: `${pad2(nextHour.getHours())}:${pad2(nextHour.getMinutes())}`,
    minute: '0',
    intervalValue: '1',
    intervalUnit: 'hours',
    weekdays: [0],
    monthDay: '1',
    cronExpr: '',
    ...overrides,
  }
}

/** 解析 HH:mm，非法返回 null。 */
export function parseTimeInput(value: string): { hour: number; minute: number } | null {
  const matched = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!matched) return null
  const hour = Number(matched[1])
  const minute = Number(matched[2])
  if (hour > 23 || minute > 59) return null
  return { hour, minute }
}

/** 新建任务时的默认时区，与后端 CreateScheduledTaskRequest 的默认值保持一致。 */
export const DEFAULT_TASK_TIMEZONE = 'Asia/Shanghai'

/** 指定时区下的当前墙上时间（只取年月日时分），避免跨时区 Date 换算误差。 */
function nowWallClock(timeZone: string): Record<string, number> {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date()).map(part => [part.type, Number(part.value)] as const)
  )
  // 部分环境把午夜渲染成 24 点，取模归一到 0 点。
  return { ...parts, hour: parts.hour % 24 }
}

/** 把英文星期名或数字转成 0-6 下标；无法识别返回 null。 */
function toWeekdayIndex(token: string): number | null {
  const normalized = token.trim().toLowerCase()
  if (/^\d+$/.test(normalized)) {
    const numeric = Number(normalized)
    return isWeekdayIndex(numeric) ? numeric : null
  }
  const index = WEEKDAY_CRON_NAMES.indexOf(normalized as (typeof WEEKDAY_CRON_NAMES)[number])
  return index >= 0 ? index : null
}

/** 解析星期字段：支持英文名 / 数字 0-6、逗号列表与 a-b 区间；无法识别返回 null。 */
function parseWeekdayField(field: string): number[] | null {
  if (!field || field === '*' || field.includes('/')) return null
  const weekdays = new Set<number>()
  for (const part of field.split(',')) {
    const bounds: number[] = []
    for (const token of part.split('-')) {
      const index = toWeekdayIndex(token)
      if (index === null) return null
      bounds.push(index)
    }
    if (bounds.length === 1) {
      weekdays.add(bounds[0])
      continue
    }
    if (bounds.length !== 2 || bounds[0] > bounds[1]) return null
    for (let day = bounds[0]; day <= bounds[1]; day += 1) {
      weekdays.add(day)
    }
  }
  return weekdays.size > 0 ? [...weekdays].sort((a, b) => a - b) : null
}

/** 由草稿生成 cron 表达式；无法生成时返回 null（调用方应先做校验）。 */
export function cronFromScheduleDraft(draft: ScheduleDraft): string | null {
  switch (draft.mode) {
    case 'hourly': {
      const minute = toInt(draft.minute, 0, 59)
      if (minute === null) return null
      return `${minute} * * * *`
    }
    case 'daily': {
      const time = parseTimeInput(draft.time)
      if (!time) return null
      return `${time.minute} ${time.hour} * * *`
    }
    case 'weekly': {
      const time = parseTimeInput(draft.time)
      if (!time || draft.weekdays.length === 0) return null
      const names = [...draft.weekdays]
        .sort((a, b) => a - b)
        .map(day => WEEKDAY_CRON_NAMES[day])
        .filter((name): name is (typeof WEEKDAY_CRON_NAMES)[number] => Boolean(name))
      if (names.length !== draft.weekdays.length) return null
      return `${time.minute} ${time.hour} * * ${names.join(',')}`
    }
    case 'monthly': {
      const time = parseTimeInput(draft.time)
      const day = toInt(draft.monthDay, 1, 31)
      if (!time || day === null) return null
      return `${time.minute} ${time.hour} ${day} * *`
    }
    case 'custom':
      return draft.cronExpr.trim() || null
    default:
      return null
  }
}

/** 勾选/取消某个星期，结果保持升序，保证生成的表达式稳定可读。 */
export function toggleWeekday(weekdays: number[], value: number): number[] {
  return weekdays.includes(value)
    ? weekdays.filter(day => day !== value)
    : [...weekdays, value].sort((a, b) => a - b)
}

/** 把间隔数值 + 单位换算成后端需要的秒数；非法返回 null。 */
export function intervalSecondsFromDraft(draft: ScheduleDraft): number | null {
  const value = toInt(draft.intervalValue, 1, Number.MAX_VALUE)
  return value === null ? null : value * INTERVAL_UNIT_SECONDS[draft.intervalUnit]
}

/**
 * 校验 cron 表达式是否被后端接受：必须是 5 段，且各字段取值合法。cronstrue 不识别
 * APScheduler 的星期语义（0=周一、不接受 7），因此这里额外约束星期字段。
 */
export function isValidCronExpression(expr: string): boolean {
  const fields = expr.trim().split(/\s+/)
  if (fields.length !== 5) return false
  if (formatCron(expr) === null) return false
  return fields[4].split(',').every(part =>
    part
      .split('/')[0]
      .split('-')
      .every(token => !/^\d+$/.test(token) || toWeekdayIndex(token) !== null)
  )
}

/** 默认取词器：供组件之外的调用方（测试、非 React 代码）按当前语言取词。 */
const defaultTranslate = (key: string): string => i18n.t(key)

/**
 * 校验计划时间草稿，返回错误提示；通过时返回 null。translate 由调用方注入（组件传 useTranslation
 * 的 t），让「语言变化」成为显式依赖，避免文案改用模块级 i18n 单例后漏掉重算。
 */
export function validateScheduleDraft(
  draft: ScheduleDraft,
  translate: (key: string) => string = defaultTranslate
): string | null {
  const t = (key: string) => translate(`tool-panel:scheduledTask.schedule.${key}`)
  switch (draft.mode) {
    case 'interval':
      return intervalSecondsFromDraft(draft) === null ? t('invalidInterval') : null
    case 'hourly':
      return toInt(draft.minute, 0, 59) === null ? t('invalidMinute') : null
    case 'daily':
      return parseTimeInput(draft.time) ? null : t('timeRequired')
    case 'weekly':
      if (draft.weekdays.length === 0) return t('weekdayRequired')
      return parseTimeInput(draft.time) ? null : t('timeRequired')
    case 'monthly':
      if (toInt(draft.monthDay, 1, 31) === null) return t('monthDayRequired')
      return parseTimeInput(draft.time) ? null : t('timeRequired')
    case 'custom': {
      const expr = draft.cronExpr.trim()
      if (!expr) return t('cronRequired')
      if (expr.split(/\s+/).length !== 5) {
        return t('cronSegments')
      }
      if (!isValidCronExpression(expr)) return t('cronFieldInvalid')
      return null
    }
    default:
      return t('modeRequired')
  }
}

/** 把草稿转换成后端请求字段；草稿非法时返回 null。 */
export function buildSchedulePayload(draft: ScheduleDraft): TaskSchedule | null {
  if (validateScheduleDraft(draft) !== null) return null
  const interval = draft.mode === 'interval'
  return {
    schedule_type: interval ? 'interval' : 'cron',
    cron_expr: interval ? null : cronFromScheduleDraft(draft),
    interval_seconds: interval ? intervalSecondsFromDraft(draft) : null,
  }
}

/** 生成弹窗内的计划预览文案；无法生成时返回 null。 */
export function describeScheduleDraft(draft: ScheduleDraft): string | null {
  if (draft.mode === 'interval') {
    const seconds = intervalSecondsFromDraft(draft)
    return seconds === null ? null : formatInterval(seconds)
  }
  const cronExpr = cronFromScheduleDraft(draft)
  return cronExpr ? (formatCron(cronExpr) ?? cronExpr) : null
}

/** 间隔秒数回填为「数值 + 单位」，尽量取用户可读的大单位。 */
function splitIntervalSeconds(
  seconds: number
): Pick<ScheduleDraft, 'intervalValue' | 'intervalUnit'> {
  if (seconds % 3600 === 0) return { intervalValue: String(seconds / 3600), intervalUnit: 'hours' }
  if (seconds % 60 === 0) return { intervalValue: String(seconds / 60), intervalUnit: 'minutes' }
  return { intervalValue: String(seconds), intervalUnit: 'seconds' }
}

/** 把 5 段 cron 反推成草稿；无法对应到具体模式时返回 null。 */
function parseCronDraft(expr: string): (Partial<ScheduleDraft> & { mode: RepeatMode }) | null {
  const fields = expr.split(/\s+/)
  if (fields.length !== 5) return null
  const [minuteField, hourField, dayField, monthField, weekField] = fields
  const minute = /^\d{1,2}$/.test(minuteField) ? toInt(minuteField, 0, 59) : null
  const hour = /^\d{1,2}$/.test(hourField) ? toInt(hourField, 0, 23) : null
  const time = minute !== null && hour !== null ? `${pad2(hour)}:${pad2(minute)}` : null

  if (weekField !== '*' && dayField === '*' && monthField === '*') {
    const weekdays = parseWeekdayField(weekField)
    return weekdays && time ? { mode: 'weekly', weekdays, time } : null
  }
  if (weekField === '*' && dayField === '*' && monthField === '*') {
    if (hourField === '*' && minute !== null) return { mode: 'hourly', minute: String(minute) }
    return time ? { mode: 'daily', time } : null
  }
  if (weekField === '*' && monthField === '*' && /^\d{1,2}$/.test(dayField)) {
    return time ? { mode: 'monthly', time, monthDay: String(Number(dayField)) } : null
  }
  // 形如「30 18 10 9 *」这类锁定到具体月日的表达式没有对应模式，交给「自定义」保留原文。
  return null
}

/** 由已存在的任务反推草稿；无法识别为某个模式时回落到「自定义」并保留原表达式。 */
export function draftFromSchedule(task: TaskSchedule): ScheduleDraft {
  const draft = createScheduleDraft()
  if (task.schedule_type === 'interval') {
    const seconds = task.interval_seconds
    if (!seconds || seconds <= 0) return draft
    return { ...draft, mode: 'interval', ...splitIntervalSeconds(seconds) }
  }
  const expr = (task.cron_expr ?? '').trim()
  if (!expr) return draft
  const parsed = parseCronDraft(expr)
  if (!parsed) return { ...draft, mode: 'custom', cronExpr: expr }
  return { ...draft, ...parsed }
}

/** 编辑回填时始终保留任务原时区：调度模式只描述「何时触发」，若改写成默认时区，触发时刻会整体平移。 */
export function timezoneForTask(task: Pick<ScheduledTask, 'timezone'>): string {
  return task.timezone || DEFAULT_TASK_TIMEZONE
}

export interface RunStatusMeta {
  label: string
  /** 执行记录页 Badge 的描边/底色样式。 */
  className: string
  /** 侧栏文件夹中状态圆点的样式（单一真相源，勿在组件内另建映射）。 */
  dot: string
}

/** 执行状态 -> i18n 文案键（单一真相源，组件内勿另建映射）。 */
export const RUN_STATUS_LABEL_KEYS: Record<ScheduledTaskRunStatus, string> = {
  running: 'tool-panel:scheduledTask.runStatus.running',
  succeeded: 'tool-panel:scheduledTask.runStatus.succeeded',
  failed: 'tool-panel:scheduledTask.runStatus.failed',
  skipped: 'tool-panel:scheduledTask.runStatus.skipped',
}

export const RUN_STATUS_STYLES: Record<ScheduledTaskRunStatus, Omit<RunStatusMeta, 'label'>> = {
  running: {
    className: 'border-blue-200 bg-blue-50 text-blue-700',
    dot: 'bg-blue-500 animate-pulse',
  },
  succeeded: {
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    dot: 'bg-emerald-500',
  },
  failed: {
    className: 'border-red-200 bg-red-50 text-red-700',
    dot: 'bg-red-500',
  },
  skipped: {
    className: 'border-slate-200 bg-slate-50 text-slate-500',
    dot: 'bg-slate-400',
  },
}

const UNKNOWN_RUN_STATUS_STYLE = {
  className: 'border-slate-200 bg-slate-50 text-slate-500',
  dot: 'bg-slate-400',
}

export function getRunStatusMeta(status: string): RunStatusMeta {
  const labelKey = RUN_STATUS_LABEL_KEYS[status as ScheduledTaskRunStatus]
  if (labelKey) {
    return { label: i18n.t(labelKey), ...RUN_STATUS_STYLES[status as ScheduledTaskRunStatus] }
  }
  return {
    label: status || i18n.t('tool-panel:scheduledTask.runStatus.unknown'),
    ...UNKNOWN_RUN_STATUS_STYLE,
  }
}
