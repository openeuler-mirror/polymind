'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Activity, AlertCircle, ChevronLeft, ChevronRight, HeartPulse } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Spinner } from '@/components/ui/spinner'
import {
  canAcknowledgeManagedAgent,
  summarizeManagedHealthAgents,
} from '@/hooks/insight/agent-health-utils'
import type { InsightOverviewHealthController } from '@/hooks/insight/use-overview'
import type { AgentHealthStatus, AgentRuntimeHealthStatus } from '@/hooks/insight/types'
import { cn } from '@/lib/utils'

const DRAWER_WIDTH = 340

const STATUS_META_KEYS: Record<
  AgentHealthStatus['overall_status'],
  { labelKey: string; dot: string; tone: string }
> = {
  healthy: {
    labelKey: 'insight.health.status.healthy',
    dot: 'bg-emerald-500',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  degraded: {
    labelKey: 'insight.health.status.degraded',
    dot: 'bg-amber-500',
    tone: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  missing_runtime: {
    labelKey: 'insight.health.status.missingRuntime',
    dot: 'bg-red-600',
    tone: 'border-red-200 bg-red-50 text-red-700',
  },
  ambiguous: {
    labelKey: 'insight.health.status.ambiguous',
    dot: 'bg-orange-500',
    tone: 'border-orange-200 bg-orange-50 text-orange-700',
  },
  unhealthy: {
    labelKey: 'insight.health.status.unhealthy',
    dot: 'bg-red-500',
    tone: 'border-red-200 bg-red-50 text-red-700',
  },
  hung: {
    labelKey: 'insight.health.status.hung',
    dot: 'bg-orange-500',
    tone: 'border-orange-200 bg-orange-50 text-orange-700',
  },
  unknown: {
    labelKey: 'insight.health.status.unknown',
    dot: 'bg-amber-500',
    tone: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  no_port: {
    labelKey: 'insight.health.status.noPort',
    dot: 'bg-slate-500',
    tone: 'border-slate-200 bg-slate-50 text-slate-700',
  },
  offline: {
    labelKey: 'insight.health.status.offline',
    dot: 'bg-red-700',
    tone: 'border-red-200 bg-red-50 text-red-700',
  },
}

function getStatusMeta(
  status: AgentHealthStatus['overall_status'],
  t: TFunction
): { label: string; dot: string; tone: string } {
  const meta = STATUS_META_KEYS[status]
  return {
    label: t(meta.labelKey),
    dot: meta.dot,
    tone: meta.tone,
  }
}

function getAdapterStatusMeta(status: string | null, t: TFunction) {
  if (status === 'healthy') {
    return {
      label: t('insight.health.adapter.healthy'),
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    }
  }

  if (status === 'hung') {
    return {
      label: t('insight.health.adapter.hung'),
      tone: 'border-orange-200 bg-orange-50 text-orange-700',
    }
  }

  if (status === 'offline' || status === 'unhealthy') {
    return {
      label: t('insight.health.adapter.unhealthy'),
      tone: 'border-red-200 bg-red-50 text-red-700',
    }
  }

  if (status === 'unknown') {
    return {
      label: t('insight.health.adapter.unknown'),
      tone: 'border-amber-200 bg-amber-50 text-amber-700',
    }
  }

  return {
    label: t('insight.health.adapter.notReady'),
    tone: 'border-slate-200 bg-slate-50 text-slate-700',
  }
}

function formatRelativeTime(timestampMs: number | null, now: number, t: TFunction): string {
  if (!timestampMs) {
    return '—'
  }

  const diffSeconds = Math.floor((now - timestampMs) / 1000)

  if (diffSeconds < 5) {
    return t('insight.health.justNow')
  }

  if (diffSeconds < 60) {
    return t('insight.health.secondsAgo', { count: diffSeconds })
  }

  if (diffSeconds < 3600) {
    return t('insight.health.minutesAgo', { count: Math.floor(diffSeconds / 60) })
  }

  return t('insight.health.hoursAgo', { count: Math.floor(diffSeconds / 3600) })
}

function formatClockTime(timestampMs: number | null, t: TFunction): string {
  if (!timestampMs) {
    return t('insight.health.notScanned')
  }

  return new Date(timestampMs).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatPorts(ports: number[]): string {
  return ports.length > 0 ? ports.join(', ') : '—'
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span>{label}</span>
      <span className="max-w-[62%] break-all text-right text-foreground">{value || '—'}</span>
    </div>
  )
}

function RuntimeCard({
  runtime,
  now,
  title,
  value,
  t,
}: {
  runtime: AgentRuntimeHealthStatus
  now: number
  title: string
  value: string
  t: TFunction
}) {
  const statusMeta = getStatusMeta(runtime.status, t)
  const details = [
    [t('insight.health.detail.ports'), formatPorts(runtime.ports)],
    ['PID', runtime.pid.toString()],
    [
      t('insight.health.detail.latency'),
      runtime.latency_ms !== null ? `${runtime.latency_ms} ms` : '—',
    ],
    [t('insight.health.detail.category'), runtime.category || '—'],
    [t('insight.health.detail.lastCheck'), formatRelativeTime(runtime.last_check_time, now, t)],
  ]

  return (
    <Accordion type="single" collapsible className="rounded-md border bg-muted/25 px-3">
      <AccordionItem value={value} className="border-b-0">
        <AccordionTrigger className="py-3 hover:no-underline">
          <div className="min-w-0 text-left">
            <div className="text-[11px] font-semibold tracking-[0.04em] text-foreground/85">
              {title}
            </div>
            <div className="mt-1 truncate text-sm font-medium text-foreground">
              {runtime.agent_name}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-muted-foreground">PID {runtime.pid}</span>
              <Badge className={cn('border', statusMeta.tone)}>{statusMeta.label}</Badge>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="pb-3">
          <div className="grid gap-1 text-[11px] text-muted-foreground">
            {details.map(([label, detailValue]) => (
              <DetailRow key={label} label={label} value={detailValue} />
            ))}
            {runtime.error_message ? (
              <div className="rounded-md border bg-background/80 p-2 text-[11px] text-foreground">
                {runtime.error_message}
              </div>
            ) : null}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

function HealthAgentCard({
  agent,
  now,
  onAcknowledgeOffline,
  t,
}: {
  agent: AgentHealthStatus
  now: number
  onAcknowledgeOffline?: (pid: number) => Promise<void>
  t: TFunction
}) {
  const statusMeta = getStatusMeta(agent.overall_status, t)
  const adapterMeta = getAdapterStatusMeta(agent.adapter_status, t)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const canAcknowledge = canAcknowledgeManagedAgent(agent)
  const details = [
    [t('insight.health.detail.wittyStatus'), agent.witty_status || '—'],
    [t('insight.health.detail.gatewayPort'), agent.gateway_port?.toString() || '—'],
    ['Adapter', agent.adapter_type || '—'],
    [t('insight.health.detail.sandbox'), agent.sandbox_type || '—'],
    [
      t('insight.health.detail.adapterLatency'),
      agent.adapter_latency_ms !== null ? `${agent.adapter_latency_ms} ms` : '—',
    ],
    ['Adapter PID', agent.adapter_pid?.toString() || '—'],
    agent.adapter_base_url ? ['Adapter URL', agent.adapter_base_url] : null,
  ].filter(Boolean) as Array<[string, string]>

  const handleAcknowledgeOffline = async () => {
    const runtimePid = agent.runtime?.pid
    if (!onAcknowledgeOffline || !runtimePid) {
      return
    }

    setRemoving(true)
    setRemoveError(null)

    try {
      await onAcknowledgeOffline(runtimePid)
      setConfirmOpen(false)
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : t('insight.health.removeFailed'))
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="rounded-lg border bg-background/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="text-[11px] font-semibold tracking-[0.04em] text-foreground/85">
            Witty Agent
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('inline-flex h-2.5 w-2.5 rounded-full', statusMeta.dot)} />
            <div className="truncate text-sm font-medium text-foreground">
              {agent.witty_agent_name}
            </div>
          </div>
          <div className="truncate text-xs text-muted-foreground">{agent.witty_agent_id}</div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Badge className={cn('border', statusMeta.tone)}>{statusMeta.label}</Badge>
          <Badge className={cn('border', adapterMeta.tone)}>{adapterMeta.label}</Badge>
        </div>
      </div>

      <div className="mt-3 space-y-2 text-xs text-muted-foreground">
        {details.map(([label, value]) => (
          <DetailRow key={label} label={label} value={value} />
        ))}
        {agent.status_reason ? (
          <div className="rounded-md border bg-muted/50 p-2 text-xs text-foreground">
            {agent.status_reason}
          </div>
        ) : null}
        {agent.adapter_error_message && agent.adapter_error_message !== agent.status_reason ? (
          <div className="rounded-md border bg-background/80 p-2 text-xs text-foreground">
            {agent.adapter_error_message}
          </div>
        ) : null}
      </div>

      {agent.runtime ? (
        <div className="mt-3">
          <RuntimeCard
            runtime={agent.runtime}
            now={now}
            title={t('insight.health.primaryRuntime')}
            value={`${agent.witty_agent_id}-primary`}
            t={t}
          />
        </div>
      ) : null}

      {agent.candidate_runtimes.length > 0 ? (
        <div className="mt-3 space-y-2">
          {agent.candidate_runtimes.map(runtime => (
            <RuntimeCard
              key={`${agent.witty_agent_id}-${runtime.pid}`}
              runtime={runtime}
              now={now}
              title={t('insight.health.candidateRuntime')}
              value={`${agent.witty_agent_id}-${runtime.pid}`}
              t={t}
            />
          ))}
        </div>
      ) : null}

      {canAcknowledge ? (
        <div className="mt-3 flex justify-end">
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={removing}
              onClick={() => {
                setConfirmOpen(true)
              }}
            >
              {removing ? <Spinner className="mr-2 h-3.5 w-3.5" /> : null}
              {t('insight.health.acknowledge')}
            </Button>

            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('insight.health.confirmRemoveTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('insight.health.confirmRemoveDescription')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={removing}>{t('common:action.cancel')}</AlertDialogCancel>
                  <Button
                    type="button"
                    disabled={removing}
                    onClick={() => {
                      void handleAcknowledgeOffline()
                    }}
                  >
                    {removing ? <Spinner className="mr-2 h-3.5 w-3.5" /> : null}
                    {t('insight.health.confirmRemove')}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        </div>
      ) : null}

      {removeError ? <div className="mt-2 text-xs text-destructive">{removeError}</div> : null}
    </div>
  )
}

interface InsightHealthRailProps {
  controller: InsightOverviewHealthController
}

export function InsightHealthRail({ controller }: InsightHealthRailProps) {
  const { t } = useTranslation('tool-panel')
  const summary = summarizeManagedHealthAgents(controller.agents)
  const hasAttention = summary.attentionCount > 0
  const [expanded, setExpanded] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(Date.now())
    }, 30000)

    return () => {
      window.clearInterval(timerId)
    }
  }, [])

  if (controller.loading) {
    return (
      <div className="w-10 overflow-hidden rounded-l-2xl border border-r-0 bg-background/95 shadow-lg">
        <div className="flex h-[640px] w-10 flex-col items-center gap-3 border-r bg-muted/40 px-1 py-4 text-muted-foreground">
          <HeartPulse className="h-4 w-4 animate-pulse" />
          <span className="[writing-mode:vertical-rl] text-[12px] font-semibold tracking-[0.16em]">
            {t('insight.health.title')}
          </span>
        </div>
      </div>
    )
  }

  const badges = (
    <div className="flex flex-wrap gap-2">
      <Badge variant="outline">{t('insight.health.total', { count: controller.agents.length })}</Badge>
      <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">
        {t('insight.health.healthyCount', { count: summary.healthyCount })}
      </Badge>
      {summary.degradedCount > 0 ? (
        <Badge className="border border-amber-200 bg-amber-50 text-amber-700">
          {t('insight.health.degradedCount', { count: summary.degradedCount })}
        </Badge>
      ) : null}
      {summary.missingRuntimeCount > 0 ? (
        <Badge className="border border-red-200 bg-red-50 text-red-700">
          {t('insight.health.missingRuntimeCount', { count: summary.missingRuntimeCount })}
        </Badge>
      ) : null}
      {summary.ambiguousCount > 0 ? (
        <Badge className="border border-orange-200 bg-orange-50 text-orange-700">
          {t('insight.health.ambiguousCount', { count: summary.ambiguousCount })}
        </Badge>
      ) : null}
      {summary.offlineCount > 0 ? (
        <Badge className="border border-red-200 bg-red-50 text-red-700">
          {t('insight.health.offlineCount', { count: summary.offlineCount })}
        </Badge>
      ) : null}
      {summary.hungCount > 0 ? (
        <Badge className="border border-orange-200 bg-orange-50 text-orange-700">
          {t('insight.health.hungCount', { count: summary.hungCount })}
        </Badge>
      ) : null}
      {summary.unhealthyCount > 0 ? (
        <Badge className="border border-red-200 bg-red-50 text-red-700">
          {t('insight.health.unhealthyCount', { count: summary.unhealthyCount })}
        </Badge>
      ) : null}
    </div>
  )

  const contentBody = controller.error ? (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>{t('insight.health.loadFailed')}</AlertTitle>
      <AlertDescription>{controller.error}</AlertDescription>
    </Alert>
  ) : controller.agents.length === 0 ? (
    <Empty className="border-muted bg-background/60 py-10">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HeartPulse />
        </EmptyMedia>
        <EmptyTitle>{t('insight.health.empty')}</EmptyTitle>
      </EmptyHeader>
    </Empty>
  ) : (
    <ScrollArea className="h-[520px] pr-3">
      <div className="space-y-3 pb-1">
        {controller.agents.map(agent => (
          <HealthAgentCard
            key={agent.witty_agent_id}
            agent={agent}
            now={now}
            onAcknowledgeOffline={controller.acknowledgeOfflineAgent}
            t={t}
          />
        ))}
      </div>
    </ScrollArea>
  )

  return (
    <div
      className={cn(
        'overflow-hidden rounded-l-2xl border border-r-0 bg-background/95 shadow-lg backdrop-blur transition-[width] duration-300',
        hasAttention && !expanded && 'border-red-200 bg-red-50/60 shadow-red-100/70'
      )}
      style={{ width: expanded ? DRAWER_WIDTH : 40 }}
    >
      <div className="flex h-[640px]">
        <button
          type="button"
          className={cn(
            'flex w-10 shrink-0 flex-col items-center gap-3 border-r px-1 py-4 text-center transition-colors',
            hasAttention
              ? 'bg-red-50/70 text-red-700 hover:bg-red-100/80'
              : 'bg-muted/40 hover:bg-muted/60'
          )}
          onClick={() => {
            setExpanded(currentValue => !currentValue)
          }}
        >
          <HeartPulse
            className={cn('h-4 w-4', hasAttention ? 'text-red-600' : 'text-muted-foreground')}
          />
          <span className="[writing-mode:vertical-rl] text-[13px] font-semibold tracking-[0.18em] text-foreground">
            {t('insight.health.title')}
          </span>
          <Badge variant="outline" className="px-1 text-[9px]">
            {controller.agents.length}
          </Badge>
          {summary.attentionCount > 0 ? (
            <Badge className="border border-red-200 bg-red-50 px-1 text-[9px] text-red-700">
              {summary.attentionCount}
            </Badge>
          ) : null}
          {controller.error ? (
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
          ) : null}
          {expanded ? (
            <ChevronRight className="mt-auto h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronLeft className="mt-auto h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {expanded ? (
          <div className="min-w-0 flex-1 space-y-3 p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Activity className="h-3.5 w-3.5" />
              {formatClockTime(controller.lastScanTime, t)}
            </div>
            {badges}
            {contentBody}
          </div>
        ) : null}
      </div>
    </div>
  )
}
