'use client'

import { useState } from 'react'
import { Activity, AlertCircle, ChevronLeft, ChevronRight, HeartPulse } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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

const STATUS_META: Record<
  AgentHealthStatus['overall_status'],
  { label: string; dot: string; tone: string }
> = {
  healthy: {
    label: '正常',
    dot: 'bg-emerald-500',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  degraded: {
    label: '降级',
    dot: 'bg-amber-500',
    tone: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  missing_runtime: {
    label: '缺失 Runtime',
    dot: 'bg-red-600',
    tone: 'border-red-200 bg-red-50 text-red-700',
  },
  ambiguous: {
    label: '匹配冲突',
    dot: 'bg-orange-500',
    tone: 'border-orange-200 bg-orange-50 text-orange-700',
  },
  unhealthy: {
    label: '异常',
    dot: 'bg-red-500',
    tone: 'border-red-200 bg-red-50 text-red-700',
  },
  hung: {
    label: '卡顿',
    dot: 'bg-orange-500',
    tone: 'border-orange-200 bg-orange-50 text-orange-700',
  },
  unknown: {
    label: '未知',
    dot: 'bg-amber-500',
    tone: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  no_port: {
    label: '无端口',
    dot: 'bg-slate-500',
    tone: 'border-slate-200 bg-slate-50 text-slate-700',
  },
  offline: {
    label: '已下线',
    dot: 'bg-red-700',
    tone: 'border-red-200 bg-red-50 text-red-700',
  },
}

function getAdapterStatusMeta(status: string | null) {
  if (status === 'healthy') {
    return {
      label: 'Adapter 正常',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    }
  }

  if (status === 'hung') {
    return {
      label: 'Adapter 卡顿',
      tone: 'border-orange-200 bg-orange-50 text-orange-700',
    }
  }

  if (status === 'offline' || status === 'unhealthy') {
    return {
      label: 'Adapter 异常',
      tone: 'border-red-200 bg-red-50 text-red-700',
    }
  }

  if (status === 'unknown') {
    return {
      label: 'Adapter 未知',
      tone: 'border-amber-200 bg-amber-50 text-amber-700',
    }
  }

  return {
    label: 'Adapter 未就绪',
    tone: 'border-slate-200 bg-slate-50 text-slate-700',
  }
}

function formatRelativeTime(timestampMs: number | null): string {
  if (!timestampMs) {
    return '—'
  }

  const diffSeconds = Math.floor((Date.now() - timestampMs) / 1000)

  if (diffSeconds < 5) {
    return '刚刚'
  }

  if (diffSeconds < 60) {
    return `${diffSeconds} 秒前`
  }

  if (diffSeconds < 3600) {
    return `${Math.floor(diffSeconds / 60)} 分钟前`
  }

  return `${Math.floor(diffSeconds / 3600)} 小时前`
}

function formatClockTime(timestampMs: number | null): string {
  if (!timestampMs) {
    return '尚未扫描'
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
  title,
  value,
}: {
  runtime: AgentRuntimeHealthStatus
  title: string
  value: string
}) {
  const statusMeta = STATUS_META[runtime.status]
  const details = [
    ['端口', formatPorts(runtime.ports)],
    ['延迟', runtime.latency_ms !== null ? `${runtime.latency_ms} ms` : '—'],
    ['分类', runtime.category || '—'],
    ['最近检查', formatRelativeTime(runtime.last_check_time)],
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
  onAcknowledgeOffline,
}: {
  agent: AgentHealthStatus
  onAcknowledgeOffline?: (pid: number) => Promise<void>
}) {
  const statusMeta = STATUS_META[agent.overall_status]
  const adapterMeta = getAdapterStatusMeta(agent.adapter_status)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const canAcknowledge = canAcknowledgeManagedAgent(agent)
  const details = [
    ['Witty 状态', agent.witty_status || '—'],
    ['Gateway 端口', agent.gateway_port?.toString() || '—'],
    ['Adapter', agent.adapter_type || '—'],
    ['沙箱', agent.sandbox_type || '—'],
    ['Adapter 延迟', agent.adapter_latency_ms !== null ? `${agent.adapter_latency_ms} ms` : '—'],
    ['Adapter PID', agent.adapter_pid?.toString() || '—'],
    agent.adapter_base_url ? ['Adapter URL', agent.adapter_base_url] : null,
  ].filter(Boolean) as Array<[string, string]>

  const handleAcknowledgeOffline = async () => {
    const runtimePid = agent.runtime?.pid
    if (!onAcknowledgeOffline || !runtimePid) {
      return
    }

    const confirmed = window.confirm('确认将该离线 runtime 从健康状态列表中移除吗？')
    if (!confirmed) {
      return
    }

    setRemoving(true)
    setRemoveError(null)

    try {
      await onAcknowledgeOffline(runtimePid)
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : '移除失败，请稍后重试')
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
            title="Primary Runtime"
            value={`${agent.witty_agent_id}-primary`}
          />
        </div>
      ) : null}

      {agent.candidate_runtimes.length > 0 ? (
        <div className="mt-3 space-y-2">
          {agent.candidate_runtimes.map(runtime => (
            <RuntimeCard
              key={`${agent.witty_agent_id}-${runtime.pid}`}
              runtime={runtime}
              title="候选 Runtime"
              value={`${agent.witty_agent_id}-${runtime.pid}`}
            />
          ))}
        </div>
      ) : null}

      {canAcknowledge ? (
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={removing}
            onClick={() => {
              void handleAcknowledgeOffline()
            }}
          >
            {removing ? <Spinner className="mr-2 h-3.5 w-3.5" /> : null}
            确认下线并移除
          </Button>
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
  const summary = summarizeManagedHealthAgents(controller.agents)
  const hasAttention = summary.attentionCount > 0
  const [expanded, setExpanded] = useState(false)

  if (controller.loading) {
    return (
      <div className="w-10 overflow-hidden rounded-l-2xl border border-r-0 bg-background/95 shadow-lg">
        <div className="flex h-[640px] w-10 flex-col items-center gap-3 border-r bg-muted/40 px-1 py-4 text-muted-foreground">
          <HeartPulse className="h-4 w-4 animate-pulse" />
          <span className="[writing-mode:vertical-rl] text-[12px] font-semibold tracking-[0.16em]">
            健康状态
          </span>
        </div>
      </div>
    )
  }

  const badges = (
    <div className="flex flex-wrap gap-2">
      <Badge variant="outline">总计 {controller.agents.length}</Badge>
      <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">
        正常 {summary.healthyCount}
      </Badge>
      {summary.degradedCount > 0 ? (
        <Badge className="border border-amber-200 bg-amber-50 text-amber-700">
          降级 {summary.degradedCount}
        </Badge>
      ) : null}
      {summary.missingRuntimeCount > 0 ? (
        <Badge className="border border-red-200 bg-red-50 text-red-700">
          缺失 Runtime {summary.missingRuntimeCount}
        </Badge>
      ) : null}
      {summary.ambiguousCount > 0 ? (
        <Badge className="border border-orange-200 bg-orange-50 text-orange-700">
          冲突 {summary.ambiguousCount}
        </Badge>
      ) : null}
      {summary.offlineCount > 0 ? (
        <Badge className="border border-red-200 bg-red-50 text-red-700">
          下线 {summary.offlineCount}
        </Badge>
      ) : null}
      {summary.hungCount > 0 ? (
        <Badge className="border border-orange-200 bg-orange-50 text-orange-700">
          卡顿 {summary.hungCount}
        </Badge>
      ) : null}
      {summary.unhealthyCount > 0 ? (
        <Badge className="border border-red-200 bg-red-50 text-red-700">
          异常 {summary.unhealthyCount}
        </Badge>
      ) : null}
    </div>
  )

  const contentBody = controller.error ? (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>健康状态加载失败</AlertTitle>
      <AlertDescription>{controller.error}</AlertDescription>
    </Alert>
  ) : controller.agents.length === 0 ? (
    <Empty className="border-muted bg-background/60 py-10">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HeartPulse />
        </EmptyMedia>
        <EmptyTitle>当前没有 Agent 健康数据</EmptyTitle>
      </EmptyHeader>
    </Empty>
  ) : (
    <ScrollArea className="h-[520px] pr-3">
      <div className="space-y-3 pb-1">
        {controller.agents.map(agent => (
          <HealthAgentCard
            key={agent.witty_agent_id}
            agent={agent}
            onAcknowledgeOffline={controller.acknowledgeOfflineAgent}
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
            健康状态
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
              {formatClockTime(controller.lastScanTime)}
            </div>
            {badges}
            {contentBody}
          </div>
        ) : null}
      </div>
    </div>
  )
}
