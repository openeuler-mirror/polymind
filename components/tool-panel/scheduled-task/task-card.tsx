'use client'

import { useTranslation } from 'react-i18next'
import { Clock, Loader2, MoreVertical, Pencil, Play, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import type { ScheduledTask } from '@/services/scheduled-task-service'
import { formatSchedule } from './utils'

interface TaskCardProps {
  task: ScheduledTask
  pending: boolean
  onToggle: (task: ScheduledTask, enabled: boolean) => void
  onRun: (task: ScheduledTask) => void
  onDelete: (task: ScheduledTask) => void
  onEdit: (task: ScheduledTask) => void
}

export function TaskCard({ task, pending, onToggle, onRun, onDelete, onEdit }: TaskCardProps) {
  const { t } = useTranslation('tool-panel')
  const scheduleText = formatSchedule(task)
  // 执行中状态以后端 run 记录为准，不依赖会话消息流状态，避免 SSE 挂流/轮询
  // 间隙造成“UI 显示已结束但后端实际仍在运行”的误判。
  const isRunning = task.recent_runs.some(run => run.status === 'running')
  const scheduleTitle = [
    task.cron_expr
      ? t('scheduledTask.card.cronTitle', { expression: task.cron_expr })
      : null,
    t('scheduledTask.card.timezoneTitle', { timezone: task.timezone }),
  ]
    .filter(Boolean)
    .join(' · ')

  // 卡片拆为两个互不嵌套的交互区：顶部控件行（Switch/菜单）与内容按钮（编辑），
  // 避免 role=button 内嵌套交互控件的可访问性反模式。
  return (
    <div className="flex flex-col rounded-lg border bg-card p-5 shadow-sm transition-all duration-200 hover:shadow-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch
            checked={task.enabled}
            disabled={pending}
            onCheckedChange={checked => onToggle(task, checked)}
            aria-label={task.enabled ? t('scheduledTask.card.disableTask') : t('scheduledTask.card.enableTask')}
          />
          {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">{t('scheduledTask.card.actions')}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => onRun(task)} disabled={pending || isRunning}>
              <Play className="mr-2 h-4 w-4" />
              {t('scheduledTask.card.runNow')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(task)}>
              <Pencil className="mr-2 h-4 w-4" />
              {t('scheduledTask.card.editTask')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(task)}
              disabled={pending || isRunning}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t('scheduledTask.card.deleteTask')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <button
        type="button"
        onClick={() => onEdit(task)}
        aria-label={t('scheduledTask.card.editTaskWithName', { name: task.name })}
        className="mt-4 flex min-w-0 flex-1 flex-col rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <span className="block w-full truncate text-base font-medium text-foreground">
          {task.name}
        </span>

        <span className="mt-2 line-clamp-2 block min-h-10 w-full text-sm leading-5 text-muted-foreground">
          {task.content || t('scheduledTask.card.noDescription')}
        </span>

        <span className="mt-4 flex w-full items-center justify-between gap-3 border-t pt-3">
          <span
            className="flex min-w-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent/50"
            title={scheduleTitle}
          >
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{scheduleText}</span>
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">{task.timezone}</span>
        </span>
      </button>
    </div>
  )
}
