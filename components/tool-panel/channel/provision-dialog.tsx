'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'
import { AlertTriangle, CheckCircle2, Copy, Loader2, RefreshCw, XCircle } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { agentService } from '@/services/agent-service'
import {
  channelService,
  isTerminalProvisionStatus,
  provisionPollDelayMs,
  type ChannelCatalogItem,
  type ProvisionAttempt,
} from '@/services/channel-service'
import { channelErrorMessage, formatChannelTime, formatCountdown, remainingMs } from './utils'

/** Radix Select 不允许空字符串值，用哨兵表示"暂不绑定"。 */
const NO_AGENT = '__none__'

interface ProvisionDialogProps {
  catalog: ChannelCatalogItem[]
  /** 接入成功后通知列表刷新。 */
  onConnected: () => void
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
  const [displayName, setDisplayName] = useState('')
  const [ownerRef, setOwnerRef] = useState('')
  const [agentId, setAgentId] = useState<string>(NO_AGENT)
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([])
  const [submitting, setSubmitting] = useState(false)
  // 「接入成功」只处理一次：effect 依赖里含有调用方回调，不能靠依赖去重。
  const handledAttemptRef = useRef<string | null>(null)

  const selected = useMemo(
    () => catalog.find(item => item.channel === channel) ?? null,
    [catalog, channel]
  )

  // agent 列表用于"可选绑定"；失败不阻塞接入流程本身。
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const data = await agentService.getAgents()
        if (!cancelled) {
          setAgents(
            data.filter(agent => agent.status !== 'deleted').map(a => ({ id: a.id, name: a.name }))
          )
        }
      } catch (error) {
        console.error('Failed to load agents for channel provisioning:', error)
        if (!cancelled) setAgents([])
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

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
    toast({
      title: t('provision.succeededTitle'),
      description: t('provision.succeededDescription', {
        name: instance?.display_name || (selected?.display_name ?? ''),
      }),
    })
    onConnected()
    onClose()
  }, [attempt, onClose, onConnected, selected, t, toast])

  const handleChannelChange = (value: string) => {
    setChannel(value)
    setAttempt(null)
    setPollError(false)
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

  const handleCopyQr = async () => {
    if (!attempt?.qr_content) return
    try {
      await navigator.clipboard.writeText(attempt.qr_content)
      toast({ title: t('actions.copied') })
    } catch (error) {
      console.error('Failed to copy QR content:', error)
    }
  }

  const fields = selected?.credential_fields ?? []

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
      toast({
        title: t('provision.manualSucceeded', {
          name: instance.display_name || selected.display_name,
        }),
      })
      onConnected()
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

  const waiting = attempt?.status === 'waiting'
  const left = attempt ? remainingMs(attempt.expires_at, now) : 0

  return (
    <Dialog
      open
      onOpenChange={next => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('provision.title')}</DialogTitle>
          <DialogDescription>{t('provision.description')}</DialogDescription>
        </DialogHeader>

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

        <Tabs value={mode} onValueChange={value => setMode(value as 'qr' | 'manual')}>
          <TabsList className="w-full">
            <TabsTrigger value="qr" disabled={!selected?.supports_provisioning}>
              {t('provision.tabQr')}
            </TabsTrigger>
            <TabsTrigger value="manual">{t('provision.tabManual')}</TabsTrigger>
          </TabsList>

          <TabsContent value="qr" className="space-y-4 pt-4">
            {!selected?.supports_provisioning ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{t('provision.unsupported')}</AlertDescription>
              </Alert>
            ) : null}

            {!attempt ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{t('provision.qrHint')}</p>
                <Button onClick={() => void handleBegin()} disabled={beginning || !channel}>
                  {beginning ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {beginning ? t('provision.generating') : t('actions.connect')}
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
                        aria-label={t('provision.tabQr')}
                      />
                    </div>
                  ) : (
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    {waiting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        <span>{t('provision.status.waiting')}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {formatCountdown(left)}
                        </span>
                      </>
                    ) : (
                      <>
                        {attempt.status === 'expired' ? (
                          <XCircle className="h-4 w-4 text-amber-600" />
                        ) : attempt.status === 'failed' ? (
                          <XCircle className="h-4 w-4 text-rose-600" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        )}
                        <span>
                          {t(`provision.status.${attempt.status}`, {
                            defaultValue: attempt.status,
                          })}
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('provision.qrExpiresAt', { time: formatChannelTime(attempt.expires_at) })}
                  </p>
                  {attempt.qr_content ? (
                    <Button variant="ghost" size="sm" onClick={() => void handleCopyQr()}>
                      <Copy className="h-4 w-4" />
                      {t('actions.copyQr')}
                    </Button>
                  ) : null}
                </div>

                {attempt.status === 'expired' ? (
                  <p className="text-sm text-amber-700">{t('provision.expiredHint')}</p>
                ) : null}
                {attempt.status === 'failed' ? (
                  <p className="text-sm text-rose-700">
                    {t('provision.failedHint', { code: attempt.error_code ?? '--' })}
                  </p>
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
            <p className="text-sm text-muted-foreground">{t('provision.manualHint')}</p>
            {fields.map(field => (
              <div key={field.name} className="space-y-2">
                <Label htmlFor={`credential-${field.name}`}>
                  {field.label}
                  {field.required ? <span className="ml-1 text-destructive">*</span> : null}
                </Label>
                <Input
                  id={`credential-${field.name}`}
                  type={field.secret ? 'password' : 'text'}
                  autoComplete={field.secret ? 'new-password' : 'off'}
                  value={manualValues[field.name] ?? ''}
                  placeholder={field.label}
                  onChange={event =>
                    setManualValues(prev => ({ ...prev, [field.name]: event.target.value }))
                  }
                />
              </div>
            ))}
            <div className="space-y-2">
              <Label htmlFor="instance-display-name">{t('provision.displayNameLabel')}</Label>
              <Input
                id="instance-display-name"
                value={displayName}
                placeholder={t('provision.displayNamePlaceholder')}
                onChange={event => setDisplayName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="instance-owner-ref">{t('provision.ownerRefLabel')}</Label>
              <Input
                id="instance-owner-ref"
                value={ownerRef}
                placeholder={t('provision.ownerRefPlaceholder')}
                onChange={event => setOwnerRef(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('provision.ownerRefHint')}</p>
            </div>
            <div className="space-y-2">
              <Label>{t('provision.agentLabel')}</Label>
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger>
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
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
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
  )
}
