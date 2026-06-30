import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { InsightOverviewSummary } from '@/hooks/insight/use-overview'
import { cn } from '@/lib/utils'

function formatTokens(value: number): string {
  return value.toLocaleString('zh-CN')
}

function SummarySkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index} className="gap-3 py-4">
          <CardHeader className="pb-1 pt-1">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-24" />
          </CardHeader>
        </Card>
      ))}
    </div>
  )
}

interface InsightOverviewSummaryCardsProps {
  interruptionCountLoaded: boolean
  loading: boolean
  summary: InsightOverviewSummary
}

export function InsightOverviewSummaryCards({
  interruptionCountLoaded,
  loading,
  summary,
}: InsightOverviewSummaryCardsProps) {
  if (loading) {
    return <SummarySkeleton />
  }

  const cards = [
    { label: '会话数', value: String(summary.sessionCount) },
    { label: '输入 Token', value: formatTokens(summary.totalInputTokens), tone: 'text-sky-700' },
    {
      label: '输出 Token',
      value: formatTokens(summary.totalOutputTokens),
      tone: 'text-emerald-700',
    },
    {
      label: '异常中断',
      value: interruptionCountLoaded ? String(summary.interruptionTotal ?? 0) : '—',
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map(card => (
        <Card key={card.label} className="gap-3 py-4">
          <CardHeader className="pb-1 pt-1">
            <div className="text-xs font-medium text-muted-foreground">{card.label}</div>
            <CardTitle className={cn('text-2xl', card.tone)}>{card.value}</CardTitle>
          </CardHeader>
        </Card>
      ))}
    </div>
  )
}
