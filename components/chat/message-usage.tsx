'use client'

import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Gauge } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { MessageUsage } from '@/lib/types'

/** 紧凑计数：≥ 百万/万才缩写（11.9M / 46.6K），以下保留千分位原值。 */
export function formatCompactTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 10_000) return `${(count / 1_000).toFixed(1)}K`
  return count.toLocaleString('en-US')
}

/** 精确计数（明细行用）：千分位，不缩写。 */
function exactTokens(count: number): string {
  return count.toLocaleString('en-US')
}

/** 成本：小额成本（opencode 常见 1e-4 量级）保留 4 位小数，避免四舍五入成 $0.00。 */
export function formatCost(cost: number): string {
  return cost >= 0.01 ? cost.toFixed(2) : cost.toFixed(4)
}

/**
 * 缓存命中率 = 缓存读 / (缓存读 + 未缓存输入)。
 * 上游未提供其中任一项时返回 null（宁可不显示，也不显示一个假比例）。
 */
export function cacheHitRate(usage: MessageUsage): string | null {
  const read = usage.cacheReadTokens
  const input = usage.inputTokens
  if (typeof read !== 'number' || typeof input !== 'number') return null
  const promptTokens = read + input
  if (promptTokens <= 0) return null
  return `${((read / promptTokens) * 100).toFixed(1)}%`
}

/** 总量：优先用上游给的 totalTokens，缺失时按契约口径（四项相加）派生。 */
function totalTokensOf(usage: MessageUsage): number | null {
  if (typeof usage.totalTokens === 'number') return usage.totalTokens
  const parts = [
    usage.inputTokens,
    usage.outputTokens,
    usage.cacheReadTokens,
    usage.cacheWriteTokens,
  ]
  const present = parts.filter((value): value is number => typeof value === 'number')
  if (present.length === 0) return null
  return present.reduce((sum, value) => sum + value, 0)
}

interface UsageDetailRow {
  key: string
  label: string
  value: string
}

/**
 * 本轮用量徽标：与「复制 / 重新生成」同排，点击展开明细弹层。
 * 显示时机由调用方决定（与复制/重新生成共用同一层淡入淡出，悬停本条消息才出现）。
 *
 * ``usage`` 是**本轮**（跨 step 累计）的增量，不是会话累计值；
 * 流式期间不渲染（用量尚未累计完成），由调用方按 ``isStreaming`` 门控。
 */
export const MessageUsageBadge = memo(function MessageUsageBadge({
  usage,
  className,
  onOpenChange,
}: {
  usage: MessageUsage
  className?: string
  /** 明细弹层开合通知：调用方据此在弹层展开时保持徽标可见（不随后续移出悬停而淡出） */
  onOpenChange?: (open: boolean) => void
}) {
  const { t } = useTranslation('chat')

  const total = totalTokensOf(usage)
  // 没有任何 token 计数（例如上游只给了成本）时不渲染，避免一个空徽标
  if (total === null) return null
  const hitRate = cacheHitRate(usage)

  const rows: UsageDetailRow[] = []
  if (hitRate !== null) {
    rows.push({ key: 'cacheHitRate', label: t('message.usage.cacheHitRate'), value: hitRate })
  }
  if (typeof usage.inputTokens === 'number') {
    rows.push({
      key: 'uncachedInput',
      label: t('message.usage.uncachedInput'),
      value: `${exactTokens(usage.inputTokens)} tok`,
    })
  }
  if (typeof usage.cacheReadTokens === 'number') {
    rows.push({
      key: 'cacheRead',
      label: t('message.usage.cacheRead'),
      value: `${exactTokens(usage.cacheReadTokens)} tok`,
    })
  }
  // 缓存写几乎恒为 0，不占位（与「只展示有值的项」一致）
  if (typeof usage.cacheWriteTokens === 'number' && usage.cacheWriteTokens > 0) {
    rows.push({
      key: 'cacheWrite',
      label: t('message.usage.cacheWrite'),
      value: `${exactTokens(usage.cacheWriteTokens)} tok`,
    })
  }
  if (typeof usage.outputTokens === 'number') {
    const reasoning = usage.reasoningTokens
    rows.push({
      key: 'output',
      label: t('message.usage.output'),
      value:
        typeof reasoning === 'number' && reasoning > 0
          ? t('message.usage.outputWithReasoning', {
              count: exactTokens(usage.outputTokens),
              reasoning: exactTokens(reasoning),
            })
          : `${exactTokens(usage.outputTokens)} tok`,
    })
  }
  if (typeof usage.totalCost === 'number') {
    rows.push({
      key: 'cost',
      label: t('message.usage.costLabel'),
      value: `$${formatCost(usage.totalCost)}`,
    })
  }

  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            // 无边框胶囊：静态时只是一行图标 + 文本，悬停时才浮出淡底色
            'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[13px] leading-5 transition-colors hover:bg-muted hover:text-foreground',
            className
          )}
        >
          <Gauge className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{t('message.usage.badge', { tokens: formatCompactTokens(total) })}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3 text-xs">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
          <span className="text-muted-foreground">{t('message.usage.title')}</span>
          <span className="font-medium">{exactTokens(total)} tok</span>
        </div>
        <dl className="mt-2 space-y-1">
          {rows.map(row => (
            <div key={row.key} className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="font-mono">{row.value}</dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  )
})
