'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Loader2, Save } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
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
import {
  channelService,
  type AccessPolicyEntry,
  type ChannelAccessPolicy,
  type ConversationType,
  type UpdateChannelAccessPolicyRequest,
} from '@/services/channel-service'
import { channelErrorMessage, formatAllowlist, isSameAllowlist, parseAllowlist } from './utils'

interface PolicyFormState {
  mode: string
  allowlistText: string
  allowCommands: boolean
}

interface PolicyCardProps {
  title: string
  hint?: string
  state: PolicyFormState
  disabled: boolean
  onChange: (next: PolicyFormState) => void
}

/** 单个会话类型的准入配置卡片（私聊 / 群聊）。 */
function PolicyCard({ title, hint, state, disabled, onChange }: PolicyCardProps) {
  const { t } = useTranslation('channel')
  const allowlist = parseAllowlist(state.allowlistText)

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <Select
          value={state.mode}
          disabled={disabled}
          onValueChange={mode => onChange({ ...state, mode })}
        >
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">{t('policy.modeOpen')}</SelectItem>
            <SelectItem value="allowlist">{t('policy.modeAllowlist')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {state.mode === 'allowlist' ? (
        <div className="space-y-2">
          <Label htmlFor={`allowlist-${title}`}>{t('policy.allowlist')}</Label>
          <Textarea
            id={`allowlist-${title}`}
            rows={4}
            disabled={disabled}
            value={state.allowlistText}
            placeholder={t('policy.allowlistPlaceholder')}
            onChange={event => onChange({ ...state, allowlistText: event.target.value })}
          />
          {allowlist.length === 0 ? (
            <p className="flex items-center gap-1.5 text-xs text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {t('policy.allowlistEmpty')}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t('policy.allowlistCount', { count: allowlist.length })}
            </p>
          )}
        </div>
      ) : (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{t('policy.openWarning')}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between gap-3">
        <div>
          <Label htmlFor={`allow-commands-${title}`}>{t('policy.allowCommands')}</Label>
          <p className="text-xs text-muted-foreground">{t('policy.allowCommandsHint')}</p>
        </div>
        <Switch
          id={`allow-commands-${title}`}
          checked={state.allowCommands}
          disabled={disabled}
          onCheckedChange={allowCommands => onChange({ ...state, allowCommands })}
        />
      </div>
    </div>
  )
}

const toFormState = (entry: AccessPolicyEntry): PolicyFormState => ({
  mode: entry.mode,
  allowlistText: formatAllowlist(entry.allowlist),
  allowCommands: entry.allow_commands,
})

interface AccessPolicyPanelProps {
  instanceId: string
}

/**
 * 准入策略编辑：私聊与群聊两组，按会话类型做**部分更新**。
 *
 * 准入是数据库中的业务数据，服务端每次判定都从库读取，因此**写入后立即生效**，
 * 不需要重启；前端也不做任何进程内快照。
 */
export function AccessPolicyPanel({ instanceId }: AccessPolicyPanelProps) {
  const { t } = useTranslation('channel')
  const { toast } = useToast()
  const [policy, setPolicy] = useState<ChannelAccessPolicy | null>(null)
  const [direct, setDirect] = useState<PolicyFormState>({
    mode: 'open',
    allowlistText: '',
    allowCommands: true,
  })
  const [group, setGroup] = useState<PolicyFormState>({
    mode: 'open',
    allowlistText: '',
    allowCommands: true,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  // 重试按钮通过递增令牌触发重新加载（effect 内部定义加载器，便于取消与依赖追踪）
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const data = await channelService.getAccessPolicy(instanceId)
        if (cancelled) return
        setPolicy(data)
        setDirect(toFormState(data.direct))
        setGroup(toFormState(data.group))
        setLoadError(null)
      } catch (error) {
        console.error('Failed to load channel access policy:', error)
        if (cancelled) return
        setLoadError(channelErrorMessage(t, error, t('policy.loadFailed')))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [instanceId, reloadToken, t])

  const changed = useMemo(() => {
    if (!policy) return { direct: false, group: false }
    return {
      direct:
        policy.direct.mode !== direct.mode ||
        policy.direct.allow_commands !== direct.allowCommands ||
        !isSameAllowlist(policy.direct.allowlist, parseAllowlist(direct.allowlistText)),
      group:
        policy.group.mode !== group.mode ||
        policy.group.allow_commands !== group.allowCommands ||
        !isSameAllowlist(policy.group.allowlist, parseAllowlist(group.allowlistText)),
    }
  }, [policy, direct, group])

  const dirty = changed.direct || changed.group

  const handleSave = async () => {
    // 只提交被改动的会话类型：后端按 model_fields_set 做部分更新。
    const request: UpdateChannelAccessPolicyRequest = {}
    if (changed.direct) {
      request.direct = {
        mode: direct.mode,
        allowlist: parseAllowlist(direct.allowlistText),
        allow_commands: direct.allowCommands,
      }
    }
    if (changed.group) {
      request.group = {
        mode: group.mode,
        allowlist: parseAllowlist(group.allowlistText),
        allow_commands: group.allowCommands,
      }
    }
    if (!request.direct && !request.group) return
    setSaving(true)
    try {
      const data = await channelService.updateAccessPolicy(instanceId, request)
      setPolicy(data)
      setDirect(toFormState(data.direct))
      setGroup(toFormState(data.group))
      toast({ title: t('policy.saved') })
    } catch (error) {
      console.error('Failed to update channel access policy:', error)
      toast({
        title: t('policy.saveFailed'),
        description: channelErrorMessage(t, error, t('common:status.error')),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const conversationLabels: Record<ConversationType, string> = {
    direct: t('policy.conversation.direct'),
    group: t('policy.conversation.group'),
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('common:action.loading')}
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="space-y-3">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" onClick={() => setReloadToken(token => token + 1)}>
          {t('common:action.retry')}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">{t('policy.description')}</p>
        <p className="mt-1 text-xs font-medium text-emerald-700">{t('policy.immediate')}</p>
      </div>

      <PolicyCard
        title={conversationLabels.direct}
        state={direct}
        disabled={saving}
        onChange={setDirect}
      />
      <PolicyCard
        title={conversationLabels.group}
        hint={t('policy.groupHint')}
        state={group}
        disabled={saving}
        onChange={setGroup}
      />

      <div className="flex justify-end">
        <Button onClick={() => void handleSave()} disabled={saving || !dirty}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? t('policy.saving') : t('policy.save')}
        </Button>
      </div>
    </div>
  )
}
