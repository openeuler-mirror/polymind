'use client'

import { useEffect, useMemo, useState } from 'react'
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
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { useScheduledTaskStore } from '@/lib/stores/scheduled-task-store'
import { scheduledTaskService, type ScheduledTask } from '@/services/scheduled-task-service'
import { cn } from '@/lib/utils'
import { CreateTaskDialog, EditTaskDialog } from './create-task-dialog'
import { DeleteScheduledTaskDialog } from './delete-task-dialog'
import { triggerScheduledTaskRun } from './execution'
import { RunRecords } from './run-records'
import { TaskCard } from './task-card'

type TabId = 'tasks' | 'runs'

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'tasks', label: '我的定时任务' },
  { id: 'runs', label: '执行记录' },
]

/** 任务卡片网格列：骨架屏与实际列表共用，避免内联样式重复。 */
const TASK_GRID_STYLE = { gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' } as const

export function ScheduledTaskPage() {
  const { toast } = useToast()
  const tasks = useScheduledTaskStore(s => s.tasks)
  const loading = useScheduledTaskStore(s => s.loading)
  const error = useScheduledTaskStore(s => s.error)
  const refresh = useScheduledTaskStore(s => s.refresh)
  const subscribe = useScheduledTaskStore(s => s.subscribe)
  const unsubscribe = useScheduledTaskStore(s => s.unsubscribe)
  const [activeTab, setActiveTab] = useState<TabId>('tasks')
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
        title: '错误',
        description: enabled ? '启用任务失败' : '停用任务失败',
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
            <h1 className="text-xl font-semibold text-foreground">定时任务</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              配置让 Polymind 按计划自动执行的任务，创建后由后端调度器统一运行。
            </p>
          </div>
          <Button size="sm" className="shrink-0" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            新建定时任务
          </Button>
        </div>

        <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            任务创建后由后端调度器按计划自动运行，可随时点击卡片编辑，或在卡片上启停、立即执行、删除；执行结果汇总在“执行记录”标签中。
          </p>
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
                    'relative pb-3 text-sm transition-colors',
                    active
                      ? 'font-medium text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                  {active && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />}
                </button>
              )
            })}
          </div>
          {activeTab === 'tasks' && (
            <Button
              variant="ghost"
              size="sm"
              className="mb-1 text-muted-foreground"
              onClick={() => setSortDirection(prev => (prev === 'desc' ? 'asc' : 'desc'))}
            >
              {sortDirection === 'desc' ? (
                <ArrowDown className="h-4 w-4" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
              按创建时间排序
            </Button>
          )}
        </div>

        <div className="mt-6">
          {activeTab === 'runs' ? (
            <RunRecords />
          ) : loading && tasks.length === 0 ? (
            <div className="grid gap-6" style={TASK_GRID_STYLE}>
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-44 rounded-lg" />
              ))}
            </div>
          ) : error && tasks.length === 0 ? (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyTitle>加载失败</EmptyTitle>
                <EmptyDescription>{error}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" onClick={() => void refresh(true)} disabled={loading}>
                  <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                  重试
                </Button>
              </EmptyContent>
            </Empty>
          ) : tasks.length === 0 ? (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CalendarClock className="h-6 w-6" />
                </EmptyMedia>
                <EmptyTitle>暂无定时任务</EmptyTitle>
                <EmptyDescription>
                  创建第一个定时任务，让 Polymind 按计划自动执行。
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" />
                  新建定时任务
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
