'use client'

import { memo, useState, useEffect, useRef, useCallback } from 'react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import {
  User,
  Bot,
  Copy,
  Check,
  RefreshCw,
  Wrench,
  FileText,
  Image as ImageIcon,
  Loader2,
  CheckCircle2,
  Info,
  AlertTriangle,
  Lightbulb,
  ChevronDown,
  Sparkles,
  AlertCircle,
  BookOpen,
  Terminal,
  SquareTerminal,
  Cpu,
  X,
  type LucideIcon,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import mermaid from 'mermaid'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism'
import 'katex/dist/katex.min.css'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { Message, ToolCall, Attachment, EventItem } from '@/lib/types'
import { QuestionCard } from './question-card'
import { useChatStore } from '@/lib/store'

interface MessageListProps {
  messages: Message[]
  onRegenerate?: (assistantMessageId: string) => void
}

export function MessageList({ messages, onRegenerate }: MessageListProps) {
  if (messages.length === 0) {
    return null
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      {messages.map(message => (
        <MessageItem key={message.id} message={message} onRegenerate={onRegenerate} />
      ))}
    </div>
  )
}

const MessageItem = memo(function MessageItem({
  message,
  onRegenerate,
}: {
  message: Message
  onRegenerate?: (assistantMessageId: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'

  // 多问题统一提交状态
  const [submittingQuestions, setSubmittingQuestions] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const selectionsRef = useRef<Map<number, string[]>>(new Map())
  // 用 ref 追踪用户操作类型（提交/跳过），UI 从 message.question 是否为 null 派生最终状态
  const userActionRef = useRef<'submitted' | 'rejected' | null>(null)

  // 派生状态：当前是否有活跃的提问卡片
  const hasActiveQuestions =
    !isUser && !!message.question?.length && !!message.questionId && userActionRef.current === null

  const handleCopy = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(message.content)
      } else {
        const textArea = document.createElement('textarea')
        textArea.value = message.content
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleSelectionChange = useCallback((index: number, selected: string[]) => {
    selectionsRef.current.set(index, selected)
  }, [])

  // 调试：打印 message 对象
  console.log('Rendering message:', message)

  return (
    <div className={cn('group flex gap-4 animate-message-in', isUser && 'flex-row-reverse')}>
      <Avatar className={cn('h-8 w-8 shrink-0', isUser ? 'bg-primary' : 'bg-accent')}>
        <AvatarFallback
          className={
            isUser ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground'
          }
        >
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>

      <div className={cn('flex max-w-[80%] flex-col gap-2', isUser && 'items-end')}>
        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.attachments.map(attachment => (
              <AttachmentBadge key={attachment.id} attachment={attachment} />
            ))}
          </div>
        )}

        {/* Events in order */}
        {!isUser && message.events && message.events.length > 0 && (
          <div className="space-y-2">
            {(() => {
              const groupedEvents: any[] = []
              let currentThinkingGroup: any[] = []
              let currentDeltaGroup: any[] = []

              message.events.forEach((event, index) => {
                // 保留tool.call.started事件，用于显示正在执行的工具调用状态

                if (event.type === 'thinking') {
                  // If we have a current delta group, add it to groupedEvents
                  if (currentDeltaGroup.length > 0) {
                    groupedEvents.push({ type: 'delta-group', events: currentDeltaGroup })
                    currentDeltaGroup = []
                  }
                  currentThinkingGroup.push(event)
                } else if (event.type === 'message.delta') {
                  // If we have a current thinking group, add it to groupedEvents
                  if (currentThinkingGroup.length > 0) {
                    groupedEvents.push({ type: 'thinking-group', events: currentThinkingGroup })
                    currentThinkingGroup = []
                  }
                  currentDeltaGroup.push(event)
                } else {
                  // If we have a current thinking group, add it to groupedEvents
                  if (currentThinkingGroup.length > 0) {
                    groupedEvents.push({ type: 'thinking-group', events: currentThinkingGroup })
                    currentThinkingGroup = []
                  }
                  // If we have a current delta group, add it to groupedEvents
                  if (currentDeltaGroup.length > 0) {
                    groupedEvents.push({ type: 'delta-group', events: currentDeltaGroup })
                    currentDeltaGroup = []
                  }
                  // Add the non-thinking, non-delta event
                  groupedEvents.push(event)
                }
              })

              // Add any remaining thinking events
              if (currentThinkingGroup.length > 0) {
                groupedEvents.push({ type: 'thinking-group', events: currentThinkingGroup })
              }

              // Add any remaining delta events
              if (currentDeltaGroup.length > 0) {
                groupedEvents.push({ type: 'delta-group', events: currentDeltaGroup })
              }

              // 去重并合并工具调用事件：同一个toolCall.id合并属性，保留最新状态和所有字段，保持原有顺序
              const toolCallMap = new Map()
              const deduplicatedGroups = []

              // 第一次遍历：合并同id的工具调用属性
              for (const group of groupedEvents) {
                if (
                  (group.type === 'tool.call.started' || group.type === 'tool.call.response') &&
                  group.toolCall?.id
                ) {
                  const toolCallId = group.toolCall.id
                  if (toolCallMap.has(toolCallId)) {
                    // 合并属性：新属性覆盖旧属性，但input字段优先保留有值的版本，避免空值覆盖
                    const existing = toolCallMap.get(toolCallId)
                    const mergedToolCall = { ...existing.toolCall, ...group.toolCall }
                    // 特殊处理input：如果新的input是空的，保留旧的input
                    if (
                      (!group.toolCall.input ||
                        (typeof group.toolCall.input === 'object' &&
                          Object.keys(group.toolCall.input).length === 0)) &&
                      existing.toolCall.input
                    ) {
                      mergedToolCall.input = existing.toolCall.input
                    }
                    toolCallMap.set(toolCallId, { ...group, toolCall: mergedToolCall })
                  } else {
                    toolCallMap.set(toolCallId, group)
                  }
                }
              }

              // 第二次遍历：按原有顺序构建结果，遇到工具调用事件用合并后的版本替换
              const processedToolCallIds = new Set()
              for (const group of groupedEvents) {
                if (
                  (group.type === 'tool.call.started' || group.type === 'tool.call.response') &&
                  group.toolCall?.id
                ) {
                  const toolCallId = group.toolCall.id
                  if (processedToolCallIds.has(toolCallId)) continue
                  processedToolCallIds.add(toolCallId)
                  deduplicatedGroups.push(toolCallMap.get(toolCallId))
                } else {
                  deduplicatedGroups.push(group)
                }
              }

              return deduplicatedGroups
            })().map((group: any, groupIndex: number, groups: any[]) => {
              if (group.type === 'thinking-group') {
                const isLastGroup = groupIndex === groups.length - 1
                const thinkingCompleted = !!message.content || !isLastGroup || !message.isStreaming
                return (
                  <ThinkingGroup
                    key={`thinking-group-${groupIndex}`}
                    events={group.events}
                    completed={thinkingCompleted}
                  />
                )
              } else if (group.type === 'delta-group') {
                const deltaContent = group.events.map((event: EventItem) => event.content).join('')
                if (!deltaContent) return null
                return (
                  <div
                    key={`delta-group-${groupIndex}`}
                    className="rounded-2xl px-4 py-3 bg-card border border-border"
                  >
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <MessageContent content={deltaContent} />
                    </div>
                  </div>
                )
              } else if (
                group.type === 'tool.call.started' ||
                group.type === 'tool.call.response'
              ) {
                return (
                  <div key={`tool-call-${group.toolCall?.id || groupIndex}`}>
                    {group.toolCall && <ToolCallBadge toolCall={group.toolCall} />}
                  </div>
                )
              }
              return null
            })}
          </div>
        )}

        {/* Question cards — displayed when AI asks questions with options */}
        {hasActiveQuestions && (
          <div className="space-y-3">
            {message.question!.map((q, qIdx) => (
              <QuestionCard
                key={`question-${qIdx}`}
                question={q}
                questionIndex={qIdx}
                disabled={submittingQuestions}
                onSelectionChange={handleSelectionChange}
              />
            ))}
            {/* 统一操作按钮 */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                onClick={async () => {
                  if (!message.questionId) return
                  setSubmittingQuestions(true)
                  setSubmitError(null)
                  try {
                    const answers: string[][] = []
                    const questionCount = message.question!.length
                    for (let i = 0; i < questionCount; i++) {
                      answers.push(selectionsRef.current.get(i) || [])
                    }
                    const store = useChatStore.getState()
                    const conv = store.conversations.find(c => c.id === store.currentConversationId)
                    const agentId = conv?.agentId || store.currentAgentId || ''
                    const sessionId = conv?.sessionId || ''
                    await store.replyQuestion(agentId, sessionId, message.questionId, answers)
                    userActionRef.current = 'submitted'
                  } catch (err: any) {
                    const msg = err?.message || '提交失败，请重试'
                    setSubmitError(msg)
                  } finally {
                    setSubmittingQuestions(false)
                  }
                }}
                disabled={submittingQuestions}
                className="h-8 text-xs"
              >
                {submittingQuestions ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                {submitError ? '重试' : '提交所有回答'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  if (!message.questionId) return
                  setSubmittingQuestions(true)
                  setSubmitError(null)
                  try {
                    const store = useChatStore.getState()
                    const conv = store.conversations.find(c => c.id === store.currentConversationId)
                    const agentId = conv?.agentId || store.currentAgentId || ''
                    const sessionId = conv?.sessionId || ''
                    await store.rejectQuestion(agentId, sessionId, message.questionId)
                    userActionRef.current = 'rejected'
                  } catch (err: any) {
                    const msg = err?.message || '操作失败，请重试'
                    setSubmitError(msg)
                  } finally {
                    setSubmittingQuestions(false)
                  }
                }}
                disabled={submittingQuestions}
                className="h-8 text-xs text-muted-foreground"
              >
                <X className="mr-1 h-3.5 w-3.5" />
                跳过
              </Button>
            </div>
            {/* 提交错误提示 */}
            {submitError && (
              <div className="flex items-center gap-1.5 text-xs text-red-500">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}
          </div>
        )}

        {/* Question result indicator — only show after server acknowledges (question cleared) */}
        {!isUser &&
          userActionRef.current === 'submitted' &&
          !message.question?.length &&
          selectionsRef.current.size > 0 && (
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2.5 text-sm">
              <Check className="h-4 w-4 shrink-0 text-green-500" />
              <span className="text-foreground/80">
                已提交回答：
                {Array.from(selectionsRef.current.entries()).map(([idx, selected], i) => (
                  <span key={idx}>
                    {selected.length > 0 ? selected.join('、') : '（未选择）'}
                    {i < selectionsRef.current.size - 1 ? '；' : ''}
                  </span>
                ))}
              </span>
            </div>
          )}
        {!isUser && userActionRef.current === 'rejected' && !message.question?.length && (
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
            <X className="h-4 w-4 shrink-0" />
            <span>已跳过提问</span>
          </div>
        )}

        {/* Message Content - only render when no delta-events cover the text content */}
        {(isUser ||
          !message.events ||
          message.events.length === 0 ||
          !message.events.some(e => e.type === 'message.delta')) &&
          (isUser || message.content || (message.isStreaming && !hasActiveQuestions)) && (
            <>
              {message.status === 'interrupted' && !message.content ? (
                <div className="rounded-2xl px-4 py-3 bg-card border border-border">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <AlertCircle className="h-4 w-4" />
                    <span>思考已中断</span>
                  </div>
                </div>
              ) : (
                <div
                  className={cn(
                    'rounded-2xl px-4 py-3',
                    isUser ? 'bg-primary text-primary-foreground' : 'bg-card border border-border'
                  )}
                >
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <MessageContent
                      content={message.content}
                      isStreaming={message.isStreaming}
                      isUser={isUser}
                    />
                  </div>
                </div>
              )}
            </>
          )}

        {/* Usage Information */}
        {message.usage && (
          <div className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <div className="flex flex-wrap gap-2">
              <span>输入 tokens: {message.usage.inputTokens}</span>
              <span>输出 tokens: {message.usage.outputTokens}</span>
              <span>成本: ${message.usage.totalCost || 0}</span>
            </div>
          </div>
        )}

        {/* Timestamp & Actions */}
        <div
          className={cn(
            'flex items-center gap-2 text-xs text-muted-foreground',
            isUser && 'flex-row-reverse'
          )}
        >
          <span suppressHydrationWarning>
            {format(message.timestamp, 'HH:mm', { locale: zhCN })}
          </span>

          {!message.isStreaming && (
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy}>
                      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>复制</TooltipContent>
                </Tooltip>

                {!isUser && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => onRegenerate?.(message.id)}
                        >
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>重新生成</TooltipContent>
                    </Tooltip>
                  </>
                )}
              </TooltipProvider>
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

function MessageContent({
  content,
  isStreaming,
  isUser,
}: {
  content: string
  isStreaming?: boolean
  isUser?: boolean
}) {
  const mermaidInitialized = useRef(false)

  useEffect(() => {
    if (!mermaidInitialized.current) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
      })
      mermaidInitialized.current = true
    }
  }, [])

  if (!content && isStreaming) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>思考中...</span>
      </div>
    )
  }

  return (
    <>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeRaw]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-2 mt-4 text-xl font-bold first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-4 text-lg font-semibold first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-3 text-base font-semibold first:mt-0">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="mb-2 mt-3 text-sm font-semibold first:mt-0">{children}</h4>
          ),
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li className="text-sm leading-relaxed">{children}</li>,
          code: ({ className, children, node, ...props }) => {
            const isInline = !className

            if (isInline) {
              return (
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm" {...props}>
                  {children}
                </code>
              )
            }

            return null
          },
          pre: ({ children, ...props }) => {
            const child = children as React.ReactElement<any>
            const codeElement = child?.props?.children
            const className = child?.props?.className || ''
            const match = /language-(\w+)/.exec(className)
            const language = match ? match[1] : ''
            const code =
              typeof codeElement === 'string' ? codeElement : String(codeElement || '').trim()

            if (language === 'mermaid') {
              return <MermaidChart chart={code} />
            }

            return <CodeBlock code={code} language={language} showLineNumbers={false} />
          },
          blockquote: ({ children, ...props }) => {
            return <Admonition type="blockquote">{children}</Admonition>
          },
          a: ({ href, children }) => (
            <a
              href={href}
              className={cn(
                isUser
                  ? 'text-primary-foreground underline hover:text-primary-foreground/80'
                  : 'text-primary underline hover:text-primary/80'
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="mb-2 overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
          th: ({ children }) => <th className="px-3 py-2 text-left font-semibold">{children}</th>,
          td: ({ children }) => <td className="px-3 py-2">{children}</td>,
          hr: () => <hr className="my-4 border-border" />,
          img: ({ src, alt }) => (
            <img src={src} alt={alt} className="max-w-full rounded-lg" loading="lazy" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
      {isStreaming && (
        <span className="ml-0.5 inline-block h-4 w-0.5 animate-blink bg-foreground" />
      )}
    </>
  )
}

function CodeBlock({
  code,
  language,
  showLineNumbers = false,
}: {
  code: string
  language: string
  showLineNumbers?: boolean
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy code:', err)
    }
  }

  const displayLanguage = language || 'text'

  return (
    <div className="group relative mb-2 overflow-hidden rounded-lg bg-[#282c34]">
      <div className="flex items-center justify-between px-4 py-2 bg-[#21252b] border-b border-gray-700">
        <span className="text-xs text-gray-400 font-medium uppercase">{displayLanguage}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              <span>已复制</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>复制</span>
            </>
          )}
        </button>
      </div>
      <div className="overflow-x-auto">
        <SyntaxHighlighter
          language={language || 'text'}
          style={oneDark}
          showLineNumbers={showLineNumbers}
          customStyle={{
            margin: 0,
            padding: '1rem',
            background: 'transparent',
            fontSize: '0.875rem',
            lineHeight: '1.5',
          }}
          codeTagProps={{
            style: {
              fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
            },
          }}
          wrapLines={true}
          wrapLongLines={true}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  )
}

function MermaidChart({ chart }: { chart: string }) {
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const renderChart = async () => {
      try {
        const id = `mermaid-${Math.random().toString(36).substring(2, 11)}`
        const { svg } = await mermaid.render(id, chart)
        setSvg(svg)
        setError('')
      } catch (err) {
        setError(err instanceof Error ? err.message : '渲染流程图失败')
      } finally {
        setIsLoading(false)
      }
    }

    renderChart()
  }, [chart])

  if (isLoading) {
    return (
      <div className="mb-2 flex items-center justify-center rounded-lg bg-muted p-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">渲染流程图...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mb-2 rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-500">
        {error}
      </div>
    )
  }

  return (
    <div
      className="mb-2 overflow-x-auto rounded-lg bg-muted p-4"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

function Admonition({ children, type }: { children: React.ReactNode; type?: string }) {
  const [isOpen, setIsOpen] = useState(true)
  const [isDetails, setIsDetails] = useState(false)

  useEffect(() => {
    if (Array.isArray(children)) {
      const hasDetails = children.some(
        child => child && typeof child === 'object' && 'type' in child && child.type === 'details'
      )
      setIsDetails(hasDetails)
    }
  }, [children])

  const getAdmonitionConfig = () => {
    const typeMap: Record<
      string,
      { icon: React.ReactNode; color: string; bg: string; label: string }
    > = {
      note: {
        icon: <Info className="h-5 w-5" />,
        color: 'text-blue-500',
        bg: 'bg-blue-500/10 border-blue-500/50',
        label: '提示',
      },
      info: {
        icon: <Info className="h-5 w-5" />,
        color: 'text-blue-500',
        bg: 'bg-blue-500/10 border-blue-500/50',
        label: '信息',
      },
      tip: {
        icon: <Lightbulb className="h-5 w-5" />,
        color: 'text-green-500',
        bg: 'bg-green-500/10 border-green-500/50',
        label: '技巧',
      },
      warning: {
        icon: <AlertTriangle className="h-5 w-5" />,
        color: 'text-yellow-500',
        bg: 'bg-yellow-500/10 border-yellow-500/50',
        label: '警告',
      },
      caution: {
        icon: <AlertTriangle className="h-5 w-5" />,
        color: 'text-orange-500',
        bg: 'bg-orange-500/10 border-orange-500/50',
        label: '注意',
      },
      danger: {
        icon: <AlertTriangle className="h-5 w-5" />,
        color: 'text-red-500',
        bg: 'bg-red-500/10 border-red-500/50',
        label: '危险',
      },
      important: {
        icon: <AlertTriangle className="h-5 w-5" />,
        color: 'text-purple-500',
        bg: 'bg-purple-500/10 border-purple-500/50',
        label: '重要',
      },
    }

    return (
      typeMap[type?.toLowerCase() || ''] || {
        icon: null,
        color: 'border-muted-foreground/30',
        bg: 'border-l-4',
        label: '',
      }
    )
  }

  const config = getAdmonitionConfig()

  if (isDetails) {
    return <div className="mb-2">{children}</div>
  }

  if (!config.label) {
    return (
      <blockquote className="mb-2 border-l-4 border-muted-foreground/30 pl-4 italic">
        {children}
      </blockquote>
    )
  }

  return (
    <div className={`mb-2 rounded-lg border ${config.bg} p-4`}>
      <div className={`mb-2 flex items-center gap-2 font-semibold ${config.color}`}>
        {config.icon}
        <span>{config.label}</span>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="ml-auto rounded p-1 hover:bg-black/10"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {isOpen && <div className="text-sm">{children}</div>}
    </div>
  )
}

function ToolCallBadge({ toolCall }: { toolCall: ToolCall }) {
  const isRunning = toolCall.status === 'running'
  const isCompleted = toolCall.status === 'completed'
  const [isExpanded, setIsExpanded] = useState(false)

  // 格式化输出，使其更易读
  const formatOutput = (output: any): string => {
    if (typeof output === 'string') {
      return output
    }

    if (typeof output === 'object' && output !== null) {
      // 如果顶层是数组，提取文本内容
      if (Array.isArray(output)) {
        const texts = output
          .filter((item: any) => item && item.type === 'text')
          .map((item: any) => item.text)
          .join('\n')
        if (texts) return texts
        return JSON.stringify(output, null, 2)
      }

      // 如果有 details.content，优先使用
      if (output.details?.content) {
        const content = output.details.content
        return typeof content === 'string' ? content : JSON.stringify(content)
      }

      // 如果有 text 字段
      if (output.text) {
        return typeof output.text === 'string' ? output.text : JSON.stringify(output.text)
      }

      // 如果有 content 数组，提取文本
      if (Array.isArray(output.content)) {
        const texts = output.content
          .filter((item: any) => item && item.type === 'text')
          .map((item: any) => item.text)
          .join('\n')
        if (texts) return texts
      }

      return JSON.stringify(output, null, 2)
    }

    return String(output)
  }

  // 处理换行符，确保在 HTML 中正确显示
  const formatForDisplay = (text: string): string => {
    if (!text) return ''
    return text.split('\\n').join('\n')
  }

  const formattedOutput = toolCall.output ? formatOutput(toolCall.output) : null
  const displayOutput = formattedOutput ? formatForDisplay(formattedOutput) : null

  const statusConfig = {
    running: {
      icon: Loader2,
      iconClass: 'animate-spin text-primary',
      label: '运行中',
      labelClass: 'bg-primary/10 text-primary',
    },
    completed: {
      icon: CheckCircle2,
      iconClass: 'text-accent',
      label: '已完成',
      labelClass: 'bg-accent/10 text-accent',
    },
    error: {
      icon: AlertCircle,
      iconClass: 'text-red-500',
      label: '出错',
      labelClass: 'bg-red-500/10 text-red-500',
    },
    pending: {
      icon: Wrench,
      iconClass: 'text-muted-foreground',
      label: '待执行',
      labelClass: 'bg-muted text-muted-foreground',
    },
  }

  const config = statusConfig[toolCall.status] || statusConfig.pending
  const StatusIcon = config.icon

  // 根据工具名称映射不同的图标，未知工具默认用 Wrench
  const toolIconMap: Record<string, LucideIcon> = {
    read: BookOpen,
    exec: SquareTerminal,
    process: Cpu,
  }
  const ToolIcon = toolIconMap[toolCall.name] || Wrench

  // 提取文件路径（用于 read 工具）
  const getReadFilePath = (): string | null => {
    if (toolCall.name !== 'read' || !toolCall.input) return null
    const input = toolCall.input as Record<string, unknown>
    return (input.file_path as string) || (input.path as string) || null
  }
  const readFilePath = getReadFilePath()

  // 提取命令文本（用于 exec 工具）
  const getExecCommand = (): string | null => {
    if (toolCall.name !== 'exec' || !toolCall.input) return null
    const input = toolCall.input as Record<string, unknown>
    return (input.command as string) || null
  }
  const execCommand = getExecCommand()

  return (
    <div className="rounded-lg border border-border bg-card text-sm shadow-sm">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2 transition-colors',
          isExpanded ? 'border-b border-border' : 'hover:bg-muted/50'
        )}
      >
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <ToolIcon className={cn('h-4 w-4 shrink-0', config.iconClass)} />
              </span>
            </TooltipTrigger>
            {toolCall.name === 'read' && <TooltipContent>查看文件</TooltipContent>}
          </Tooltip>
        </TooltipProvider>
        <span className="flex-1 text-left font-mono text-xs font-medium truncate">
          {toolCall.name === 'exec'
            ? isExpanded
              ? toolCall.name
              : execCommand || toolCall.name
            : readFilePath || toolCall.name}
        </span>
        {toolCall.duration && (
          <span className="text-xs text-muted-foreground shrink-0 font-mono">
            {(toolCall.duration / 1000).toFixed(1)}s
          </span>
        )}
        <ChevronDown
          className={cn(
            'h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform',
            isExpanded && 'rotate-180'
          )}
        />
      </button>

      {/* Expandable content */}
      {isExpanded && (
        <div className="px-3 py-2 space-y-2 text-xs">
          {toolCall.displayText &&
            toolCall.name !== 'read' &&
            displayOutput &&
            !toolCall.displayText.includes(displayOutput.slice(0, 50)) && (
              <div className="text-muted-foreground">{toolCall.displayText}</div>
            )}
          {toolCall.name === 'read' ? (
            // read 工具：直接显示文件内容
            displayOutput ? (
              <pre className="bg-muted/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words font-mono leading-relaxed">
                {displayOutput}
              </pre>
            ) : toolCall.error ? (
              <pre className="bg-red-500/10 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words font-mono leading-relaxed">
                {formatForDisplay(
                  typeof toolCall.error === 'string'
                    ? toolCall.error
                    : JSON.stringify(toolCall.error, null, 2)
                )}
              </pre>
            ) : null
          ) : toolCall.name === 'exec' ? (
            // exec 工具：终端风格
            <div className="bg-zinc-950 rounded-md p-3 font-mono text-xs leading-relaxed space-y-2">
              {execCommand && (
                <div className="flex items-start gap-2">
                  <span className="text-green-400 shrink-0 select-none">$</span>
                  <span className="text-zinc-100 whitespace-pre-wrap break-words">
                    {formatForDisplay(execCommand)}
                  </span>
                </div>
              )}
              {displayOutput && (
                <div
                  className={cn(
                    'whitespace-pre-wrap break-words border-t border-zinc-800 pt-2',
                    toolCall.status === 'error' ? 'text-red-400' : 'text-zinc-300'
                  )}
                >
                  {displayOutput}
                </div>
              )}
            </div>
          ) : (
            // 其他工具：保持原有格式
            <>
              {toolCall.input && (
                <div>
                  <div className="text-muted-foreground mb-1 font-medium">输入</div>
                  <pre className="bg-muted/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words font-mono leading-relaxed">
                    {formatForDisplay(
                      typeof toolCall.input === 'string'
                        ? toolCall.input
                        : JSON.stringify(toolCall.input, null, 2)
                    )}
                  </pre>
                </div>
              )}
              {/* 错误状态下 output 通常与 error 内容重复，只展示错误区域 */}
              {displayOutput && toolCall.status !== 'error' && (
                <div>
                  <div className="text-muted-foreground mb-1 font-medium">输出</div>
                  <pre className="bg-muted/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words font-mono leading-relaxed">
                    {displayOutput}
                  </pre>
                </div>
              )}
              {toolCall.error && (
                <div>
                  <div className="text-red-500 mb-1 font-medium">错误</div>
                  <pre className="bg-red-500/10 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words font-mono leading-relaxed">
                    {formatForDisplay(
                      typeof toolCall.error === 'string'
                        ? toolCall.error
                        : JSON.stringify(toolCall.error, null, 2)
                    )}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ThinkingGroup({ events, completed }: { events: EventItem[]; completed: boolean }) {
  const [expanded, setExpanded] = useState(!completed)
  const stepCount = events.length

  return (
    <div className="overflow-hidden rounded-r-lg border border-border border-l-2 border-l-accent/20 bg-accent/[0.02]">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors',
          expanded ? 'bg-accent/[0.03]' : 'hover:bg-accent/[0.03]'
        )}
      >
        {completed ? (
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" />
        ) : (
          <Sparkles className="h-3.5 w-3.5 shrink-0 animate-pulse text-accent" />
        )}
        <span className="italic text-muted-foreground">
          {completed ? '已完成思考' : '正在思考...'}
        </span>
        <ChevronDown
          className={cn(
            'h-3 w-3 ml-auto shrink-0 text-muted-foreground/60 transition-transform',
            expanded && 'rotate-180'
          )}
        />
      </button>

      {/* Expandable content */}
      {expanded && (
        <div className="border-t border-border/50 px-3 py-2 text-sm space-y-1.5">
          {events.map((event, index) => (
            <div key={`thinking-step-${index}`} className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-accent/60 text-[10px] font-mono leading-[18px]">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="italic text-muted-foreground/80">{event.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AttachmentBadge({ attachment }: { attachment: Attachment }) {
  const Icon = attachment.type === 'image' ? ImageIcon : FileText

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="max-w-[150px] truncate">{attachment.name}</span>
      <span className="text-muted-foreground">{formatSize(attachment.size)}</span>
    </div>
  )
}
