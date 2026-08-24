import cronstrue from 'cronstrue'
import 'cronstrue/locales/zh_CN'

import type { ScheduledTask, ScheduledTaskRunStatus } from '@/services/scheduled-task-service'

/** 将 interval 秒数格式化为人类可读文本，例如 3600 -> "每 1 小时"。 */
export function formatInterval(seconds: number): string {
  if (seconds % 3600 === 0) {
    return `每 ${seconds / 3600} 小时`
  }
  if (seconds % 60 === 0) {
    return `每 ${seconds / 60} 分钟`
  }
  return `每 ${seconds} 秒`
}

/**
 * 将标准 5/6/7 段 Cron 表达式格式化为中文语义文本（cronstrue zh_CN 文案），
 * 例如 "0 9 * * *" -> "在 09:00"。无法识别的表达式返回 null，
 * 由调用方决定回退展示原文。
 */
export function formatCron(expr: string): string | null {
  const trimmed = expr.trim()
  if (!trimmed) return null
  try {
    const text = cronstrue.toString(trimmed, {
      locale: 'zh_CN',
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

export const RUN_STATUS_META: Record<ScheduledTaskRunStatus, RunStatusMeta> = {
  running: {
    label: '执行中',
    className: 'border-blue-200 bg-blue-50 text-blue-700',
    dot: 'bg-blue-500 animate-pulse',
  },
  succeeded: {
    label: '成功',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    dot: 'bg-emerald-500',
  },
  failed: {
    label: '失败',
    className: 'border-red-200 bg-red-50 text-red-700',
    dot: 'bg-red-500',
  },
  skipped: {
    label: '已跳过',
    className: 'border-slate-200 bg-slate-50 text-slate-500',
    dot: 'bg-slate-400',
  },
}

export function getRunStatusMeta(status: string): RunStatusMeta {
  return (
    RUN_STATUS_META[status as ScheduledTaskRunStatus] ?? {
      label: status || '未知',
      className: 'border-slate-200 bg-slate-50 text-slate-500',
      dot: 'bg-slate-400',
    }
  )
}
