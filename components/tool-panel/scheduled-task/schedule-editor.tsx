'use client'

import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  describeScheduleDraft,
  INTERVAL_UNIT_OPTIONS,
  MONTH_DAY_OPTIONS,
  REPEAT_MODE_OPTIONS,
  toggleWeekday,
  WEEKDAY_OPTIONS,
  type IntervalUnit,
  type RepeatMode,
  type ScheduleDraft,
} from './utils'

/** 原生 date/time 控件的面板由浏览器绘制，深色主题下必须声明 color-scheme，否则出现白底黑字。 */
const NATIVE_PICKER_CLASS = '[color-scheme:light] dark:[color-scheme:dark]'

const MUTED_TEXT_CLASS = 'text-sm text-muted-foreground'

interface ScheduleEditorProps {
  draft: ScheduleDraft
  /** 由调用方统一校验后传入的错误提示，展示在控件下方。 */
  error?: string | null
  onChange: (patch: Partial<ScheduleDraft>) => void
}

/** 计划时间编辑器：结构化控件替代手写 cron，只有「自定义」模式要求用户直接填表达式。 */
export function ScheduleEditor({ draft, error, onChange }: ScheduleEditorProps) {
  const { t } = useTranslation('tool-panel')
  const preview = describeScheduleDraft(draft)

  const timePicker = (
    <Input
      type="time"
      aria-label={t('scheduledTask.schedule.timeAria')}
      value={draft.time}
      onChange={event => onChange({ time: event.target.value })}
      className={cn('w-[118px]', NATIVE_PICKER_CLASS)}
    />
  )

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="task-repeat-mode">{t('scheduledTask.schedule.repeatModeLabel')}</Label>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={draft.mode} onValueChange={value => onChange({ mode: value as RepeatMode })}>
          <SelectTrigger id="task-repeat-mode" className="w-[104px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REPEAT_MODE_OPTIONS.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {draft.mode === 'interval' && (
          <>
            <span className={MUTED_TEXT_CLASS}>{t('scheduledTask.schedule.every')}</span>
            <Input
              type="number"
              min={1}
              aria-label={t('scheduledTask.schedule.intervalValueAria')}
              value={draft.intervalValue}
              onChange={event => onChange({ intervalValue: event.target.value })}
              className="w-[92px]"
            />
            <Select
              value={draft.intervalUnit}
              onValueChange={value => onChange({ intervalUnit: value as IntervalUnit })}
            >
              <SelectTrigger
                aria-label={t('scheduledTask.schedule.intervalUnitAria')}
                className="w-[92px]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTERVAL_UNIT_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className={MUTED_TEXT_CLASS}>{t('scheduledTask.schedule.runOnce')}</span>
          </>
        )}
        {draft.mode === 'hourly' && (
          <>
            <span className={MUTED_TEXT_CLASS}>{t('scheduledTask.schedule.minutePrefix')}</span>
            <Input
              type="number"
              min={0}
              max={59}
              aria-label={t('scheduledTask.schedule.minuteAria')}
              value={draft.minute}
              onChange={event => onChange({ minute: event.target.value })}
              className="w-[88px]"
            />
            <span className={MUTED_TEXT_CLASS}>{t('scheduledTask.schedule.minuteSuffix')}</span>
          </>
        )}
        {(draft.mode === 'daily' || draft.mode === 'weekly') && timePicker}

        {draft.mode === 'monthly' && (
          <>
            <Select value={draft.monthDay} onValueChange={value => onChange({ monthDay: value })}>
              <SelectTrigger
                aria-label={t('scheduledTask.schedule.monthDayAria')}
                className="w-[132px]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {MONTH_DAY_OPTIONS.map(day => (
                  <SelectItem key={day} value={String(day)}>
                    {t('scheduledTask.schedule.monthDayOption', { day })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {timePicker}
          </>
        )}
        {draft.mode === 'custom' && (
          <Input
            aria-label={t('scheduledTask.schedule.cronAria')}
            value={draft.cronExpr}
            onChange={event => onChange({ cronExpr: event.target.value })}
            placeholder={t('scheduledTask.schedule.cronPlaceholder')}
            maxLength={255}
            className="min-w-[180px] flex-1 font-mono"
          />
        )}
      </div>

      {draft.mode === 'weekly' && (
        <div className="flex items-center gap-1.5">
          {WEEKDAY_OPTIONS.map(option => {
            const selected = draft.weekdays.includes(option.value)
            return (
              <button
                key={option.value}
                type="button"
                aria-label={t(option.fullKey)}
                aria-pressed={selected}
                onClick={() => onChange({ weekdays: toggleWeekday(draft.weekdays, option.value) })}
                className={cn(
                  'size-8 rounded-full border text-xs font-medium transition-colors',
                  'focus-visible:border-ring focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]',
                  selected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                {t(option.labelKey)}
              </button>
            )
          })}
        </div>
      )}
      {draft.mode === 'custom' && (
        <p className="text-xs text-muted-foreground">{t('scheduledTask.schedule.cronHint')}</p>
      )}
      {preview && (
        <p className="text-xs text-muted-foreground">
          {t('scheduledTask.schedule.preview', { preview })}
        </p>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
