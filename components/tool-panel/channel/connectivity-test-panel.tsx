'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, Loader2, Send, XCircle } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  channelService,
  type ChannelDeliveryTestResult,
  type ChannelInstance,
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

/**
 * 连通性测试：向指定用户发一条固定文案，展示投递**三态**。
 *
 * 三态必须分别呈现，尤其是 `uncertain`（超时 / 连接中断）——它意味着系统
 * **不会重发**，用户可能收不到，这一点必须说清楚，否则运维会反复点击重试。
 */
export function ConnectivityTestPanel({ instance }: ConnectivityTestPanelProps) {
  const { t } = useTranslation('channel')
  const { toast } = useToast()
  const [platformUserId, setPlatformUserId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ChannelDeliveryTestResult | null>(null)

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
        <Input
          id="test-platform-user"
          value={platformUserId}
          placeholder={t('test.userPlaceholder')}
          onChange={event => setPlatformUserId(event.target.value)}
        />
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
