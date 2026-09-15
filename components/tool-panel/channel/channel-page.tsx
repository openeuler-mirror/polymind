'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Info, MessagesSquare, Plus, RefreshCw } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import {
  channelService,
  type ChannelCatalogItem,
  type ChannelInstance,
} from '@/services/channel-service'
import { DeleteChannelInstanceDialog } from './delete-instance-dialog'
import { InstanceCard } from './instance-card'
import { InstanceDetailDialog } from './instance-detail-dialog'
import { ProvisionDialog } from './provision-dialog'
import { channelErrorMessage, instanceDisplayName } from './utils'

type DetailTab = 'overview' | 'policy' | 'test'

interface DetailState {
  instance: ChannelInstance
  tab: DetailTab
}

/** 实例卡片网格列：骨架屏与实际列表共用（与定时任务页保持一致）。 */
const CARD_GRID_STYLE = { gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' } as const

/**
 * IM 渠道管理页：接入机器人、查看实例、绑定 agent、连通性测试与准入策略。
 *
 * 数据来源只有两处：`GET /channels/catalog`（渠道标识符与手填字段）与
 * `/channels/instances`（实例）；界面里**不出现任何凭据明文**，只有 credential_mask。
 */
export function ChannelPage() {
  const { t } = useTranslation('channel')
  const { toast } = useToast()
  const [catalog, setCatalog] = useState<ChannelCatalogItem[]>([])
  const [instances, setInstances] = useState<ChannelInstance[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [provisionOpen, setProvisionOpen] = useState(false)
  const [detail, setDetail] = useState<DetailState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ChannelInstance | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  // 刷新按钮通过递增令牌触发重新加载（effect 内部定义加载器，便于取消与依赖追踪）
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const [catalogItems, instanceItems] = await Promise.all([
          channelService.listCatalog(),
          channelService.listInstances(),
        ])
        if (cancelled) return
        setCatalog(catalogItems)
        setInstances(instanceItems)
        setLoadError(null)
      } catch (error) {
        console.error('Failed to load channel data:', error)
        if (cancelled) return
        setLoadError(channelErrorMessage(t, error, t('list.loadFailed')))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [reloadToken, t])

  const refreshInstances = useCallback(async () => {
    try {
      const items = await channelService.listInstances()
      setInstances(items)
      // 详情打开时同步最新对象，避免对话框里展示的是过期状态
      setDetail(prev =>
        prev
          ? { ...prev, instance: items.find(item => item.id === prev.instance.id) ?? prev.instance }
          : prev
      )
    } catch (error) {
      console.error('Failed to refresh channel instances:', error)
    }
  }, [])

  /** 详情对话框内的变更（绑定 / 改名 / 重连）：立即回写列表与详情，不等下一次拉取。 */
  const handleInstanceUpdated = useCallback((updated: ChannelInstance) => {
    setInstances(prev => prev.map(item => (item.id === updated.id ? updated : item)))
    setDetail(prev => (prev ? { ...prev, instance: updated } : prev))
  }, [])

  const handleReconnect = useCallback(
    async (instance: ChannelInstance) => {
      setBusyId(instance.id)
      try {
        const updated = await channelService.reconnectInstance(instance.id)
        setInstances(prev => prev.map(item => (item.id === updated.id ? updated : item)))
        toast({ title: t('detail.reconnectSucceeded') })
      } catch (error) {
        console.error('Failed to reconnect channel instance:', error)
        toast({
          title: t('detail.reconnectFailed'),
          description: channelErrorMessage(t, error, t('common:status.error')),
          variant: 'destructive',
        })
      } finally {
        setBusyId(null)
      }
    },
    [t, toast]
  )

  const deleteDisplayName = useMemo(() => {
    if (!deleteTarget) return undefined
    return instanceDisplayName(deleteTarget, catalog)
  }, [catalog, deleteTarget])

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-6 pb-16 pt-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setReloadToken(token => token + 1)}>
              <RefreshCw className="h-4 w-4" />
              {t('actions.refresh')}
            </Button>
            <Button size="sm" onClick={() => setProvisionOpen(true)}>
              <Plus className="h-4 w-4" />
              {t('actions.connect')}
            </Button>
          </div>
        </div>

        {/* 默认放行是已知风险（特性设计文档 6.2），必须在页面上明示 */}
        <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{t('notice')}</p>
        </div>

        {loadError ? (
          <Alert variant="destructive" className="mt-5">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-2">
              <span>{loadError}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setReloadToken(token => token + 1)}
              >
                {t('common:action.retry')}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {loading ? (
          <div className="mt-6 grid gap-4" style={CARD_GRID_STYLE}>
            {[0, 1].map(index => (
              <Skeleton key={index} className="h-48 w-full rounded-lg" />
            ))}
          </div>
        ) : instances.length === 0 ? (
          <div className="mt-8">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessagesSquare className="h-6 w-6" />
                </EmptyMedia>
                <EmptyTitle>{t('list.emptyTitle')}</EmptyTitle>
                <EmptyDescription>{t('list.emptyDescription')}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => setProvisionOpen(true)}>
                  <Plus className="h-4 w-4" />
                  {t('actions.connect')}
                </Button>
              </EmptyContent>
            </Empty>
          </div>
        ) : (
          <>
            <p className="mt-6 text-sm text-muted-foreground">
              {t('list.count', { count: instances.length })}
            </p>
            <div className="mt-3 grid gap-4" style={CARD_GRID_STYLE}>
              {instances.map(instance => (
                <InstanceCard
                  key={instance.id}
                  instance={instance}
                  catalog={catalog}
                  busy={busyId === instance.id}
                  onOpenDetail={target => setDetail({ instance: target, tab: 'overview' })}
                  onTest={target => setDetail({ instance: target, tab: 'test' })}
                  onReconnect={target => void handleReconnect(target)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {provisionOpen ? (
        <ProvisionDialog
          catalog={catalog}
          onConnected={() => void refreshInstances()}
          onClose={() => setProvisionOpen(false)}
        />
      ) : null}

      {detail ? (
        <InstanceDetailDialog
          key={detail.instance.id}
          instance={detail.instance}
          initialTab={detail.tab}
          catalog={catalog}
          onClose={() => setDetail(null)}
          onUpdated={handleInstanceUpdated}
          onRequestDelete={target => {
            setDetail(null)
            setDeleteTarget(target)
          }}
        />
      ) : null}

      <DeleteChannelInstanceDialog
        instance={deleteTarget}
        displayName={deleteDisplayName}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => void refreshInstances()}
      />
    </div>
  )
}
