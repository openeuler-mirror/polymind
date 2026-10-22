'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Loader2,
  QrCode,
  RefreshCw,
  Settings2,
  XCircle,
} from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { useChatStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { agentService } from '@/services/agent-service'
import {
  channelService,
  isTerminalProvisionStatus,
  provisionPollDelayMs,
  type ChannelCatalogItem,
  type ChannelCredentialField,
  type ChannelInstance,
  type ProvisionAttempt,
} from '@/services/channel-service'
import {
  channelErrorMessage,
  channelManualGuide,
  channelPlatformNotice,
  channelPlatformUrl,
  formatChannelTime,
  formatCountdown,
  isAgentUnavailable,
  remainingMs,
} from './utils'

/** Radix Select 不允许空字符串值，用哨兵表示"暂不绑定"。 */
const NO_AGENT = '__none__'

interface ProvisionDialogProps {
  catalog: ChannelCatalogItem[]
  /**
   * 接入成功后通知列表刷新并回传新建实例（供调用方决定是否引导补绑）；
   * 无实例时为 null。
   */
  onConnected: (instance: ChannelInstance | null) => void
  /** 关闭对话框（组件由调用方按需挂载，关闭即卸载，因此无需重置状态）。 */
  onClose: () => void
}

/**
 * 接入对话框：选择渠道 → 扫码 / 手填凭据 → 成功后刷新列表。
 *
 * 三条来自设计的硬性约束：
 * 1. 渠道标识符与手填字段**全部来自 catalog**，不硬编码；
 * 2. 二维码内容 `qr_content` 是需编码的字符串，平台临时凭据不会下发到前端；
 * 3. 轮询按服务端给的 `poll_interval_ms`（服务端在该间隔内不重复问平台）。
 */
export function ProvisionDialog({ catalog, onConnected, onClose }: ProvisionDialogProps) {
  const { t } = useTranslation('channel')
  const { toast } = useToast()
  // 初始状态直接取 catalog 的第一项：组件每次打开都是全新挂载，不需要"重置"逻辑。
  const [channel, setChannel] = useState(() => catalog[0]?.channel ?? '')
  const [mode, setMode] = useState<'qr' | 'manual'>(() =>
    catalog[0] && !catalog[0].supports_provisioning ? 'manual' : 'qr'
  )
  const [attempt, setAttempt] = useState<ProvisionAttempt | null>(null)
  const [beginning, setBeginning] = useState(false)
  const [pollError, setPollError] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [manualValues, setManualValues] = useState<Record<string, string>>({})
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({})
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [ownerRef, setOwnerRef] = useState('')
  const [agentId, setAgentId] = useState<string>(NO_AGENT)
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([])
  const [agentLoadFailed, setAgentLoadFailed] = useState(false)
  // 递增令牌触发 agent 列表重试（effect 内定义加载器，便于取消与依赖追踪）
  const [agentReloadToken, setAgentReloadToken] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  // 扫码等待中关闭会丢掉本轮接入，因此先确认再取消。
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  // 「接入成功」只处理一次：effect 依赖里含有调用方回调，不能靠依赖去重。
  const handledAttemptRef = useRef<string | null>(null)

  const selected = useMemo(
    () => catalog.find(item => item.channel === channel) ?? null,
    [catalog, channel]
  )

  // agent 列表用于"可选绑定"；失败不阻塞接入流程本身，但要给用户重试入口。
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const data = await agentService.getAgents()
        if (cancelled) return
        const list = data
          .filter(agent => agent.status !== 'deleted')
          .map(agent => ({ id: agent.id, name: agent.name }))
        setAgents(list)
        setAgentLoadFailed(false)
        // 默认绑定当前 agent；否则唯一 agent；都不是则"暂不绑定"
        setAgentId(prev => {
          if (prev !== NO_AGENT) return prev
          const current = useChatStore.getState().currentAgentId
          if (current && list.some(agent => agent.id === current)) return current
          return list.length === 1 ? list[0].id : NO_AGENT
        })
      } catch (error) {
        console.error('Failed to load agents for channel provisioning:', error)
        if (cancelled) return
        setAgents([])
        setAgentLoadFailed(true)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [agentReloadToken])

  // 二维码倒计时：只影响展示，过期由服务端在轮询时判定。
  useEffect(() => {
    if (!attempt || isTerminalProvisionStatus(attempt.status)) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [attempt])

  // 轮询：按服务端给出的间隔查询，终态后停止。
  useEffect(() => {
    if (!attempt) return
    if (attempt.status !== 'waiting' || pollError) return
    const attemptId = attempt.attempt_id
    const timer = setTimeout(async () => {
      try {
        const next = await channelService.getProvisioning(attemptId)
        setAttempt(next)
      } catch (error) {
        console.error('Failed to poll channel provisioning:', error)
        setPollError(true)
        toast({
          title: t('provision.pollFailed'),
          description: channelErrorMessage(t, error, t('common:status.error')),
          variant: 'destructive',
        })
      }
    }, provisionPollDelayMs(attempt.poll_interval_ms))
    return () => clearTimeout(timer)
  }, [attempt, pollError, t, toast])

  // 接入成功：提示、刷新列表并关闭对话框。
  useEffect(() => {
    if (!attempt || attempt.status !== 'succeeded') return
    if (handledAttemptRef.current === attempt.attempt_id) return
    handledAttemptRef.current = attempt.attempt_id
    const instance = attempt.instance
    const name = instance?.display_name || (selected?.display_name ?? '')
    // Agent 不可用则无法对话：文案提示并由调用方打开绑定入口
    const unbound = !!instance && isAgentUnavailable(instance)
    toast({
      title: unbound ? t('provision.succeededUnboundTitle') : t('provision.succeededTitle'),
      description: unbound
        ? t('provision.succeededUnboundDescription', { name })
        : t('provision.succeededDescription', { name }),
    })
    onConnected(instance)
    onClose()
  }, [attempt, onClose, onConnected, selected, t, toast])

  const waiting = attempt?.status === 'waiting'
  const left = attempt ? remainingMs(attempt.expires_at, now) : 0
  const fields = selected?.credential_fields ?? []
  const requiredFields = fields.filter(field => field.required)
  const optionalFields = fields.filter(field => !field.required)
  // 官方入口与兼容性提示是纯展示元数据（渠道标识符仍只来自 catalog）
  const platformUrl = selected ? channelPlatformUrl(selected.channel) : null
  const platformNotice = selected ? channelPlatformNotice(t, selected.channel) : null
  const manualGuide = selected ? channelManualGuide(t, selected.channel) : null

  const requestClose = () => {
    if (waiting) {
      setConfirmCloseOpen(true)
      return
    }
    onClose()
  }

  const handleChannelChange = (value: string) => {
    setChannel(value)
    setAttempt(null)
    setPollError(false)
    // 凭据字段随渠道变化，切换后保留旧值容易误提交
    setManualValues({})
    setRevealedSecrets({})
    setShowAdvanced(false)
    const item = catalog.find(entry => entry.channel === value)
    if (item && !item.supports_provisioning) setMode('manual')
  }

  const handleBegin = async () => {
    if (!channel) return
    setBeginning(true)
    setPollError(false)
    try {
      const started = await channelService.beginProvisioning({
        channel,
        owner_ref: ownerRef.trim() || null,
        agent_id: agentId === NO_AGENT ? null : agentId,
      })
      setAttempt(started)
      setNow(Date.now())
    } catch (error) {
      console.error('Failed to begin channel provisioning:', error)
      toast({
        title: t('provision.beginFailed'),
        description: channelErrorMessage(t, error, t('common:status.error')),
        variant: 'destructive',
      })
    } finally {
      setBeginning(false)
    }
  }

  const handleCancel = async () => {
    if (!attempt) return
    try {
      const cancelled = await channelService.cancelProvisioning(attempt.attempt_id)
      setAttempt(cancelled)
      toast({ title: t('provision.cancelled') })
    } catch (error) {
      console.error('Failed to cancel channel provisioning:', error)
      toast({
        title: t('provision.cancelFailed'),
        description: channelErrorMessage(t, error, t('common:status.error')),
        variant: 'destructive',
      })
    }
  }

  /** 等待扫码时关闭：先取消服务端 attempt，成功后再关闭，避免留下悬挂任务。 */
  const handleConfirmClose = async () => {
    if (!attempt || attempt.status !== 'waiting') {
      setConfirmCloseOpen(false)
      onClose()
      return
    }
    setClosing(true)
    try {
      await channelService.cancelProvisioning(attempt.attempt_id)
      setConfirmCloseOpen(false)
      onClose()
    } catch (error) {
      console.error('Failed to cancel channel provisioning before closing:', error)
      toast({
        title: t('provision.cancelFailed'),
        description: channelErrorMessage(t, error, t('common:status.error')),
        variant: 'destructive',
      })
    } finally {
      setClosing(false)
    }
  }

  const handleCopyQr = async () => {
    if (!attempt?.qr_content) return
    try {
      await navigator.clipboard.writeText(attempt.qr_content)
      toast({ title: t('actions.copied') })
    } catch (error) {
      console.error('Failed to copy QR content:', error)
    }
  }

  const handleManualSubmit = async () => {
    if (!selected) return
    const credentials: Record<string, string> = {}
    for (const field of fields) {
      const value = (manualValues[field.name] ?? '').trim()
      if (field.required && !value) {
        toast({
          title: t('provision.fieldRequired', { label: field.label }),
          variant: 'destructive',
        })
        return
      }
      if (value) credentials[field.name] = value
    }
    setSubmitting(true)
    try {
      const instance = await channelService.createInstance({
        channel: selected.channel,
        credentials,
        display_name: displayName.trim() || null,
        owner_ref: ownerRef.trim() || null,
        agent_id: agentId === NO_AGENT ? null : agentId,
      })
      const name = instance.display_name || selected.display_name
      const unbound = isAgentUnavailable(instance)
      toast({
        title: unbound ? t('provision.succeededUnboundTitle') : t('provision.succeededTitle'),
        description: unbound
          ? t('provision.succeededUnboundDescription', { name })
          : t('provision.manualSucceeded', { name }),
      })
      onConnected(instance)
      onClose()
    } catch (error) {
      console.error('Failed to create channel instance manually:', error)
      toast({
        title: t('provision.manualFailed'),
        description: channelErrorMessage(t, error, t('common:status.error')),
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const renderCredentialField = (field: ChannelCredentialField) => {
    const revealed = !!revealedSecrets[field.name]
    return (
      <div key={field.name} className="space-y-2">
        <Label htmlFor={`credential-${field.name}`}>
          {field.label}
          {field.required ? <span className="ml-1 text-destructive">*</span> : null}
        </Label>
        <div className="relative">
          <Input
            id={`credential-${field.name}`}
            type={field.secret && !revealed ? 'password' : 'text'}
            autoComplete={field.secret ? 'new-password' : 'off'}
            className={field.secret ? 'pr-10' : undefined}
            value={manualValues[field.name] ?? ''}
            onChange={event =>
              setManualValues(prev => ({ ...prev, [field.name]: event.target.value }))
            }
          />
          {field.secret ? (
            <button
              type="button"
              aria-label={revealed ? t('provision.hideSecret') : t('provision.showSecret')}
              aria-pressed={revealed}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              onClick={() =>
                setRevealedSecrets(prev => ({ ...prev, [field.name]: !prev[field.name] }))
              }
            >
              {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <>
      <Dialog
        open
        onOpenChange={next => {
          if (!next) requestClose()
        }}
      >
        <DialogContent
          className="grid max-h-[85vh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-lg"
          // 接入流程含扫码等待与手填凭据，误点遮罩会丢掉本轮输入；Esc 在等待扫码时同样二次确认
          preventOutsideClose
          onEscapeKeyDown={event => {
            if (!waiting) return
            event.preventDefault()
            setConfirmCloseOpen(true)
          }}
        >
          <DialogHeader className="border-b px-6 py-5 pr-10">
            <DialogTitle>{t('provision.title')}</DialogTitle>
            <DialogDescription>{t('provision.description')}</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="channel-select">{t('provision.channelLabel')}</Label>
              <Select value={channel} onValueChange={handleChannelChange}>
                <SelectTrigger id="channel-select">
                  <SelectValue placeholder={t('provision.channelLabel')} />
                </SelectTrigger>
                <SelectContent>
                  {catalog.map(item => (
                    <SelectItem key={item.channel} value={item.channel}>
                      {item.display_name}
                      {item.supports_provisioning ? '' : ` · ${t('provision.tabManual')}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 绑定 Agent 是两种接入方式的公共前置：放 Tabs 之外，扫码与手填都能选到 */}
            <div className="space-y-2">
              <Label htmlFor="provision-agent">{t('provision.agentLabel')}</Label>
              <Select value={agentId} onValueChange={setAgentId} disabled={waiting}>
                <SelectTrigger id="provision-agent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_AGENT}>{t('provision.agentNone')}</SelectItem>
                  {agents.map(agent => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {agentLoadFailed ? (
                <p className="flex items-center gap-2 text-xs text-destructive">
                  {t('provision.agentLoadFailed')}
                  <button
                    type="button"
                    className="underline underline-offset-2 hover:no-underline"
                    onClick={() => setAgentReloadToken(token => token + 1)}
                  >
                    {t('common:action.retry')}
                  </button>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {agentId === NO_AGENT ? t('provision.agentHint') : t('instance.bindHint')}
                </p>
              )}
            </div>

            <Tabs value={mode} onValueChange={value => setMode(value as 'qr' | 'manual')}>
              <TabsList className="w-full">
                <TabsTrigger value="qr" disabled={!selected?.supports_provisioning}>
                  <QrCode className="h-4 w-4" />
                  {t('provision.tabQr')}
                </TabsTrigger>
                <TabsTrigger value="manual">
                  <KeyRound className="h-4 w-4" />
                  {t('provision.tabManual')}
                </TabsTrigger>
              </TabsList>
              {/* 不支持扫码时 Tab 是禁用态，把原因放在 Tab 外，避免提示永远看不到 */}
              {!selected?.supports_provisioning ? (
                <p className="text-xs text-muted-foreground">{t('provision.unsupported')}</p>
              ) : null}

              <TabsContent value="qr" className="space-y-4 pt-4">
                {!attempt ? (
                  <div className="space-y-3">
                    {platformNotice || platformUrl ? (
                      <div className="flex items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-blue-800">
                        <Info className="mt-0.5 h-4 w-4 shrink-0" />
                        <div className="min-w-0 space-y-1.5">
                          <p className="text-sm font-medium">{t('provision.beforeStart')}</p>
                          {platformNotice ? (
                            <p className="text-xs leading-relaxed">{platformNotice}</p>
                          ) : null}
                          {platformUrl ? (
                            <a
                              href={platformUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2 hover:no-underline"
                            >
                              {t('provision.platformOpen')}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    <p className="text-sm text-muted-foreground">{t('provision.qrHint')}</p>
                    <Button onClick={() => void handleBegin()} disabled={beginning || !channel}>
                      {beginning ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      {beginning ? t('provision.generating') : t('provision.startQr')}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-col items-center gap-3 rounded-lg border bg-muted/30 p-4">
                      {attempt.qr_content ? (
                        <div className="rounded-md bg-white p-3">
                          <QRCodeSVG
                            value={attempt.qr_content}
                            size={192}
                            level="M"
                            aria-label={t('provision.qrAlt', {
                              channel: selected?.display_name ?? '',
                            })}
                          />
                        </div>
                      ) : (
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      )}
                      {waiting ? (
                        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          <span>{t('provision.status.waiting')}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {t('provision.qrWaitingMeta', {
                              left: formatCountdown(left),
                              time: formatChannelTime(attempt.expires_at),
                            })}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm">
                          {attempt.status === 'expired' ? (
                            <XCircle className="h-4 w-4 text-amber-600" />
                          ) : attempt.status === 'failed' ? (
                            <XCircle className="h-4 w-4 text-rose-600" />
                          ) : attempt.status === 'cancelled' ? (
                            <XCircle className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          )}
                          <span>
                            {t(`provision.status.${attempt.status}`, {
                              defaultValue: attempt.status,
                            })}
                          </span>
                        </div>
                      )}
                      {attempt.qr_content ? (
                        <Button variant="ghost" size="sm" onClick={() => void handleCopyQr()}>
                          <Copy className="h-4 w-4" />
                          {t('actions.copyQr')}
                        </Button>
                      ) : null}
                    </div>

                    {attempt.status === 'expired' ? (
                      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{t('provision.expiredHint')}</span>
                      </div>
                    ) : null}
                    {attempt.status === 'failed' ? (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          {t('provision.failedHint', { code: attempt.error_code ?? '--' })}
                        </AlertDescription>
                      </Alert>
                    ) : null}
                    {pollError ? (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="flex items-center justify-between gap-2">
                          <span>{t('provision.pollFailed')}</span>
                          <Button size="sm" variant="outline" onClick={() => setPollError(false)}>
                            {t('common:action.retry')}
                          </Button>
                        </AlertDescription>
                      </Alert>
                    ) : null}

                    <div className="flex items-center gap-2">
                      {waiting ? (
                        <Button variant="outline" onClick={() => void handleCancel()}>
                          <XCircle className="h-4 w-4" />
                          {t('provision.cancel')}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={() => void handleBegin()}
                          disabled={beginning}
                        >
                          <RefreshCw className="h-4 w-4" />
                          {t('provision.regenerate')}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="manual" className="space-y-4 pt-4">
                {/* 手填凭据需要用户先去平台建机器人拿凭据：引导必须排在字段之前 */}
                {platformUrl || platformNotice ? (
                  <div className="rounded-lg border bg-muted/30 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium">{t('provision.manualGuideTitle')}</span>
                      {platformUrl ? (
                        <Button variant="outline" size="sm" asChild>
                          <a href={platformUrl} target="_blank" rel="noreferrer">
                            {t('provision.platformOpen')}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      ) : null}
                    </div>
                    {manualGuide ? (
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        {manualGuide}
                      </p>
                    ) : null}
                    {platformNotice ? (
                      <p className="mt-1.5 text-xs leading-relaxed text-amber-700">
                        {platformNotice}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <p className="text-sm text-muted-foreground">{t('provision.manualHint')}</p>

                {requiredFields.length > 0 ? (
                  <div className="space-y-4">{requiredFields.map(renderCredentialField)}</div>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="instance-display-name">{t('provision.displayNameLabel')}</Label>
                  <Input
                    id="instance-display-name"
                    value={displayName}
                    placeholder={t('provision.displayNamePlaceholder')}
                    onChange={event => setDisplayName(event.target.value)}
                  />
                </div>

                {/* 可选凭据与归属标签属于进阶配置，收起后主路径只剩必填项 */}
                <div className="rounded-lg border">
                  <button
                    type="button"
                    aria-expanded={showAdvanced}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium"
                    onClick={() => setShowAdvanced(prev => !prev)}
                  >
                    <span className="flex items-center gap-2">
                      <Settings2 className="h-4 w-4 text-muted-foreground" />
                      {t('provision.advancedOptions')}
                    </span>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 text-muted-foreground transition-transform',
                        showAdvanced && 'rotate-180'
                      )}
                    />
                  </button>
                  {showAdvanced ? (
                    <div className="space-y-4 border-t px-3 py-3">
                      {optionalFields.map(renderCredentialField)}
                      <div className="space-y-2">
                        <Label htmlFor="instance-owner-ref">{t('provision.ownerRefLabel')}</Label>
                        <Input
                          id="instance-owner-ref"
                          value={ownerRef}
                          placeholder={t('provision.ownerRefPlaceholder')}
                          onChange={event => setOwnerRef(event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          {t('provision.ownerRefHint')}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <DialogFooter className="border-t px-6 py-4">
            <Button variant="outline" onClick={requestClose}>
              {t('common:action.close')}
            </Button>
            {mode === 'manual' ? (
              <Button onClick={() => void handleManualSubmit()} disabled={submitting || !selected}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {submitting ? t('provision.submitting') : t('provision.submit')}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmCloseOpen} onOpenChange={setConfirmCloseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('provision.closeWaitingTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('provision.closeWaitingDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('provision.closeWaitingKeep')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={closing}
              onClick={event => {
                // 保持外层对话框打开，等取消接口返回后再关闭
                event.preventDefault()
                void handleConfirmClose()
              }}
            >
              {closing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('provision.closeWaitingConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
