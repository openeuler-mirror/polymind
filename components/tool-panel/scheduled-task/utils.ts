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
 * 将标准 5/6/7 段 Cron 表达式格式化为当前语言的自然语义文本，
 * 例如 "0 9 * * *" -> "在 09:00" / "At 09:00"。无法识别的表达式返回 null，
 * 由调用方决定回退展示原文。
 */
export function formatCron(expr: string): string | null {
  const trimmed = expr.trim()
  if (!trimmed) return null
  try {
    const text = cronstrue.toString(trimmed, {
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
