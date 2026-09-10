import {
  addDays,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns'
import { enUS, zhCN } from 'date-fns/locale'

import i18n from '@/lib/i18n/config'
import { getRunDate, parseDateSafe } from '@/lib/date-utils'
import type {
  ScheduledTask,
  ScheduledTaskRunStatus,
  ScheduledTaskRunWithTask,
} from '@/services/scheduled-task-service'
import { formatSchedule } from './utils'

/** 当前界面语言是否为中文：决定日期格式与本地化文案。 */
function isZhLocale(): boolean {
  return i18n.language.startsWith('zh')
}

/** 执行记录的分组粒度：按天 / 按周 / 按月。 */
export type RunGroupGranularity = 'day' | 'week' | 'month'

/** 状态筛选值：all 表示不限状态。 */
export type RunStatusFilter = 'all' | ScheduledTaskRunStatus

/** 任务筛选值：RUN_TASK_ALL 表示不限任务，否则为任务 id。 */
export const RUN_TASK_ALL = 'all'

/** 执行记录页的筛选与分组条件，由页面工具栏受控传入。 */
export interface RunRecordsView {
  granularity: RunGroupGranularity
  taskId: string
  status: RunStatusFilter
}

export const DEFAULT_RUN_RECORDS_VIEW: RunRecordsView = {
  granularity: 'day',
  taskId: RUN_TASK_ALL,
  status: 'all',
}

/** 工具栏分段控件的粒度选项；文案键见 locales。 */
export const RUN_GRANULARITY_OPTIONS: Array<{ id: RunGroupGranularity; labelKey: string }> = [
  { id: 'day', labelKey: 'scheduledTask.runs.granularity.day' },
  { id: 'week', labelKey: 'scheduledTask.runs.granularity.week' },
  { id: 'month', labelKey: 'scheduledTask.runs.granularity.month' },
]

/** 周起始日：与中文习惯一致（周一为一周第一天）。 */
const WEEK_OPTIONS = { weekStartsOn: 1 } as const

export interface RunGroup {
  key: string // 分组键（时间桶起点的毫秒时间戳），用作 React key
  label: string // 分组标题：今天 / 昨天 / 本周 / 本月 / 9月8日 ...
  runs: ScheduledTaskRunWithTask[]
}

/** 按粒度取时间桶起点：按天=当天 0 点，按周=周一 0 点，按月=当月 1 日 0 点。 */
export function runBucketStart(date: Date, granularity: RunGroupGranularity): Date {
  switch (granularity) {
    case 'week':
      return startOfWeek(date, WEEK_OPTIONS)
    case 'month':
      return startOfMonth(date)
    default:
      return startOfDay(date)
  }
}

/** 按日期单元格式化分组标题：中文「9月8日」/ 英文「Sep 8」，跨年补齐年份。 */
function formatBucketDate(date: Date, unit: 'day' | 'month', withYear: boolean): string {
  if (isZhLocale()) {
    if (unit === 'month') return format(date, withYear ? 'yyyy年M月' : 'M月', { locale: zhCN })
    return format(date, withYear ? 'yyyy年M月d日' : 'M月d日', { locale: zhCN })
  }
  if (unit === 'month') return format(date, withYear ? 'MMM yyyy' : 'MMM', { locale: enUS })
  return format(date, withYear ? 'MMM d, yyyy' : 'MMM d', { locale: enUS })
}

/** 分组标题：近端用「今天/昨天/本周/上周/本月/上月」，更早的按粒度展示日期，跨年补年份避免歧义。 */
export function formatRunGroupLabel(
  bucketStart: Date,
  granularity: RunGroupGranularity,
  now: Date = new Date()
): string {
  const sameYear = bucketStart.getFullYear() === now.getFullYear()
  const t = (key: string) => i18n.t(`tool-panel:scheduledTask.runs.group.${key}`)

  if (granularity === 'day') {
    if (isSameDay(bucketStart, now)) return t('today')
    if (isSameDay(bucketStart, subDays(now, 1))) return t('yesterday')
    return formatBucketDate(bucketStart, 'day', !sameYear)
  }

  if (granularity === 'week') {
    if (isSameDay(bucketStart, startOfWeek(now, WEEK_OPTIONS))) return t('thisWeek')
    if (isSameDay(bucketStart, startOfWeek(subWeeks(now, 1), WEEK_OPTIONS))) return t('lastWeek')
    const end = addDays(bucketStart, 6)
    const endSameYear = end.getFullYear() === now.getFullYear()
    const startText = formatBucketDate(bucketStart, 'day', !sameYear)
    const endText = formatBucketDate(end, 'day', !endSameYear)
    return `${startText} - ${endText}`
  }

  if (isSameMonth(bucketStart, now)) return t('thisMonth')
  if (isSameMonth(bucketStart, subMonths(now, 1))) return t('lastMonth')
  return formatBucketDate(bucketStart, 'month', !sameYear)
}

/** 按当前筛选条件过滤执行记录（任务 + 状态）。 */
export function filterRuns(
  runs: ScheduledTaskRunWithTask[],
  view: RunRecordsView
): ScheduledTaskRunWithTask[] {
  return runs.filter(
    run =>
      (view.taskId === RUN_TASK_ALL || run.task_id === view.taskId) &&
      (view.status === 'all' || run.status === view.status)
  )
}

/** 按粒度切分组：分组与组内都按执行时间倒序，保证服务端顺序异常时展示依然稳定。 */
export function groupRunsByGranularity(
  runs: ScheduledTaskRunWithTask[],
  granularity: RunGroupGranularity,
  now: Date = new Date()
): RunGroup[] {
  const buckets = new Map<number, ScheduledTaskRunWithTask[]>()
  for (const run of runs) {
    const timestamp = runBucketStart(getRunDate(run), granularity).getTime()
    buckets.set(timestamp, [...(buckets.get(timestamp) ?? []), run])
  }

  return [...buckets.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([timestamp, items]) => ({
      key: String(timestamp),
      label: formatRunGroupLabel(new Date(timestamp), granularity, now),
      runs: [...items].sort((a, b) => getRunDate(b).getTime() - getRunDate(a).getTime()),
    }))
}

/** 记录内的时刻文案（HH:mm:ss），时间缺失时返回占位符（此处保留 null 语义，勿换 getRunDate）。 */
export function formatRunTime(run: ScheduledTaskRunWithTask): string {
  const start = parseDateSafe(run.started_at) ?? parseDateSafe(run.created_at)
  return start ? format(start, 'HH:mm:ss') : '--'
}

/**
 * 执行耗时：不足 1 分钟保留一位小数（如 8.0s），更长按分秒/时分展示；
 * 缺少开始/结束时间时返回 null（调用方不展示）。
 */
export function formatRunDuration(run: ScheduledTaskRunWithTask): string | null {
  const start = parseDateSafe(run.started_at) ?? parseDateSafe(run.created_at)
  const end = parseDateSafe(run.finished_at)
  if (!start || !end) return null

  const ms = Math.max(0, end.getTime() - start.getTime())
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`

  const seconds = Math.round(ms / 1000)
  if (seconds < 3600) {
    return i18n.t('tool-panel:scheduledTask.runs.duration.minutesSeconds', {
      minutes: Math.floor(seconds / 60),
      seconds: seconds % 60,
    })
  }
  return i18n.t('tool-panel:scheduledTask.runs.duration.hoursMinutes', {
    hours: Math.floor(seconds / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
  })
}

/**
 * 任务 id -> 调度规则文案（如「每 1 小时」）：运行记录接口没有触发来源字段，
 * 记录行第三项展示调度规则作为可核对上下文；任务已删除时该记录不展示第三项。
 */
export function buildTaskScheduleLabels(
  tasks: Array<Pick<ScheduledTask, 'id' | 'schedule_type' | 'cron_expr' | 'interval_seconds'>>
): Record<string, string> {
  const labels: Record<string, string> = {}
  for (const task of tasks) {
    const text = formatSchedule(task)
    if (text && text !== '—') labels[task.id] = text
  }
  return labels
}
