'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Send,
  XCircle,
} from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  channelService,
  type ChannelDeliveryTestResult,
  type ChannelInstance,
  type ChannelKnownSender,
} from '@/services/channel-service'
import { channelErrorMessage } from './utils'

interface ConnectivityTestPanelProps {
  instance: ChannelInstance
}

const RESULT_TONE: Record<string, string> = {
  delivered: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  rejected: 'border-rose-200 bg-rose-50 text-rose-800',
  uncertain: 'border-amber-200 bg-amber-50 text-amber-800',
}

const RESULT_ICON: Record<string, typeof CheckCircle2> = {
  delivered: CheckCircle2,
  rejected: XCircle,
  uncertain: AlertTriangle,
}

/** 平台已回传创建者标识的渠道（如 QQ 的 owner_user_openid）优先：它比"最近交互过的人"更可靠。 */
function ownerSenderId(instance: ChannelInstance): string {
  const owner = instance.config?.owner_user_openid
  return typeof owner === 'string' ? owner.trim() : ''
}

/** 路由键：同一用户可能同时有私聊/群聊两条记录。 */
function senderKey(sender: ChannelKnownSender): string {
  return `${sender.conversation_type}:${sender.platform_user_id}`
}

/** 预填默认值：最近交互的私聊用户。 */
function defaultSenderId(senders: ChannelKnownSender[]): string {
  return senders[0]?.platform_user_id ?? ''
}

/**
 * 连通性测试：向指定用户发一条固定文案，展示投递**三态**。
 *
 * 接收用户 ID 只能从平台侧获得。若渠道在接入时已回传创建者标识（如 QQ 的
 * `owner_user_openid`）就直接预填它；否则退回曾私聊过的用户（企微等平台不返回
 * 创建者身份的渠道）。输入框始终可手写，有候选时右侧出现下拉可选。
 *
 * 三态必须分别呈现，尤其是 `uncertain`（超时 / 连接中断）——它意味着系统
 * **不会重发**，用户可能收不到，这一点必须说清楚，否则运维会反复点击重试。
 */
export function ConnectivityTestPanel({ instance }: ConnectivityTestPanelProps) {
  const { t } = useTranslation('channel')
  const { toast } = useToast()
  const ownerId = ownerSenderId(instance)
  const [platformUserId, setPlatformUserId] = useState(ownerId)
  const [knownSenders, setKnownSenders] = useState<ChannelKnownSender[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [sendersOpen, setSendersOpen] = useState(false)
  const [result, setResult] = useState<ChannelDeliveryTestResult | null>(null)

  // 进入面板即拉候选收件人，仅在还没有默认值（即无创建者标识）时补上；失败不阻塞测试。
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const senders = await channelService.listKnownSenders(instance.id)
        if (cancelled) return
        // MVP 只支持私聊：群聊路由的 platform_user_id 语义不同，按 direct 发会失败
        const directSenders = senders.filter(sender => sender.conversation_type === 'direct')
        setKnownSenders(directSenders)
        setPlatformUserId(prev => prev || defaultSenderId(directSenders))
      } catch (error) {
        console.error('Failed to load known channel senders:', error)
        if (!cancelled) setKnownSenders([])
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [instance.id])

  const handleSubmit = async () => {
    const userId = platformUserId.trim()
    if (!userId) {
      toast({ title: t('test.userLabel'), variant: 'destructive' })
      return
    }
    setSubmitting(true)
    setResult(null)
    try {
      // MVP 只支持私聊，因此固定 direct；接口本身允许 group。
      const data = await channelService.testDelivery(instance.id, {
        platform_user_id: userId,
        conversation_type: 'direct',
      })
      setResult(data)
    } catch (error) {
      console.error('Failed to run channel connectivity test:', error)
      toast({
        title: t('test.failed'),
        description: channelErrorMessage(t, error, t('common:status.error')),
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const Icon = result ? (RESULT_ICON[result.certainty] ?? AlertTriangle) : null

  // 下拉候选：已知私聊用户；平台给了创建者标识（QQ 的 owner_user_openid）时并入其中，便于切回。
  const senderOptions: ChannelKnownSender[] =
    ownerId && !knownSenders.some(sender => sender.platform_user_id === ownerId)
      ? [{ conversation_type: 'direct', platform_user_id: ownerId }, ...knownSenders]
      : knownSenders

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('test.description')}</p>

      {!instance.connected ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{t('test.disconnectedHint')}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="test-platform-user">{t('test.userLabel')}</Label>
        {/* 一个控件兼两种用法：始终可手输；有候选时右侧出现 chevron 可下拉选择。 */}
        <Popover open={sendersOpen} onOpenChange={setSendersOpen}>
          {/* Anchor 用整个输入框：弹层宽度与对齐跟着输入框，而不是那个小按钮 */}
          <PopoverAnchor className="relative">
            <Input
              id="test-platform-user"
              value={platformUserId}
              placeholder={t('test.userPlaceholder')}
              onChange={event => setPlatformUserId(event.target.value)}
              className={cn(senderOptions.length > 0 && 'pr-9')}
            />
            {senderOptions.length > 0 ? (
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('test.knownSendersLabel')}
                  title={t('test.knownSendersLabel')}
                  className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground opacity-60 hover:bg-transparent"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
            ) : null}
          </PopoverAnchor>
          <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
            <Command>
              <CommandList>
                <CommandGroup>
                  {senderOptions.map(sender => (
                    <CommandItem
                      key={senderKey(sender)}
                      value={senderKey(sender)}
                      onSelect={() => {
                        setPlatformUserId(sender.platform_user_id)
                        setSendersOpen(false)
                      }}
                    >
                      <span className="truncate">{sender.platform_user_id}</span>
                      {sender.platform_user_id === platformUserId ? (
                        <Check className="ml-auto h-4 w-4 shrink-0" />
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <Button onClick={() => void handleSubmit()} disabled={submitting}>
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {submitting ? t('test.submitting') : t('test.submit')}
      </Button>

      {result && Icon ? (
        <div className={cn('space-y-1 rounded-lg border p-4', RESULT_TONE[result.certainty])}>
          <p className="flex items-center gap-2 text-sm font-medium">
            <Icon className="h-4 w-4 shrink-0" />
            {t(`test.certainty.${result.certainty}`, { defaultValue: result.certainty })}
          </p>
          <p className="text-sm">{t(`test.result.${result.certainty}`, { defaultValue: '' })}</p>
          {result.error_code ? (
            <p className="font-mono text-xs">{t('test.errorCode', { code: result.error_code })}</p>
          ) : null}
          {result.platform_message_ref ? (
            <p className="font-mono text-xs">
              {t('test.messageRef', { ref: result.platform_message_ref })}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
