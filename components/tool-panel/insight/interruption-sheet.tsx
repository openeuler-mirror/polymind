'use client'

import { useState } from 'react'
import { AlertCircle, CircleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Spinner } from '@/components/ui/spinner'
import type { InterruptionRecord, InterruptionSeverity } from '@/hooks/insight/types'
import { cn } from '@/lib/utils'

const TYPE_LABELS: Record<string, string> = {
  llm_error: 'LLM Error',
  sse_truncated: 'SSE Truncated',
  agent_crash: 'Agent Crash',
  token_limit: 'Token Limit',
  context_overflow: 'Context Overflow',
}

const SEVERITY_META: Record<
  InterruptionSeverity,
  { label: string; className: string; titleClassName: string }
> = {
  critical: {
    label: '严重风险',
    className: 'border-red-200 bg-red-50 text-red-700',
    titleClassName: 'text-red-700',
  },
  high: {
    label: '高风险',
    className: 'border-orange-200 bg-orange-50 text-orange-700',
    titleClassName: 'text-orange-700',
  },
  medium: {
    label: '中风险',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
    titleClassName: 'text-amber-700',
  },
  low: {
    label: '低风险',
    className: 'border-sky-200 bg-sky-50 text-sky-700',
    titleClassName: 'text-sky-700',
  },
}

function formatNs(ns: number): string {
  return new Date(ns / 1_000_000).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function getTypeLabel(interruptionType: string): string {
  return TYPE_LABELS[interruptionType] ?? interruptionType
}

function formatDetail(detail: string | null) {
  if (!detail) {
    return '暂无 detail'
  }

  try {
    return JSON.stringify(JSON.parse(detail), null, 2)
  } catch {
    return detail
  }
}

function InterruptionDetailCard({
  record,
  onResolve,
}: {
  record: InterruptionRecord
  onResolve?: (record: InterruptionRecord) => Promise<void>
}) {
  const severityMeta = SEVERITY_META[record.severity]
  const [resolving, setResolving] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)

  const handleResolve = async () => {
    const confirmed = window.confirm(
      '标记为已处理后，此中断事件将不再计入异常统计。\n\n确认标记为已处理吗？'
    )

    if (!confirmed || !onResolve) {
      return
    }

    setResolving(true)
    setResolveError(null)

    try {
      await onResolve(record)
    } catch (error) {
      setResolveError(error instanceof Error ? error.message : '操作失败，请稍后重试')
    } finally {
      setResolving(false)
    }
  }

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={cn('text-sm font-semibold', severityMeta.titleClassName)}>
              {getTypeLabel(record.interruption_type)}
            </h3>
            <Badge className={cn('border', severityMeta.className)}>{severityMeta.label}</Badge>
            {record.pid != null ? (
              <Badge variant="outline" className="font-mono text-[11px]">
                PID {record.pid}
              </Badge>
            ) : null}
          </div>
          <div className="text-xs text-muted-foreground">{formatNs(record.occurred_at_ns)}</div>
        </div>

        {onResolve ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={resolving}
            onClick={handleResolve}
          >
            {resolving ? <Spinner className="mr-2 h-3.5 w-3.5" /> : null}
            标记已处理
          </Button>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Detail
        </div>
        <pre className="whitespace-pre-wrap break-words rounded-lg border bg-muted/40 px-4 py-3 text-sm leading-7 text-foreground">
          {formatDetail(record.detail)}
        </pre>
      </div>

      {resolveError ? <div className="text-xs text-destructive">{resolveError}</div> : null}
    </div>
  )
}

interface InsightInterruptionSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  records: InterruptionRecord[]
  loading: boolean
  error: string | null
  onResolveRecord?: (record: InterruptionRecord) => Promise<void>
}

export function InsightInterruptionSheet({
  open,
  onOpenChange,
  title,
  records,
  loading,
  error,
  onResolveRecord,
}: InsightInterruptionSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[78vh] px-6 pb-6">
          {loading ? (
            <div className="flex min-h-60 items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
              <Spinner className="h-4 w-4" />
              正在加载异常中断详情...
            </div>
          ) : error ? (
            <div className="py-4">
              <Alert variant="destructive">
                <AlertCircle />
                <AlertTitle>异常中断详情加载失败</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          ) : records.length === 0 ? (
            <div className="py-4">
              <Empty className="border-muted bg-background/60">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CircleAlert />
                  </EmptyMedia>
                  <EmptyTitle>没有记录到异常中断</EmptyTitle>
                </EmptyHeader>
              </Empty>
            </div>
          ) : (
            <div className="space-y-3 py-4">
              {records.map(record => (
                <InterruptionDetailCard
                  key={record.interruption_id}
                  record={record}
                  onResolve={onResolveRecord}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
