'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Bug,
  CalendarClock,
  CalendarDays,
  Loader2,
  MessageSquare,
  Newspaper,
  Pencil,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
  Timer,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'

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
  type ScheduledTaskTemplate,
  type UpdateScheduledTaskRequest,
} from '@/services/scheduled-task-service'
import { ScheduleEditor } from './schedule-editor'
import {
  buildSchedulePayload,
  createScheduleDraft,
  DEFAULT_TASK_TIMEZONE,
  draftFromSchedule,
  formatSchedule,
  templateFormSeed,
  TIMEZONE_OPTIONS,
  timezoneForTask,
  validateScheduleDraft,
  type ScheduleDraft,
} from './utils'

interface CreateTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
  /** 从模板创建时传入：预填名称、内容、时区、工作目录与调度规则。 */
  template?: ScheduledTaskTemplate | null
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
  /** 工作目录（相对 agent 工作区）：从模板带入时透传后端，表单不单独暴露输入。 */
  workspaceFolder: string | null
  enabled: boolean
}

/** 新建任务的初始表单：计划时间默认「每天 + 任务时区下的下一个整点」；传入模板时按模板预填。 */
function initialForm(template?: ScheduledTaskTemplate | null): TaskFormState {
  const base: TaskFormState = {
    name: '',
    agentId: '',
    schedule: createScheduleDraft(),
    timezone: DEFAULT_TASK_TIMEZONE,
    content: '',
    workspaceFolder: null,
    enabled: true,
  }
  if (!template) return base
  return { ...base, ...templateFormSeed(template) }
}

function formFromTask(task: ScheduledTask): TaskFormState {
  const schedule = draftFromSchedule(task)
  return {
    name: task.name,
    agentId: task.agent_id,
    schedule,
    timezone: timezoneForTask(task),
    content: task.content,
    workspaceFolder: task.workspace_folder ?? null,
    enabled: task.enabled,
  }
}

interface TaskFormDialogProps {
  mode: 'create' | 'edit'
  task: ScheduledTask | null
  template?: ScheduledTaskTemplate | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

function TaskFormDialog({
  mode,
  task,
  template,
  open,
  onOpenChange,
  onSuccess,
}: TaskFormDialogProps) {
  const { t } = useTranslation('tool-panel')
  const { toast } = useToast()
  const [form, setForm] = useState<TaskFormState>(() =>
    task ? formFromTask(task) : initialForm(template)
  )
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
          workspace_folder: form.workspaceFolder,
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
      <DialogContent
        className="max-h-[90vh] overflow-y-auto scrollbar-thin sm:max-w-xl"
        preventOutsideClose
      >
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
              className="max-h-60 min-h-24 scrollbar-thin"
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
      template={props.template ?? null}
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

/** 模板图标：按 key 映射；未命中的新模板回落到通用日历图标，保证不会缺图标。 */
const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  unattended_ops_inspection: Server,
  daily_ai_news: Newspaper,
  daily_repo_digest: Bug,
  weekly_work_report: CalendarDays,
  weekly_dependency_check: ShieldCheck,
  interview_prep_reminder: MessageSquare,
  meeting_prep_reminder: TrendingUp,
  focus_break_reminder: Timer,
}

interface TemplatePickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 选中某个模板：由调用方关闭本弹窗并打开预填好的新建表单。 */
  onSelect: (template: ScheduledTaskTemplate) => void
}

/**
 * 定时任务模板选择弹窗：预览内置模板（名称、描述、计划时间），
 * 点击后交给上层预填「新建定时任务」表单，不直接创建，避免误建。
 */
export function TemplatePickerDialog({ open, onOpenChange, onSelect }: TemplatePickerDialogProps) {
  const { t } = useTranslation('tool-panel')
  const [templates, setTemplates] = useState<ScheduledTaskTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const data = await scheduledTaskService.listTemplates()
      setTemplates(data)
    } catch (error) {
      console.error('Failed to load scheduled task templates:', error)
      setTemplates([])
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void loadTemplates()
  }, [open, loadTemplates])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto scrollbar-thin sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('scheduledTask.template.pickerTitle')}</DialogTitle>
          <DialogDescription>{t('scheduledTask.template.pickerDescription')}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('scheduledTask.template.loading')}
          </div>
        ) : loadError ? (
          <div className="flex h-40 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <p>{t('scheduledTask.template.loadFailed')}</p>
            <Button variant="outline" size="sm" onClick={() => void loadTemplates()}>
              <RefreshCw className="h-4 w-4" />
              {t('common:action.retry')}
            </Button>
          </div>
        ) : templates.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            {t('scheduledTask.template.empty')}
          </div>
        ) : (
          <div className="grid gap-3 py-1 sm:grid-cols-2">
            {templates.map(template => {
              const Icon = TEMPLATE_ICONS[template.key] ?? CalendarClock
              return (
                <button
                  key={template.key}
                  type="button"
                  aria-label={t('scheduledTask.template.useAria', { name: template.name })}
                  onClick={() => onSelect(template)}
                  className="flex h-full gap-3 rounded-lg border border-border bg-card p-3.5 text-left transition-all hover:border-primary/40 hover:shadow-sm"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">
                      {template.name}
                    </span>
                    <span className="mt-0.5 line-clamp-2 min-h-10 text-xs leading-relaxed text-muted-foreground mb-1">
                      {template.description}
                    </span>
                    <span className="mt-auto inline-block self-start rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {formatSchedule(template)}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
