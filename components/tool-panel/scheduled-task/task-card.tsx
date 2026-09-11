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
import { cn } from '@/lib/utils'
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

/** 卡片脚注调度信息胶囊：调色/间距统一。 */
const CHIP_CLASS =
  'inline-flex min-w-0 items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground'

export function TaskCard({ task, pending, onToggle, onRun, onDelete, onEdit }: TaskCardProps) {
  const { t } = useTranslation('tool-panel')
  const scheduleText = formatSchedule(task)
  // 执行中状态以后端 run 记录为准，不依赖会话消息流状态，避免 SSE 挂流/轮询
  // 间隙造成“UI 显示已结束但后端实际仍在运行”的误判。
  const isRunning = task.recent_runs.some(run => run.status === 'running')
  const scheduleTitle = [
    task.cron_expr ? t('scheduledTask.card.cronTitle', { expression: task.cron_expr }) : null,
    t('scheduledTask.card.timezoneTitle', { timezone: task.timezone }),
  ]
    .filter(Boolean)
    .join(' · ')

  // 「整卡点击即编辑」由覆盖层透明按钮承担，卡片内部仍是互不嵌套的交互控件（Switch／菜单），
  // 避免 role=button 内嵌交互控件的可访问性反模式，同时保留整卡可点的操作手感。
  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border bg-card p-4 transition-all duration-200',
        'hover:border-border/80 hover:shadow-lg hover:shadow-primary/5 focus-within:shadow-lg focus-within:shadow-primary/5',
        task.enabled ? 'border-border/70' : 'border-dashed border-border/70'
      )}
    >
      <button
        type="button"
        onClick={() => onEdit(task)}
        aria-label={t('scheduledTask.card.editTaskWithName', { name: task.name })}
        className="absolute inset-0 rounded-2xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
      />

      {/* 停用态用整体降透明度表达「已暂停」；该 opacity 会新建层叠上下文，
          因此本层自身必须带 z-10，否则内部控件会被覆盖层压住而点不动。 */}
      <div
        className={cn(
          'pointer-events-none relative z-10 flex flex-1 flex-col select-none',
          !task.enabled && 'opacity-60'
        )}
      >
        {/* pr-10：为右上角菜单按钮预留命中区 */}
        <div className="flex items-center justify-between gap-2 pr-10">
          <Switch
            checked={task.enabled}
            disabled={pending}
            onCheckedChange={checked => onToggle(task, checked)}
            className="pointer-events-auto"
            aria-label={
              task.enabled
                ? t('scheduledTask.card.disableTask')
                : t('scheduledTask.card.enableTask')
            }
          />
          {isRunning && (
            <span className="inline-flex items-center gap-1.5 text-xs text-primary">
              <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
              {t('scheduledTask.runStatus.running')}
            </span>
          )}
        </div>

        <span className="mt-3.5 block w-full truncate text-base font-medium leading-6 text-foreground">
          {task.name}
        </span>

        <span className="mt-2 line-clamp-2 min-h-10 w-full break-all text-sm leading-5 text-muted-foreground">
          {task.content || t('scheduledTask.card.noDescription')}
        </span>

        <div className="mt-auto flex items-center gap-3 pt-4">
          <span className={CHIP_CLASS} title={scheduleTitle}>
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{scheduleText}</span>
          </span>
        </div>
      </div>

      {/* 操作控件层：位于内容层之上，pending 指示器与菜单都保持可点 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between p-2.5">
        <span className="pointer-events-auto">
          {pending && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground motion-reduce:animate-none" />
          )}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="pointer-events-auto text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
            >
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
    </div>
  )
}
