'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  type UpdateScheduledTaskRequest,
} from '@/services/scheduled-task-service'
import { ScheduleEditor } from './schedule-editor'
import {
  buildSchedulePayload,
  createScheduleDraft,
  DEFAULT_TASK_TIMEZONE,
  draftFromSchedule,
  TIMEZONE_OPTIONS,
  timezoneForTask,
  validateScheduleDraft,
  type ScheduleDraft,
} from './utils'

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
  /** 结构化的计划时间草稿，提交时再转换成后端需要的 cron / interval 字段。 */
  schedule: ScheduleDraft
  /** 任务时区：新建时用默认值，编辑时保留任务原值（与调度模式无关）。 */
  timezone: string
  content: string
  enabled: boolean
}

/** 新建任务的初始表单：计划时间默认「每天 + 任务时区下的下一个整点」。 */
function initialForm(): TaskFormState {
  return {
    name: '',
    agentId: '',
    schedule: createScheduleDraft(),
    timezone: DEFAULT_TASK_TIMEZONE,
    content: '',
    enabled: true,
  }
}

function formFromTask(task: ScheduledTask): TaskFormState {
  const schedule = draftFromSchedule(task)
  return {
    name: task.name,
    agentId: task.agent_id,
    schedule,
    timezone: timezoneForTask(task),
    content: task.content,
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
  const { t } = useTranslation('tool-panel')
  const { toast } = useToast()
  const [form, setForm] = useState<TaskFormState>(() => (task ? formFromTask(task) : initialForm()))
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
            title: t('common:status.error'),
            description: t('scheduledTask.form.loadAgentsFailed'),
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
  }, [open, task, t, toast])

  // 计划时间单独校验：既参与整体校验，也用于在编辑器内联展示错误。
  // t 作为依赖传入，切换语言时错误提示会跟着重算。
  const scheduleError = useMemo(() => validateScheduleDraft(form.schedule, t), [form.schedule, t])

  const validationError = useMemo(() => {
    if (!form.name.trim()) return t('scheduledTask.form.nameRequired')
    if (!form.agentId) return t('scheduledTask.form.agentRequired')
    if (scheduleError) return scheduleError
    if (!form.content.trim()) return t('scheduledTask.form.contentRequired')
    return null
  }, [form.name, form.agentId, form.content, scheduleError, t])

  const handleSubmit = async () => {
    if (validationError) {
      toast({
        title: t('scheduledTask.form.validationTitle'),
        description: validationError,
      })
      return
    }

    const schedule = buildSchedulePayload(form.schedule)
    if (!schedule) {
      // validationError 已在前面拦截，这里只是兜底，避免发出字段不完整的请求。
      toast({
        title: t('scheduledTask.form.validationTitle'),
        description: t('scheduledTask.schedule.invalidSchedule'),
      })
      return
    }

    setSubmitting(true)
    try {
      if (mode === 'create') {
        const payload: CreateScheduledTaskRequest = {
          name: form.name.trim(),
          schedule_type: schedule.schedule_type,
          timezone: form.timezone,
          content: form.content.trim(),
          agent_id: form.agentId,
          enabled: form.enabled,
          cron_expr: schedule.cron_expr,
          interval_seconds: schedule.interval_seconds,
        }
        await scheduledTaskService.createTask(payload)
      } else if (task) {
        const payload: UpdateScheduledTaskRequest = {
          name: form.name.trim(),
          schedule_type: schedule.schedule_type,
          timezone: form.timezone,
          content: form.content.trim(),
          // 未使用的一侧显式置 null，避免后端 PATCH 合并残留脏数据
          cron_expr: schedule.cron_expr,
          interval_seconds: schedule.interval_seconds,
        }
        await scheduledTaskService.updateTask(task.id, payload)
      }
      toast({
        title: t('common:status.success'),
        description:
          mode === 'create'
            ? t('scheduledTask.toast.createSuccess')
            : t('scheduledTask.toast.updateSuccess'),
      })
      onOpenChange(false)
      onSuccess()
    } catch (error) {
      console.error(
        mode === 'create' ? 'Failed to create scheduled task:' : 'Failed to update scheduled task:',
        error
      )
      toast({
        title: t('common:status.error'),
        description:
          mode === 'create'
            ? t('scheduledTask.toast.createFailed')
            : t('scheduledTask.toast.updateFailed'),
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const updateField = <K extends keyof TaskFormState>(key: K, value: TaskFormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const updateSchedule = (patch: Partial<ScheduleDraft>) => {
    setForm(prev => ({ ...prev, schedule: { ...prev.schedule, ...patch } }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create'
              ? t('scheduledTask.form.createTitle')
              : t('scheduledTask.form.editTitle')}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? t('scheduledTask.form.createDescription')
              : t('scheduledTask.form.editDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="task-name">{t('scheduledTask.form.nameLabel')}</Label>
            <Input
              id="task-name"
              value={form.name}
              onChange={event => updateField('name', event.target.value)}
              placeholder={t('scheduledTask.form.namePlaceholder')}
              maxLength={255}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="task-agent">{t('scheduledTask.form.agentLabel')}</Label>
            <Select
              value={form.agentId || undefined}
              onValueChange={value => updateField('agentId', value)}
              disabled={loadingAgents || mode === 'edit'}
            >
              <SelectTrigger id="task-agent" className="w-full">
                <SelectValue
                  placeholder={
                    mode === 'edit'
                      ? t('scheduledTask.form.agentLockedPlaceholder')
                      : loadingAgents
                        ? t('scheduledTask.form.agentLoadingPlaceholder')
                        : t('scheduledTask.form.agentPlaceholder')
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {agents.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    {t('scheduledTask.form.agentEmpty')}
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

          <ScheduleEditor draft={form.schedule} error={scheduleError} onChange={updateSchedule} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="task-timezone">{t('scheduledTask.form.timezoneLabel')}</Label>
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
            <Label htmlFor="task-content">{t('scheduledTask.form.contentLabel')}</Label>
            <Textarea
              id="task-content"
              value={form.content}
              onChange={event => updateField('content', event.target.value)}
              placeholder={t('scheduledTask.form.contentPlaceholder')}
              className="min-h-24"
            />
          </div>

          {mode === 'create' ? (
            <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
              <div>
                <div className="text-sm font-medium">{t('scheduledTask.form.enableNow')}</div>
                <div className="text-xs text-muted-foreground">
                  {t('scheduledTask.form.enableNowHint')}
                </div>
              </div>
              <Switch
                checked={form.enabled}
                onCheckedChange={checked => updateField('enabled', checked)}
              />
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2.5 text-sm">
              <span className="text-muted-foreground">{t('scheduledTask.form.currentStatus')}</span>
              <span className="font-medium">
                {form.enabled ? t('scheduledTask.form.enabled') : t('scheduledTask.form.disabled')}
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('common:action.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || loadingAgents}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {mode === 'create'
                  ? t('scheduledTask.form.creating')
                  : t('scheduledTask.form.saving')}
              </>
            ) : (
              <>
                {mode === 'create' ? <Plus className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                {mode === 'create'
                  ? t('scheduledTask.form.createAction')
                  : t('scheduledTask.form.saveAction')}
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
