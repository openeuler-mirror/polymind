'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, CalendarClock, Info, Plus, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { useScheduledTaskStore } from '@/lib/stores/scheduled-task-store'
import {
  scheduledTaskService,
  type ScheduledTask,
  type ScheduledTaskRunStatus,
} from '@/services/scheduled-task-service'
import { cn } from '@/lib/utils'
import { CreateTaskDialog, EditTaskDialog } from './create-task-dialog'
import { DeleteScheduledTaskDialog } from './delete-task-dialog'
import { triggerScheduledTaskRun } from './execution'
import { RunRecords, useRunRecords } from './run-records'
import {
  DEFAULT_RUN_RECORDS_VIEW,
  RUN_GRANULARITY_OPTIONS,
  RUN_TASK_ALL,
  type RunRecordsView,
  type RunStatusFilter,
} from './run-records-utils'
import { TaskCard } from './task-card'
import { RUN_STATUS_LABEL_KEYS } from './utils'

type TabId = 'tasks' | 'runs'

const TABS: Array<{ id: TabId; labelKey: string }> = [
  { id: 'tasks', labelKey: 'scheduledTask.tabs.tasks' },
  { id: 'runs', labelKey: 'scheduledTask.tabs.runs' },
]

/** 任务卡片网格列：骨架屏与实际列表共用，避免内联样式重复。 */
const TASK_GRID_STYLE = { gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' } as const

/** 状态筛选项顺序：与 RUN_STATUS_LABEL_KEYS 声明顺序一致，文案按当前语言解析。 */
const STATUS_FILTERS: RunStatusFilter[] = [
  'all',
  ...(Object.keys(RUN_STATUS_LABEL_KEYS) as ScheduledTaskRunStatus[]),
]

/** 工具栏控件统一样式：28px 高 / 13px 字；SelectTrigger 自带 data-[size] 高度同层优先，故用 important 压过。 */
const CONTROL_CLASS = 'h-7! gap-1.5 px-3 text-[13px] text-foreground'

export function ScheduledTaskPage() {
  const { t } = useTranslation('tool-panel')
  const { toast } = useToast()
  const tasks = useScheduledTaskStore(s => s.tasks)
  const loading = useScheduledTaskStore(s => s.loading)
  const error = useScheduledTaskStore(s => s.error)
  const refresh = useScheduledTaskStore(s => s.refresh)
  const subscribe = useScheduledTaskStore(s => s.subscribe)
  const unsubscribe = useScheduledTaskStore(s => s.unsubscribe)
  const [activeTab, setActiveTab] = useState<TabId>('tasks')
  // 执行记录的筛选与分组条件由页面持有：工具栏渲染在标签行右侧（参考图布局），
  // 数据侧用同一个 view 驱动，切换标签时不丢失筛选状态。
  const [runView, setRunView] = useState<RunRecordsView>(DEFAULT_RUN_RECORDS_VIEW)
  const runRecords = useRunRecords(runView, { enabled: activeTab === 'runs' })
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc')
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ScheduledTask | null>(null)
  const [pendingTaskIds, setPendingTaskIds] = useState<Record<string, boolean>>({})
  const [deleteTarget, setDeleteTarget] = useState<ScheduledTask | null>(null)
  // 挂载即订阅共享数据源，复用全局轮询，避免独立定时器重复请求。
  useEffect(() => {
    subscribe()
    return () => unsubscribe()
  }, [subscribe, unsubscribe])

  const setTaskPending = (taskId: string, pending: boolean) => {
    setPendingTaskIds(prev => {
      const next = { ...prev }
      if (pending) {
        next[taskId] = true
      } else {
        delete next[taskId]
      }
      return next
    })
  }

  const handleToggle = async (task: ScheduledTask, enabled: boolean) => {
    setTaskPending(task.id, true)
    try {
      if (enabled) {
        await scheduledTaskService.enableTask(task.id)
      } else {
        await scheduledTaskService.disableTask(task.id)
      }
      void refresh(true)
    } catch (error) {
      console.error('Failed to toggle scheduled task:', error)
      toast({
        title: t('common:status.error'),
        description: enabled
          ? t('scheduledTask.toast.enableFailed')
          : t('scheduledTask.toast.disableFailed'),
        variant: 'destructive',
      })
    } finally {
      setTaskPending(task.id, false)
    }
  }

  const handleRun = async (task: ScheduledTask) => {
    setTaskPending(task.id, true)
    try {
      await triggerScheduledTaskRun(task, toast)
    } finally {
      setTaskPending(task.id, false)
    }
  }

  const sortedTasks = useMemo(() => {
    const direction = sortDirection === 'desc' ? -1 : 1
    return [...tasks].sort((a, b) => {
      return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * direction
    })
  }, [tasks, sortDirection])

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-6 pb-16 pt-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">{t('scheduledTask.title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('scheduledTask.description')}</p>
          </div>
          <Button size="sm" className="shrink-0" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            {t('scheduledTask.actions.create')}
          </Button>
        </div>

        <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{t('scheduledTask.notice')}</p>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4 border-b border-border">
          <div className="flex items-center gap-6">
            {TABS.map(tab => {
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={cn(
                    'relative py-2 text-sm transition-colors',
                    active
                      ? 'font-medium text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {t(tab.labelKey)}
                  {active && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />}
                </button>
              )
            })}
          </div>
          {activeTab === 'runs' ? (
            <div className="flex items-center gap-3">
              <div
                role="group"
                aria-label={t('scheduledTask.runs.granularityAria')}
                className="flex items-center rounded-lg bg-muted p-0.5"
              >
                {RUN_GRANULARITY_OPTIONS.map(option => {
                  const active = runView.granularity === option.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setRunView({ ...runView, granularity: option.id })}
                      className={cn(
                        'h-6 rounded-md px-3 text-[13px] transition-colors',
                        active
                          ? 'bg-background font-medium text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {t(option.labelKey)}
                    </button>
                  )
                })}
              </div>

              <Select
                value={runView.taskId}
                onValueChange={taskId => setRunView({ ...runView, taskId })}
              >
                <SelectTrigger className={CONTROL_CLASS}>
                  <SelectValue placeholder={t('scheduledTask.runs.allTasks')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={RUN_TASK_ALL}>{t('scheduledTask.runs.allTasks')}</SelectItem>
                  {tasks.map(task => (
                    <SelectItem key={task.id} value={task.id}>
                      {task.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={runView.status}
                onValueChange={id => setRunView({ ...runView, status: id as RunStatusFilter })}
              >
                <SelectTrigger className={CONTROL_CLASS}>
                  <SelectValue placeholder={t('scheduledTask.runs.allStatuses')} />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map(id => (
                    <SelectItem key={id} value={id}>
                      {id === 'all'
                        ? t('scheduledTask.runs.allStatuses')
                        : t(RUN_STATUS_LABEL_KEYS[id as ScheduledTaskRunStatus])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="ghost"
                size="icon"
                aria-label={t('scheduledTask.runs.refreshAria')}
                title={t('scheduledTask.runs.refreshAria')}
                className="h-7 w-7 text-muted-foreground"
                disabled={runRecords.loading}
                onClick={() => void runRecords.refresh()}
              >
                <RefreshCw className={cn('h-4 w-4', runRecords.loading && 'animate-spin')} />
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setSortDirection(prev => (prev === 'desc' ? 'asc' : 'desc'))}
            >
              {sortDirection === 'desc' ? (
                <ArrowDown className="h-4 w-4" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
              {t('scheduledTask.actions.sortByCreatedAt')}
            </Button>
          )}
        </div>

        <div className="mt-6">
          {activeTab === 'runs' ? (
            <RunRecords
              view={runView}
              controller={runRecords}
              onResetFilters={() => setRunView(DEFAULT_RUN_RECORDS_VIEW)}
            />
          ) : loading && tasks.length === 0 ? (
            <div className="grid gap-6" style={TASK_GRID_STYLE}>
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-44 rounded-lg" />
              ))}
            </div>
          ) : error && tasks.length === 0 ? (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyTitle>{t('scheduledTask.empty.loadFailedTitle')}</EmptyTitle>
                <EmptyDescription>{error}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" onClick={() => void refresh(true)} disabled={loading}>
                  <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                  {t('common:action.retry')}
                </Button>
              </EmptyContent>
            </Empty>
          ) : tasks.length === 0 ? (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CalendarClock className="h-6 w-6" />
                </EmptyMedia>
                <EmptyTitle>{t('scheduledTask.empty.title')}</EmptyTitle>
                <EmptyDescription>{t('scheduledTask.empty.description')}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" />
                  {t('scheduledTask.actions.create')}
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="grid gap-6" style={TASK_GRID_STYLE}>
              {sortedTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  pending={!!pendingTaskIds[task.id]}
                  onToggle={(item, enabled) => void handleToggle(item, enabled)}
                  onRun={item => void handleRun(item)}
                  onDelete={setDeleteTarget}
                  onEdit={setEditTarget}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <CreateTaskDialog
        key={createOpen ? 'open' : 'closed'}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          void refresh(true)
        }}
      />

      {editTarget && (
        <EditTaskDialog
          task={editTarget}
          open
          onOpenChange={open => {
            if (!open) setEditTarget(null)
          }}
          onUpdated={() => {
            void refresh(true)
          }}
        />
      )}

      <DeleteScheduledTaskDialog task={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </div>
  )
}

export default ScheduledTaskPage
