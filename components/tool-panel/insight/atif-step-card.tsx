'use client'

import { useState, type ReactNode } from 'react'
import { MessageSquareText, Sparkles, Wrench } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import type { AtifStep, AtifToolCall } from '@/hooks/insight/types'
import { cn } from '@/lib/utils'

function fmtTokens(value: number): string {
  return value.toLocaleString('zh-CN')
}

function fmtTimestamp(iso?: string): string {
  if (!iso) {
    return '—'
  }

  try {
    return new Date(iso).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return iso
  }
}

function shortId(id: string, length = 20): string {
  return id.length > length ? `${id.slice(0, length)}...` : id
}

const SOURCE_STYLES: Record<string, { dot: string; badge: string; border: string; label: string }> =
  {
    system: {
      dot: 'bg-purple-500',
      badge: 'border-purple-200 bg-purple-50 text-purple-700',
      border: 'border-l-purple-400',
      label: '系统',
    },
    user: {
      dot: 'bg-blue-500',
      badge: 'border-blue-200 bg-blue-50 text-blue-700',
      border: 'border-l-blue-400',
      label: '用户',
    },
    agent: {
      dot: 'bg-emerald-500',
      badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      border: 'border-l-emerald-400',
      label: 'Agent',
    },
  }

function getSourceStyle(source: AtifStep['source']) {
  return (
    SOURCE_STYLES[source] ?? {
      dot: 'bg-slate-400',
      badge: 'border-slate-200 bg-slate-50 text-slate-700',
      border: 'border-l-slate-300',
      label: source,
    }
  )
}

function ExpandableText({ text, className }: { text: string; className?: string }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = text.length > 300
  const displayText = isLong && !expanded ? `${text.slice(0, 300)}...` : text

  return (
    <div>
      <pre
        className={cn(
          'max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-lg px-4 py-3 text-[14px] leading-7',
          className
        )}
      >
        {displayText}
      </pre>
      {isLong ? (
        <button
          type="button"
          onClick={() => setExpanded(currentValue => !currentValue)}
          className="mt-1 text-xs text-primary hover:underline"
        >
          {expanded ? '收起' : '展开全部'}
        </button>
      ) : null}
    </div>
  )
}

function ToolCallItem({ tc }: { tc: AtifToolCall }) {
  const [showArgs, setShowArgs] = useState(false)
  const argsStr =
    typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments, null, 2)
  const isLongArgs = argsStr.length > 200

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center gap-2 bg-muted/50 px-3 py-2">
        <span className="rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
          {tc.function_name}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {shortId(tc.tool_call_id, 16)}
        </span>
        {isLongArgs ? (
          <button
            type="button"
            onClick={() => setShowArgs(currentValue => !currentValue)}
            className="ml-auto text-xs text-primary hover:underline"
          >
            {showArgs ? '收起参数' : '展开参数'}
          </button>
        ) : null}
      </div>
      {!isLongArgs || showArgs ? (
        <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words bg-card px-4 py-3 font-mono text-[12px] leading-6 text-foreground">
          {argsStr}
        </pre>
      ) : null}
    </div>
  )
}

function StepSection({
  value,
  icon,
  title,
  count,
  children,
}: {
  value: string
  icon: ReactNode
  title: string
  count?: number
  children: ReactNode
}) {
  return (
    <AccordionItem value={value} className="rounded-lg border px-3 last:border-b">
      <AccordionTrigger className="py-3 text-sm hover:no-underline">
        <span className="flex items-center gap-2">
          {icon}
          <span className="font-medium text-foreground">{title}</span>
          {count !== undefined ? (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {count}
            </span>
          ) : null}
        </span>
      </AccordionTrigger>
      <AccordionContent className="pb-3">{children}</AccordionContent>
    </AccordionItem>
  )
}

export function InsightAtifStepCard({ step }: { step: AtifStep }) {
  const style = getSourceStyle(step.source)
  const sections: Array<{
    key: string
    icon: ReactNode
    title: string
    count?: number
    content: ReactNode
  }> = []

  if (step.reasoning_content?.trim()) {
    sections.push({
      key: 'reasoning',
      icon: <Sparkles className="h-4 w-4 text-purple-500" />,
      title: '推理过程',
      content: (
        <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/40 px-4 py-3 text-[14px] leading-7 text-foreground">
          {step.reasoning_content}
        </pre>
      ),
    })
  }

  if (step.tool_calls?.length) {
    sections.push({
      key: 'toolcalls',
      icon: <Wrench className="h-4 w-4 text-orange-500" />,
      title: '工具调用',
      count: step.tool_calls.length,
      content: (
        <div className="space-y-2">
          {step.tool_calls.map((toolCall, index) => (
            <ToolCallItem key={toolCall.tool_call_id || index} tc={toolCall} />
          ))}
        </div>
      ),
    })
  }

  if (step.observation?.results.length) {
    sections.push({
      key: 'observation',
      icon: <MessageSquareText className="h-4 w-4 text-teal-500" />,
      title: '观察结果',
      count: step.observation.results.length,
      content: (
        <div className="space-y-2">
          {step.observation.results.map((result, index) => (
            <div key={index} className="overflow-hidden rounded-lg border">
              {result.source_call_id ? (
                <div className="border-b bg-muted/40 px-3 py-1">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    call: {shortId(result.source_call_id, 16)}
                  </span>
                </div>
              ) : null}
              {result.content ? (
                <div className="p-2">
                  <ExpandableText text={result.content} className="bg-muted/40 text-foreground" />
                </div>
              ) : (
                <div className="px-3 py-2 text-xs italic text-muted-foreground">无输出内容</div>
              )}
            </div>
          ))}
        </div>
      ),
    })
  }

  return (
    <div className="relative pb-4 pl-8">
      <div
        className={cn(
          'absolute left-0 top-4 h-3 w-3 rounded-full ring-2 ring-background',
          style.dot
        )}
      />

      <div
        className={cn(
          'overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm',
          style.border,
          'border-l-4'
        )}
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-5 py-3">
          <Badge className={cn('border', style.badge)}>{style.label}</Badge>
          <span className="text-sm font-semibold text-foreground">Step {step.step_id}</span>
          {step.timestamp ? (
            <span className="text-xs text-muted-foreground">{fmtTimestamp(step.timestamp)}</span>
          ) : null}
          {step.model_name ? (
            <Badge className="rounded-md border border-border/70 bg-muted/35 px-2.5 py-1 text-[11px] font-medium text-foreground">
              {step.model_name}
            </Badge>
          ) : null}
        </div>

        <div className="space-y-3 px-5 py-4">
          {step.message ? (
            <ExpandableText text={step.message} className="bg-muted/25 text-foreground" />
          ) : (
            <span className="text-xs italic text-muted-foreground">无消息内容</span>
          )}

          {sections.length > 0 ? (
            <Accordion type="multiple" className="space-y-2">
              {sections.map(section => (
                <StepSection
                  key={`${step.step_id}-${section.key}`}
                  value={`${step.step_id}-${section.key}`}
                  icon={section.icon}
                  title={section.title}
                  count={section.count}
                >
                  {section.content}
                </StepSection>
              ))}
            </Accordion>
          ) : null}

          {step.metrics &&
          (step.metrics.prompt_tokens != null ||
            step.metrics.completion_tokens != null ||
            step.metrics.cached_tokens != null) ? (
            <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
              {step.metrics.prompt_tokens != null ? (
                <Badge className="border-sky-200 bg-sky-50 text-sky-700">
                  输入 {fmtTokens(step.metrics.prompt_tokens)}
                </Badge>
              ) : null}
              {step.metrics.completion_tokens != null ? (
                <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
                  输出 {fmtTokens(step.metrics.completion_tokens)}
                </Badge>
              ) : null}
              {step.metrics.cached_tokens != null && step.metrics.cached_tokens > 0 ? (
                <Badge className="border-amber-200 bg-amber-50 text-amber-700">
                  缓存 {fmtTokens(step.metrics.cached_tokens)}
                </Badge>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
