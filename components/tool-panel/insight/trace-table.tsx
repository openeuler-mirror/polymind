'use client'

import { AlertCircle, ChevronDown, ChevronRight, FileText, MessageSquareText } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type {
  ConversationInterruptionCount,
  InsightAtifTarget,
  SessionInterruptionCount,
  SessionSummary,
  TraceSummary,
} from '@/hooks/insight/types'
import type {
  InsightOverviewInterruptionsController,
  InsightOverviewSessionsController,
  InsightOverviewStatusController,
} from '@/hooks/insight/use-overview'
import { cn } from '@/lib/utils'

function formatNs(ns: number): string {
  return new Date(ns / 1_000_000).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTokens(value: number): string {
  return value.toLocaleString('zh-CN')
}

function shortId(value: string, maxLength = 18): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}

function IdPill({ value, maxLength = 22 }: { value: string; maxLength?: number }) {
  return (
    <Badge
      variant="outline"
      title={value}
      className="max-w-full justify-start rounded-md bg-muted/40 font-mono text-[11px] tabular-nums text-foreground/90"
    >
      {shortId(value, maxLength)}
    </Badge>
  )
}

function getInterruptionTone(
  count: SessionInterruptionCount | ConversationInterruptionCount
): string {
  if (count.by_severity.critical > 0 || count.by_severity.high > 0) {
    return 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
  }

  if (count.by_severity.medium > 0) {
    return 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100'
  }

  return 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100'
}

function OverviewTableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  )
}

function InterruptionCountCell({
  count,
  loaded,
  onClick,
}: {
  count?: SessionInterruptionCount | ConversationInterruptionCount
  loaded: boolean
  onClick?: () => void
}) {
  if (!loaded) {
    return <span className="text-xs text-muted-foreground">—</span>
  }

  const total = count?.total ?? 0

  if (total === 0) {
    return (
      <Badge variant="outline" className="min-w-10 justify-center text-muted-foreground">
        0
      </Badge>
    )
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        'h-7 rounded-full px-2.5 text-xs',
        count ? getInterruptionTone(count) : undefined
      )}
      onClick={event => {
        event.stopPropagation()
        onClick?.()
      }}
    >
      <AlertCircle className="h-3.5 w-3.5" />
      详情
      <span className="rounded-full bg-background/70 px-1.5 py-0.5 font-mono text-[11px] leading-none">
        {total}
      </span>
    </Button>
  )
}

function TraceSubtable({
  traces,
  loading,
  error,
  conversationInterruptionCounts,
  conversationInterruptionCountsLoaded,
  onOpenConversationInterruptions,
  onOpenAtif,
}: {
  traces: TraceSummary[]
  loading: boolean
  error: string | null
  conversationInterruptionCounts: Record<string, ConversationInterruptionCount>
  conversationInterruptionCountsLoaded: boolean
  onOpenConversationInterruptions: (trace: TraceSummary) => void
  onOpenAtif: (target: InsightAtifTarget) => void
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
        <Spinner className="h-4 w-4" />
        加载对话轨迹中...
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive" className="rounded-none border-0">
        <AlertCircle />
        <AlertTitle>对话轨迹加载失败</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (traces.length === 0) {
    return (
      <div className="px-4 py-6">
        <Empty className="border-muted bg-background/60 py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessageSquareText />
            </EmptyMedia>
            <EmptyTitle className="text-base">当前会话暂无对话轨迹</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  return (
    <div className="px-4 py-4">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Conversation ID</TableHead>
              <TableHead className="min-w-[260px]">用户请求</TableHead>
              <TableHead>输入</TableHead>
              <TableHead>输出</TableHead>
              <TableHead>异常中断</TableHead>
              <TableHead className="w-24">详情</TableHead>
              <TableHead>开始时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {traces.map(trace => (
              <TableRow key={trace.trace_id} className="hover:bg-background/70">
                <TableCell className="text-xs text-muted-foreground">
                  <IdPill value={trace.conversation_id} maxLength={20} />
                </TableCell>
                <TableCell className="max-w-[340px] whitespace-normal text-sm text-foreground">
                  {trace.user_query || (
                    <span className="text-muted-foreground">暂无用户请求摘要</span>
                  )}
                </TableCell>
                <TableCell className="text-sm font-medium text-sky-700">
                  {formatTokens(trace.total_input_tokens)}
                </TableCell>
                <TableCell className="text-sm font-medium text-emerald-700">
                  {formatTokens(trace.total_output_tokens)}
                </TableCell>
                <TableCell>
                  <InterruptionCountCell
                    count={conversationInterruptionCounts[trace.conversation_id]}
                    loaded={conversationInterruptionCountsLoaded}
                    onClick={() => {
                      onOpenConversationInterruptions(trace)
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2.5"
                    onClick={event => {
                      event.stopPropagation()
                      onOpenAtif({
                        source: 'conversation',
                        id: trace.conversation_id,
                      })
                    }}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    详情
                  </Button>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatNs(trace.start_ns)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function SessionRow({
  session,
  expanded,
  onToggle,
  traces,
  traceLoading,
  traceError,
  sessionInterruptionCount,
  sessionInterruptionCountsLoaded,
  conversationInterruptionCounts,
  conversationInterruptionCountsLoaded,
  onOpenSessionInterruptions,
  onOpenConversationInterruptions,
  onOpenAtif,
}: {
  session: SessionSummary
  expanded: boolean
  onToggle: () => void
  traces: TraceSummary[]
  traceLoading: boolean
  traceError: string | null
  sessionInterruptionCount?: SessionInterruptionCount
  sessionInterruptionCountsLoaded: boolean
  conversationInterruptionCounts: Record<string, ConversationInterruptionCount>
  conversationInterruptionCountsLoaded: boolean
  onOpenSessionInterruptions: (session: SessionSummary) => void
  onOpenConversationInterruptions: (trace: TraceSummary) => void
  onOpenAtif: (target: InsightAtifTarget) => void
}) {
  return (
    <>
      <TableRow
        className={cn('cursor-pointer', expanded && 'bg-accent/30 hover:bg-accent/30')}
        onClick={onToggle}
      >
        <TableCell>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="text-muted-foreground"
            onClick={event => {
              event.stopPropagation()
              onToggle()
            }}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </TableCell>
        <TableCell className="text-xs text-foreground">
          <IdPill value={session.session_id} maxLength={22} />
        </TableCell>
        <TableCell className="text-sm">
          {session.agent_name || <span className="text-muted-foreground">未标记</span>}
        </TableCell>
        <TableCell>
          {session.model ? (
            <Badge className="max-w-[180px] truncate rounded-md border border-border/70 bg-muted/40 px-2.5 py-1 text-[11px] font-medium tracking-[0.01em] text-foreground">
              {session.model}
            </Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell>{session.conversation_count}</TableCell>
        <TableCell className="font-medium text-sky-700">
          {formatTokens(session.total_input_tokens)}
        </TableCell>
        <TableCell className="font-medium text-emerald-700">
          {formatTokens(session.total_output_tokens)}
        </TableCell>
        <TableCell>
          <InterruptionCountCell
            count={sessionInterruptionCount}
            loaded={sessionInterruptionCountsLoaded}
            onClick={() => {
              onOpenSessionInterruptions(session)
            }}
          />
        </TableCell>
        <TableCell>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5"
            onClick={event => {
              event.stopPropagation()
              onOpenAtif({
                source: 'session',
                id: session.session_id,
              })
            }}
          >
            <FileText className="h-3.5 w-3.5" />
            详情
          </Button>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {formatNs(session.last_seen_ns)}
        </TableCell>
      </TableRow>

      {expanded ? (
        <TableRow className="bg-accent/10 hover:bg-accent/10">
          <TableCell colSpan={10} className="p-0">
            <TraceSubtable
              traces={traces}
              loading={traceLoading}
              error={traceError}
              conversationInterruptionCounts={conversationInterruptionCounts}
              conversationInterruptionCountsLoaded={conversationInterruptionCountsLoaded}
              onOpenConversationInterruptions={onOpenConversationInterruptions}
              onOpenAtif={onOpenAtif}
            />
          </TableCell>
        </TableRow>
      ) : null}
    </>
  )
}

interface InsightTraceTableProps {
  sessionsController: InsightOverviewSessionsController
  interruptionsController: InsightOverviewInterruptionsController
  status: InsightOverviewStatusController
  onOpenAtif: (target: InsightAtifTarget) => void
}

export function InsightTraceTable({
  sessionsController,
  interruptionsController,
  status,
  onOpenAtif,
}: InsightTraceTableProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle className="text-base">会话列表</CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {status.refreshing ? <Spinner className="h-4 w-4" /> : null}共{' '}
            {sessionsController.sessions.length} 条
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {status.error ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>会话列表加载失败</AlertTitle>
            <AlertDescription>{status.error}</AlertDescription>
          </Alert>
        ) : status.loading ? (
          <OverviewTableSkeleton />
        ) : sessionsController.visibleSessions.length === 0 ? (
          <Empty className="border-muted bg-background/60">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageSquareText />
              </EmptyMedia>
              <EmptyTitle>当前没有可展示的会话</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-12" />
                    <TableHead>Session ID</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>模型</TableHead>
                    <TableHead>对话数</TableHead>
                    <TableHead>输入</TableHead>
                    <TableHead>输出</TableHead>
                    <TableHead>异常中断</TableHead>
                    <TableHead className="w-24">详情</TableHead>
                    <TableHead>最近活动</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessionsController.visibleSessions.map(session => (
                    <SessionRow
                      key={session.session_id}
                      session={session}
                      expanded={sessionsController.expandedSessionId === session.session_id}
                      onToggle={() => {
                        void sessionsController.toggleSession(session.session_id)
                      }}
                      traces={sessionsController.tracesBySessionId[session.session_id] || []}
                      traceLoading={
                        sessionsController.traceLoadingBySessionId[session.session_id] || false
                      }
                      traceError={
                        sessionsController.traceErrorBySessionId[session.session_id] || null
                      }
                      sessionInterruptionCount={
                        interruptionsController.sessionInterruptionCounts[session.session_id]
                      }
                      sessionInterruptionCountsLoaded={
                        interruptionsController.sessionInterruptionCountsLoaded
                      }
                      conversationInterruptionCounts={
                        interruptionsController.conversationInterruptionCounts
                      }
                      conversationInterruptionCountsLoaded={
                        interruptionsController.conversationInterruptionCountsLoaded
                      }
                      onOpenSessionInterruptions={sessionValue => {
                        void interruptionsController.openSessionInterruptions(sessionValue)
                      }}
                      onOpenConversationInterruptions={trace => {
                        void interruptionsController.openConversationInterruptions(trace)
                      }}
                      onOpenAtif={onOpenAtif}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>

            {sessionsController.sessionTotalPages > 1 ? (
              <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-muted-foreground">
                  显示 {sessionsController.sessionPage * sessionsController.pageSize + 1}-
                  {Math.min(
                    (sessionsController.sessionPage + 1) * sessionsController.pageSize,
                    sessionsController.sessions.length
                  )}{' '}
                  / {sessionsController.sessions.length}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={sessionsController.sessionPage === 0}
                    onClick={() =>
                      sessionsController.setSessionPage(
                        Math.max(0, sessionsController.sessionPage - 1)
                      )
                    }
                  >
                    上一页
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={
                      sessionsController.sessionPage === sessionsController.sessionTotalPages - 1
                    }
                    onClick={() =>
                      sessionsController.setSessionPage(
                        Math.min(
                          sessionsController.sessionTotalPages - 1,
                          sessionsController.sessionPage + 1
                        )
                      )
                    }
                  >
                    下一页
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
