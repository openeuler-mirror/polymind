'use client'

import { useTranslation } from 'react-i18next'
import { Bot, KeyRound, Loader2, PlugZap, Send, Settings2, Unlink } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ChannelCatalogItem, ChannelInstance } from '@/services/channel-service'
import { cn } from '@/lib/utils'
import {
  STATUS_TONE_CLASSES,
  agentStateKey,
  channelDisplayName,
  instanceDisplayName,
  instanceStatusTone,
} from './utils'

interface InstanceCardProps {
  instance: ChannelInstance
  catalog: ChannelCatalogItem[]
  busy: boolean
  onOpenDetail: (instance: ChannelInstance) => void
  onTest: (instance: ChannelInstance) => void
  onReconnect: (instance: ChannelInstance) => void
}

/**
 * 渠道实例卡片：状态徽标、绑定 agent、凭据掩码、连接状态。
 *
 * agent 的两种不健康状态必须能区分：`unbound`（从未绑定）与 `deleted`
 * （绑定后被删除）——用户侧文案相同，运维侧需要看得出来。
 */
export function InstanceCard({
  instance,
  catalog,
  busy,
  onOpenDetail,
  onTest,
  onReconnect,
}: InstanceCardProps) {
  const { t } = useTranslation('channel')
  const title = instanceDisplayName(instance, catalog)
  const tone = instanceStatusTone(instance.status)
  const stateKey = agentStateKey(instance.agent_state)
  const agentUnavailable = stateKey === 'unbound' || stateKey === 'deleted'
  const agentLabel = agentUnavailable
    ? stateKey === 'deleted' && instance.agent_name
      ? `${t('instance.agentState.deleted')}（${instance.agent_name}）`
      : t(`instance.agentState.${stateKey}`)
    : (instance.agent_name ?? t(`instance.agentState.${stateKey}`))

  return (
    <div className="flex flex-col rounded-lg border bg-card p-5 shadow-sm transition-all duration-200 hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-medium text-foreground">{title}</span>
            <Badge variant="outline" className={cn('shrink-0', STATUS_TONE_CLASSES[tone])}>
              {t(`instance.status.${instance.status}`, { defaultValue: instance.status })}
            </Badge>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {channelDisplayName(instance.channel, catalog)}
          </p>
        </div>
        {busy ? (
          <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
          <dt className="sr-only">{t('instance.boundAgent')}</dt>
          <dd
            className={cn(
              'truncate',
              agentUnavailable ? 'text-muted-foreground' : 'text-foreground'
            )}
          >
            {agentLabel}
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
          <dt className="sr-only">{t('instance.credential')}</dt>
          <dd className="truncate font-mono text-xs text-muted-foreground">
            {instance.credential_mask || t('common:status.notProvided')}
          </dd>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {instance.connected ? (
            <PlugZap className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <Unlink className="h-4 w-4 shrink-0" />
          )}
          <dd>{instance.connected ? t('instance.connected') : t('instance.disconnected')}</dd>
        </div>
      </dl>

      <div className="mt-4 flex items-center justify-end gap-2 border-t pt-3">
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => onReconnect(instance)}>
          <PlugZap className="h-4 w-4" />
          {t('actions.reconnect')}
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => onTest(instance)}>
          <Send className="h-4 w-4" />
          {t('actions.test')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => onOpenDetail(instance)}>
          <Settings2 className="h-4 w-4" />
          {t('actions.detail')}
        </Button>
      </div>
    </div>
  )
}
