'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, Loader2, PlugZap, Save, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { agentService } from '@/services/agent-service'
import {
  channelService,
  type ChannelCatalogItem,
  type ChannelInstance,
} from '@/services/channel-service'
import { AccessPolicyPanel } from './access-policy-panel'
import { ConnectivityTestPanel } from './connectivity-test-panel'
import {
  STATUS_TONE_CLASSES,
  agentStateKey,
  channelErrorMessage,
  channelDisplayName,
  configEntries,
  formatChannelDateTime,
  instanceDisplayName,
  instanceStatusTone,
} from './utils'

/** Radix Select 不允许空字符串值，用哨兵表示"解绑 / 暂不绑定"。 */
const NO_AGENT = '__none__'

interface InstanceDetailDialogProps {
  /** 已存在的实例：组件由调用方按 instance.id 作为 key 挂载，切换实例即重新初始化。 */
  instance: ChannelInstance
  /** 打开时定位到哪个页签（卡片上的「连通性测试」直接跳到测试页）。 */
  initialTab?: string
  catalog: ChannelCatalogItem[]
  onClose: () => void
  /** 实例发生变化（绑定 / 改名 / 重连）后同步列表与详情。 */
  onUpdated: (instance: ChannelInstance) => void
  /** 删除交给页面弹二次确认（与既有的删除对话框范式一致）。 */
  onRequestDelete: (instance: ChannelInstance) => void
}

export function InstanceDetailDialog({
  instance,
  initialTab,
  catalog,
  onClose,
  onUpdated,
  onRequestDelete,
}: InstanceDetailDialogProps) {
  const { t } = useTranslation('channel')
  const { toast } = useToast()
  // 实例由 props 驱动（父组件在每次变更后回写），只有输入框需要本地草稿状态。
  const current = instance
  const [tab, setTab] = useState(initialTab ?? 'overview')
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([])
  const [agentId, setAgentId] = useState<string>(instance.agent_id ?? NO_AGENT)
  const [displayName, setDisplayName] = useState(instance.display_name ?? '')
  const [savingAgent, setSavingAgent] = useState(false)
  const [savingName, setSavingName] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const data = await agentService.getAgents()
        if (!cancelled) {
          setAgents(
            data
              .filter(agent => agent.status !== 'deleted')
              .map(agent => ({ id: agent.id, name: agent.name }))
          )
        }
      } catch (error) {
        console.error('Failed to load agents for channel instance binding:', error)
        if (!cancelled) setAgents([])
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const applyUpdate = (updated: ChannelInstance) => {
    setAgentId(updated.agent_id ?? NO_AGENT)
    setDisplayName(updated.display_name ?? '')
    onUpdated(updated)
  }

  const handleSaveAgent = async () => {
    setSavingAgent(true)
    try {
      // agent_id: null 表示解绑（后端按"字段是否出现"区分未提供与置空）
      const updated = await channelService.updateInstance(current.id, {
        agent_id: agentId === NO_AGENT ? null : agentId,
      })
      applyUpdate(updated)
      toast({ title: t('detail.bindSaved') })
    } catch (error) {
      console.error('Failed to update channel instance binding:', error)
      toast({
        title: t('detail.bindFailed'),
        description: channelErrorMessage(t, error, t('common:status.error')),
        variant: 'destructive',
      })
    } finally {
      setSavingAgent(false)
    }
  }

  const handleSaveName = async () => {
    setSavingName(true)
    try {
      const updated = await channelService.updateInstance(current.id, {
        display_name: displayName.trim() || null,
      })
      applyUpdate(updated)
      toast({ title: t('detail.renameSaved') })
    } catch (error) {
      console.error('Failed to rename channel instance:', error)
      toast({
        title: t('detail.renameFailed'),
        description: channelErrorMessage(t, error, t('common:status.error')),
        variant: 'destructive',
      })
    } finally {
      setSavingName(false)
    }
  }

  const handleReconnect = async () => {
    setReconnecting(true)
    try {
      const updated = await channelService.reconnectInstance(current.id)
      applyUpdate(updated)
      toast({ title: t('detail.reconnectSucceeded') })
    } catch (error) {
      console.error('Failed to reconnect channel instance:', error)
      toast({
        title: t('detail.reconnectFailed'),
        description: channelErrorMessage(t, error, t('common:status.error')),
        variant: 'destructive',
      })
    } finally {
      setReconnecting(false)
    }
  }

  const stateKey = agentStateKey(current.agent_state)
  const tone = instanceStatusTone(current.status)
  const infoRows: Array<[string, string]> = [
    [
      t('instance.channel'),
      `${channelDisplayName(current.channel, catalog)}（${current.channel}）`,
    ],
    [t('instance.instanceId'), current.id],
    [t('instance.ownerRef'), current.owner_ref || t('common:status.notProvided')],
    [t('instance.generation'), String(current.generation)],
    [t('instance.credential'), current.credential_mask || t('common:status.notProvided')],
    [t('instance.createdAt'), formatChannelDateTime(current.created_at)],
    [t('instance.updatedAt'), formatChannelDateTime(current.updated_at)],
  ]

  return (
    <Dialog
      open
      onOpenChange={next => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="truncate">{instanceDisplayName(current, catalog)}</span>
            <Badge variant="outline" className={cn('shrink-0', STATUS_TONE_CLASSES[tone])}>
              {t(`instance.status.${current.status}`, { defaultValue: current.status })}
            </Badge>
          </DialogTitle>
          <DialogDescription>{t('detail.title')}</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="overview">{t('actions.detail')}</TabsTrigger>
            <TabsTrigger value="policy">{t('policy.title')}</TabsTrigger>
            <TabsTrigger value="test">{t('test.title')}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-5 pt-4">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {infoRows.map(([label, value]) => (
                <div key={label} className="flex min-w-0 flex-col">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="truncate font-mono text-xs text-foreground" title={value}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>

            {configEntries(current.config).length > 0 ? (
              <div>
                <p className="text-xs text-muted-foreground">{t('instance.config')}</p>
                <dl className="mt-1 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                  {configEntries(current.config).map(([key, value]) => (
                    <div key={key} className="flex min-w-0 gap-2">
                      <dt className="shrink-0 text-muted-foreground">{key}:</dt>
                      <dd className="truncate font-mono" title={value}>
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            <Separator />

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Bot className="h-4 w-4" />
                {t('detail.bindAgent')}
              </Label>
              <div className="flex items-center gap-2">
                <Select value={agentId} onValueChange={setAgentId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_AGENT}>{t('detail.noAgent')}</SelectItem>
                    {agents.map(agent => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  disabled={savingAgent}
                  onClick={() => void handleSaveAgent()}
                >
                  {savingAgent ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {t('common:action.save')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('instance.boundAgent')}：{t(`instance.agentState.${stateKey}`)}
                {current.agent_name ? ` · ${current.agent_name}` : ''}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="detail-display-name">{t('detail.renameLabel')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="detail-display-name"
                  className="flex-1"
                  value={displayName}
                  placeholder={t('provision.displayNamePlaceholder')}
                  onChange={event => setDisplayName(event.target.value)}
                />
                <Button
                  variant="outline"
                  disabled={savingName || displayName === (current.display_name ?? '')}
                  onClick={() => void handleSaveName()}
                >
                  {savingName ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {t('common:action.save')}
                </Button>
              </div>
            </div>

            <Separator />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                variant="outline"
                disabled={reconnecting}
                onClick={() => void handleReconnect()}
              >
                {reconnecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PlugZap className="h-4 w-4" />
                )}
                {reconnecting ? t('detail.reconnecting') : t('detail.reconnect')}
              </Button>
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => onRequestDelete(current)}
              >
                <Trash2 className="h-4 w-4" />
                {t('actions.delete')}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="policy" className="pt-4">
            <AccessPolicyPanel instanceId={current.id} />
          </TabsContent>

          <TabsContent value="test" className="pt-4">
            <ConnectivityTestPanel instance={current} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
