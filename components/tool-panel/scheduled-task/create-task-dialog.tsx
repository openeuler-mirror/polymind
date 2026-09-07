'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Pencil, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { agentService } from '@/services/agent-service'
import {
  scheduledTaskService,
  type CreateScheduledTaskRequest,
  type ScheduledTask,
  type ScheduleType,
  type UpdateScheduledTaskRequest,
} from '@/services/scheduled-task-service'
import { cn } from '@/lib/utils'
import { formatCron, TIMEZONE_OPTIONS } from './utils'

interface CreateTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

interface EditTaskDialogProps {
  task: ScheduledTask
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated: () => void
}

interface TaskFormState {
  name: string
  agentId: string
  scheduleType: ScheduleType
  cronExpr: string
  intervalSeconds: string
  timezone: string
  content: string
  workspaceFolder: string
  enabled: boolean
}

const initialForm: TaskFormState = {
  name: '',
  agentId: '',
  scheduleType: 'cron',
  cronExpr: '',
  intervalSeconds: '3600',
  timezone: 'Asia/Shanghai',
  content: '',
  workspaceFolder: '',
  enabled: true,
}

function formFromTask(task: ScheduledTask): TaskFormState {
  return {
    name: task.name,
    agentId: task.agent_id,
    scheduleType: task.schedule_type,
    cronExpr: task.cron_expr ?? '',
    intervalSeconds: String(task.interval_seconds ?? 3600),
    timezone: task.timezone,
    content: task.content,
    workspaceFolder: task.workspace_folder ?? '',
    enabled: task.enabled,
  }
}

interface TaskFormDialogProps {
  mode: 'create' | 'edit'
  task: ScheduledTask | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

function TaskFormDialog({ mode, task, open, onOpenChange, onSuccess }: TaskFormDialogProps) {
  const { toast } = useToast()
  const [form, setForm] = useState<TaskFormState>(() => (task ? formFromTask(task) : initialForm))
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([])
  const [loadingAgents, setLoadingAgents] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const loadAgents = async () => {
      try {
        const data = await agentService.getAgents()
        if (!cancelled) {
          // 仅允许选择未删除的智能体，避免给已删除智能体创建任务。
          setAgents(data.filter(agent => agent.status !== 'deleted'))
        }
      } catch (error) {
        console.error('Failed to load agents for scheduled task creation:', error)
        if (!cancelled) {
          setAgents([])
          toast({
            title: '错误',
            description: '加载智能体列表失败',
            variant: 'destructive',
          })
        }
      } finally {
        if (!cancelled) {
          setLoadingAgents(false)
        }
      }
    }
    void loadAgents()
    return () => {
      cancelled = true
    }
  }, [open, task, toast])

  const validationError = useMemo(() => {
    if (!form.name.trim()) return '请输入任务名称'
    if (!form.agentId) return '请选择执行智能体'
    if (form.scheduleType === 'cron') {
      const cronExpr = form.cronExpr.trim()
      if (!cronExpr) return '请填写 Cron 表达式'
      if (formatCron(cronExpr) === null) return 'Cron 表达式无效，请参考示例（如 0 9 * * *）'
    }
    if (form.scheduleType === 'interval') {
      const seconds = Number(form.intervalSeconds)
      if (!Number.isInteger(seconds) || seconds <= 0) {
        return '间隔秒数必须是大于 0 的整数'
      }
    }
    if (!form.content.trim()) return '请输入任务内容'
    return null
  }, [form])

  const handleSubmit = async () => {
    if (validationError) {
      toast({
        title: '提示',
        description: validationError,
      })
      return
    }

    setSubmitting(true)
    try {
      if (mode === 'create') {
        const payload: CreateScheduledTaskRequest = {
          name: form.name.trim(),
          schedule_type: form.scheduleType,
          timezone: form.timezone,
          content: form.content.trim(),
          agent_id: form.agentId,
          workspace_folder: form.workspaceFolder.trim() || null,
          enabled: form.enabled,
        }
        if (form.scheduleType === 'cron') {
          payload.cron_expr = form.cronExpr.trim()
        } else {
          payload.interval_seconds = Number(form.intervalSeconds)
        }
        await scheduledTaskService.createTask(payload)
      } else if (task) {
        const payload: UpdateScheduledTaskRequest = {
          name: form.name.trim(),
          schedule_type: form.scheduleType,
          timezone: form.timezone,
          content: form.content.trim(),
          workspace_folder: form.workspaceFolder.trim() || null,
        }
        if (form.scheduleType === 'cron') {
          payload.cron_expr = form.cronExpr.trim()
          // 切换调度类型时显式清空另一字段，避免后端 PATCH 合并残留脏数据
          payload.interval_seconds = null
        } else {
          payload.cron_expr = null
          payload.interval_seconds = Number(form.intervalSeconds)
        }
        await scheduledTaskService.updateTask(task.id, payload)
      }
      toast({
        title: '成功',
        description: mode === 'create' ? '定时任务已创建' : '定时任务已更新',
      })
      onOpenChange(false)
      onSuccess()
    } catch (error) {
      console.error(
        mode === 'create' ? 'Failed to create scheduled task:' : 'Failed to update scheduled task:',
        error
      )
      toast({
        title: '错误',
        description: mode === 'create' ? '创建定时任务失败' : '更新定时任务失败',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const updateField = <K extends keyof TaskFormState>(key: K, value: TaskFormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '新建定时任务' : '编辑定时任务'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? '配置任务名称、执行智能体与调度规则，创建后将由后端调度器按计划自动运行。'
              : '修改任务名称、调度规则与内容，保存后由后端调度器按新计划运行。'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="task-name">任务名称</Label>
            <Input
              id="task-name"
              value={form.name}
              onChange={event => updateField('name', event.target.value)}
              placeholder="例如：每日竞品动态追踪"
              maxLength={255}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="task-agent">执行智能体</Label>
            <Select
              value={form.agentId || undefined}
              onValueChange={value => updateField('agentId', value)}
              disabled={loadingAgents || mode === 'edit'}
            >
              <SelectTrigger id="task-agent" className="w-full">
                <SelectValue
                  placeholder={
                    mode === 'edit'
                      ? '任务创建后不可更换执行智能体'
                      : loadingAgents
                        ? '正在加载智能体...'
                        : '选择执行智能体'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {agents.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    暂无可用智能体，请先创建智能体
                  </div>
                )}
                {agents.map(agent => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label>调度类型</Label>
            <div className="flex rounded-md border bg-muted/30 p-0.5">
              {(
                [
                  { value: 'cron', label: 'Cron 表达式' },
                  { value: 'interval', label: '间隔执行' },
                ] as const
              ).map(option => (
                <Button
                  key={option.value}
                  type="button"
                  variant="ghost"
                  className={cn(
                    'h-8 flex-1 text-sm',
                    form.scheduleType === option.value
                      ? 'bg-background font-medium shadow-sm'
                      : 'text-muted-foreground'
                  )}
                  onClick={() => updateField('scheduleType', option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {form.scheduleType === 'cron' ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-cron">Cron 表达式</Label>
              <Input
                id="task-cron"
                value={form.cronExpr}
                onChange={event => updateField('cronExpr', event.target.value)}
                placeholder="例如：0 9 * * *（每天 09:00）"
                maxLength={255}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-interval">间隔秒数</Label>
              <Input
                id="task-interval"
                type="number"
                min={1}
                value={form.intervalSeconds}
                onChange={event => updateField('intervalSeconds', event.target.value)}
                placeholder="例如：3600（每小时）"
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="task-timezone">时区</Label>
            <Select value={form.timezone} onValueChange={value => updateField('timezone', value)}>
              <SelectTrigger id="task-timezone" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONE_OPTIONS.map(timezone => (
                  <SelectItem key={timezone} value={timezone}>
                    {timezone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="task-content">任务内容</Label>
            <Textarea
              id="task-content"
              value={form.content}
              onChange={event => updateField('content', event.target.value)}
              placeholder="描述到期时需要 Polymind 自动执行的具体任务..."
              className="min-h-24"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="task-workspace">工作目录（可选）</Label>
            <Input
              id="task-workspace"
              value={form.workspaceFolder}
              onChange={event => updateField('workspaceFolder', event.target.value)}
              placeholder="例如：code/competitor-tracking"
              maxLength={512}
            />
          </div>

          {mode === 'create' ? (
            <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
              <div>
                <div className="text-sm font-medium">创建后立即启用</div>
                <div className="text-xs text-muted-foreground">
                  关闭后任务暂停调度，可随时在卡片上重新开启
                </div>
              </div>
              <Switch
                checked={form.enabled}
                onCheckedChange={checked => updateField('enabled', checked)}
              />
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2.5 text-sm">
              <span className="text-muted-foreground">当前状态</span>
              <span className="font-medium">{form.enabled ? '已启用' : '已停用'}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || loadingAgents}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {mode === 'create' ? '创建中...' : '保存中...'}
              </>
            ) : (
              <>
                {mode === 'create' ? <Plus className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                {mode === 'create' ? '创建任务' : '保存修改'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CreateTaskDialog(props: CreateTaskDialogProps) {
  return (
    <TaskFormDialog
      mode="create"
      task={null}
      open={props.open}
      onOpenChange={props.onOpenChange}
      onSuccess={props.onCreated}
    />
  )
}

export function EditTaskDialog({ task, open, onOpenChange, onUpdated }: EditTaskDialogProps) {
  return (
    <TaskFormDialog
      mode="edit"
      task={task}
      open={open}
      onOpenChange={onOpenChange}
      onSuccess={onUpdated}
    />
  )
}
