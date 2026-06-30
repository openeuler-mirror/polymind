'use client'

import { useMemo, useState } from 'react'
import { Download, FileText, RefreshCw } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { useInsightAtif } from '@/hooks/insight/use-atif'
import type { AtifDocument, InsightAtifSource, InsightAtifTarget } from '@/hooks/insight/types'
import { cn } from '@/lib/utils'
import { InsightAtifStepCard } from './atif-step-card'

function fmtTokens(value: number): string {
  return value.toLocaleString('zh-CN')
}

function shortId(id: string, length = 20): string {
  return id.length > length ? `${id.slice(0, length)}...` : id
}

function DetailPill({ value, mono = false }: { value: string; mono?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center rounded-md border border-border/70 bg-muted/35 px-2.5 py-1 text-[11px] leading-none tracking-[0.01em] text-foreground/90',
        mono ? 'font-mono tabular-nums' : 'font-medium'
      )}
      title={value}
    >
      {value}
    </span>
  )
}

function AgentInfoCard({
  doc,
  idLabel,
  idValue,
}: {
  doc: AtifDocument
  idLabel: string
  idValue: string
}) {
  const toolCount = doc.agent.tool_definitions?.length ?? 0

  return (
    <Card className="gap-4 py-4 xl:col-span-2">
      <CardHeader className="pb-1 pt-1">
        <CardTitle className="text-base">Agent 信息</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pb-2 pt-1 text-sm">
        {[
          { label: '名称', value: doc.agent.name },
          { label: '版本', value: doc.agent.version },
          { label: '模型', value: doc.agent.model_name ?? '—' },
          { label: '工具定义', value: `${toolCount} 个` },
          { label: idLabel, value: idValue },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{label}</span>
            <div className="max-w-[70%] truncate">
              <DetailPill value={String(value)} mono={label.endsWith('ID')} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="pb-1 pt-1">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className={cn('text-2xl font-semibold', color)}>{value}</div>
      </CardHeader>
    </Card>
  )
}

function AtifQueryCard({
  initialTarget,
  onSelectTarget,
}: {
  initialTarget: InsightAtifTarget | null
  onSelectTarget: (target: InsightAtifTarget | null) => void
}) {
  const [querySource, setQuerySource] = useState<InsightAtifSource>(
    initialTarget?.source ?? 'session'
  )
  const [queryId, setQueryId] = useState(initialTarget?.id ?? '')

  const handleLoad = () => {
    const nextId = queryId.trim()
    if (!nextId) {
      return
    }

    onSelectTarget({
      source: querySource,
      id: nextId,
      description: nextId,
    })
  }

  const handleReset = () => {
    setQuerySource('session')
    setQueryId('')
    onSelectTarget(null)
  }

  return (
    <Card className="gap-4 py-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">轨迹查询</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 pt-0 lg:grid-cols-[180px_minmax(0,1fr)_120px]">
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">查询类型</div>
          <Select
            value={querySource}
            onValueChange={value => {
              setQuerySource(value as InsightAtifSource)
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="session">Session</SelectItem>
              <SelectItem value="conversation">Conversation</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">
            {querySource === 'session' ? 'Session ID' : 'Conversation ID'}
          </div>
          <Input
            value={queryId}
            onChange={event => {
              setQueryId(event.target.value)
            }}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                handleLoad()
              }
            }}
            placeholder={querySource === 'session' ? '输入 Session ID' : '输入 Conversation ID'}
          />
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">查询</div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleLoad} disabled={!queryId.trim()}>
              查询
            </Button>
            <Button variant="outline" onClick={handleReset} disabled={!queryId && !initialTarget}>
              清空
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function InsightAtifPanel({
  target,
  onSelectTarget,
}: {
  target: InsightAtifTarget | null
  onSelectTarget: (target: InsightAtifTarget | null) => void
}) {
  const { doc, loading, error, refresh, downloadJson } = useInsightAtif(target)

  const computedMetrics = useMemo(() => {
    if (!doc) {
      return null
    }

    const finalMetrics = doc.final_metrics
    let promptTokens = 0
    let completionTokens = 0
    let cachedTokens = 0

    for (const step of doc.steps) {
      if (step.metrics) {
        promptTokens += step.metrics.prompt_tokens ?? 0
        completionTokens += step.metrics.completion_tokens ?? 0
        cachedTokens += step.metrics.cached_tokens ?? 0
      }
    }

    return {
      steps: finalMetrics?.total_steps ?? doc.steps.length,
      prompt: finalMetrics?.total_prompt_tokens ?? promptTokens,
      completion: finalMetrics?.total_completion_tokens ?? completionTokens,
      cached: finalMetrics?.total_cached_tokens ?? cachedTokens,
    }
  }, [doc])

  const targetIdLabel = target?.source === 'conversation' ? 'Conversation ID' : 'Session ID'
  const targetIdValue = target?.id ?? doc?.session_id ?? '—'

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <AtifQueryCard
        key={target ? `${target.source}:${target.id}` : 'empty'}
        initialTarget={target}
        onSelectTarget={onSelectTarget}
      />

      <Card className="overflow-hidden">
        <CardHeader className="space-y-3 pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <CardTitle className="text-base">轨迹详情</CardTitle>

            <div className="flex flex-wrap items-center gap-2">
              {target ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void refresh()}
                  disabled={loading}
                >
                  <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                  刷新
                </Button>
              ) : null}
              {doc ? (
                <Button size="sm" onClick={downloadJson}>
                  <Download className="h-4 w-4" />
                  导出 JSON
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        {!target ? (
          <CardContent className="flex min-h-[320px] items-center justify-center py-10">
            <Empty className="border-muted bg-background/60">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileText />
                </EmptyMedia>
                <EmptyTitle>请输入查询条件</EmptyTitle>
              </EmptyHeader>
            </Empty>
          </CardContent>
        ) : loading ? (
          <CardContent className="flex min-h-[320px] items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Spinner className="h-4 w-4" />
            正在加载轨迹详情...
          </CardContent>
        ) : error ? (
          <CardContent className="pb-6">
            <Alert variant="destructive">
              <AlertTitle>轨迹详情加载失败</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </CardContent>
        ) : doc ? (
          <CardContent className="space-y-4 pb-6">
            <div className="grid gap-4 lg:grid-cols-5">
              <AgentInfoCard doc={doc} idLabel={targetIdLabel} idValue={targetIdValue} />
              <MetricCard
                label="总步骤数"
                value={String(computedMetrics?.steps ?? doc.steps.length)}
                color="text-indigo-600"
              />
              <MetricCard
                label="总输入 Token"
                value={fmtTokens(computedMetrics?.prompt ?? 0)}
                color="text-sky-600"
              />
              <MetricCard
                label="总输出 Token"
                value={fmtTokens(computedMetrics?.completion ?? 0)}
                color="text-emerald-600"
              />
            </div>

            <div>
              <div className="mb-4 flex items-end justify-between gap-3">
                <h2 className="text-lg font-semibold text-foreground">交互轨迹</h2>
                <DetailPill value={shortId(targetIdValue, 28)} mono />
              </div>

              {doc.steps.length === 0 ? (
                <Card>
                  <CardContent className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                    当前轨迹暂无步骤数据
                  </CardContent>
                </Card>
              ) : (
                <div className="relative pl-4">
                  <div className="absolute bottom-4 left-[5px] top-4 w-0.5 bg-border" />
                  {doc.steps.map(step => (
                    <InsightAtifStepCard key={step.step_id} step={step} />
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        ) : null}
      </Card>
    </div>
  )
}
