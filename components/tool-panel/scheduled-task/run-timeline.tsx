'use client'

import { Check, ChevronRight, Loader2, Minus, X, type LucideIcon } from 'lucide-react'

import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import type { ScheduledTaskRunWithTask } from '@/services/scheduled-task-service'
import { getRunStatusMeta } from './utils'
import { formatRunDuration, formatRunTime, type RunGroup } from './run-records-utils'

/** 状态 -> 图标；文案与配色一律取自 getRunStatusMeta（单一真相源），此处不再自建色板。 */
const STATUS_ICONS: Record<string, LucideIcon> = {
  running: Loader2,
  succeeded: Check,
  failed: X,
  skipped: Minus,
}

function RunStatusBadge({ status }: { status: string }) {
  const { label, className } = getRunStatusMeta(status)
  const Icon = STATUS_ICONS[status] ?? Minus
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-xs',
        className
      )}
    >
      <Icon className={cn('h-3 w-3', status === 'running' && 'animate-spin')} />
      {label}
    </span>
  )
}

interface RunTimelineItemProps {
  run: ScheduledTaskRunWithTask
  /** 任务调度规则文案，缺失（任务已删除）时不展示。 */
  scheduleLabel?: string
  onOpenConversation: (run: ScheduledTaskRunWithTask) => void
}

function RunTimelineItem({ run, scheduleLabel, onOpenConversation }: RunTimelineItemProps) {
  const { t } = useTranslation('tool-panel')
  const duration = formatRunDuration(run)
  const openable = Boolean(run.session_id)

  return (
    <li className="relative pb-3 pl-[51px]">
      {/* 记录圆点：与标题行垂直居中对齐，颜色沿用状态圆点单一真相源 */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-4 top-[6px] h-2 w-2 rounded-full',
          getRunStatusMeta(run.status).dot
        )}
      />
      <button
        type="button"
        disabled={!openable}
        title={openable ? t('scheduledTask.runs.openConversation') : undefined}
        onClick={() => onOpenConversation(run)}
        className={cn(
          'group -mx-2 block w-[calc(100%+1rem)] rounded-md px-2 text-left',
          openable && 'cursor-pointer transition-colors hover:bg-muted/60'
        )}
      >
        <div className="flex h-5 items-center gap-2.5">
          <span className="min-w-0 truncate text-sm text-foreground">{run.task_name}</span>
          <RunStatusBadge status={run.status} />
          {openable && (
            <ChevronRight
              aria-hidden="true"
              className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
            />
          )}
        </div>
        <div className="mt-1 flex h-[18px] items-center gap-3 text-xs text-muted-foreground">
          <span>{formatRunTime(run)}</span>
          {duration && <span>{duration}</span>}
          {scheduleLabel && <span className="min-w-0 truncate">{scheduleLabel}</span>}
        </div>
        {run.error && (
          <div className="mt-1 line-clamp-2 text-xs leading-[18px] text-red-500" title={run.error}>
            {run.error}
          </div>
        )}
      </button>
    </li>
  )
}

interface RunRecordsTimelineProps {
  groups: RunGroup[]
  /** 任务 id -> 调度规则文案。 */
  scheduleLabels: Record<string, string>
  onOpenConversation: (run: ScheduledTaskRunWithTask) => void
}

/**
 * 执行记录时间线：左侧竖线在「分组圆点列」（离线左边缘 5px）与「记录圆点列」（20px）之间弯折，
 * 用带圆角的边框盒子拼出（顶部左+下边框/左下圆角，底部右+下边框/右下圆角，中间 1px 竖线相连）。
 * 纵向节奏按参考图取值：分组头顶→首条记录 56px、记录间隔 76px、分组底部留 12px。
 */
export function RunRecordsTimeline({
  groups,
  scheduleLabels,
  onOpenConversation,
}: RunRecordsTimelineProps) {
  return (
    <ol className="relative">
      {groups.map(group => (
        <li key={group.key} className="relative">
          <span
            aria-hidden="true"
            className="absolute left-[5px] top-[18px] h-[34px] w-[15px] rounded-bl-[14px] border-b border-l border-border"
          />
          <span
            aria-hidden="true"
            className="absolute bottom-0 left-[5px] h-[34px] w-[15px] rounded-br-[14px] border-b border-r border-border"
          />
          <span
            aria-hidden="true"
            className="absolute bottom-[34px] left-[19px] top-[52px] w-px bg-border"
          />

          <div className="flex h-9 items-center">
            <span
              aria-hidden="true"
              className="absolute left-px top-[14px] h-2 w-2 rounded-full bg-neutral-400"
            />
            <h3 className="pl-[33px] text-sm font-medium text-foreground">{group.label}</h3>
          </div>

          <ul className="pb-3 pt-7">
            {group.runs.map(run => (
              <RunTimelineItem
                key={run.id}
                run={run}
                scheduleLabel={scheduleLabels[run.task_id]}
                onOpenConversation={onOpenConversation}
              />
            ))}
          </ul>
        </li>
      ))}
    </ol>
  )
}
