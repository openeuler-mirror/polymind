'use client'

import { memo, useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import {
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
  ChevronRight,
  AlertCircle,
  BookOpen,
  SquareTerminal,
  Cpu,
  MessageSquare,
  CircleSlash,
  type LucideIcon,
} from 'lucide-react'
import mermaid from 'mermaid'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { MarkdownContent } from '@/components/markdown/markdown-content'
import type { Message, ToolCall, Attachment, EventItem, QuestionInfo } from '@/lib/types'
import { formatToolOutput } from '@/lib/format-utils'
import { resolveCodeLanguage } from '@/lib/artifacts'
import { ArtifactCard } from './artifact-card'

interface MessageListProps {
  messages: Message[]
  onRegenerate?: (assistantMessageId: string) => void
  agentName?: string
  /** 会话所属 agent id（用于产物文件端点 URL） */
  agentId?: string
}

export function MessageList({ messages, onRegenerate, agentName, agentId }: MessageListProps) {
  if (messages.length === 0) {
    return null
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      {messages.map(message => (
        <MessageItem
          key={message.id}
          message={message}
          onRegenerate={onRegenerate}
          agentName={agentName}
          agentId={agentId}
        />
      ))}
    </div>
  )
}

const MessageItem = memo(function MessageItem({
  message,
  onRegenerate,
  agentName,
  agentId,
}: {
  message: Message
  onRegenerate?: (assistantMessageId: string) => void
  agentName?: string
  agentId?: string
}) {
  const [copied, setCopied] = useState(false)
  // 回答完毕后，过程模块（深度思考/工具调用/提问）折叠在「已完成」耗时行下
  const [processExpanded, setProcessExpanded] = useState(false)
  const isUser = message.role === 'user'

  // 派生状态：当前消息是否有等待回答的提问（此时不显示"生成回复中"加载态）
  const hasPendingQuestion =
    !isUser && !!message.question?.length && message.questionStatus === 'pending'

  const hasProcessModules =
    !isUser &&
    !!message.events?.some(
      e =>
        e.type === 'thinking' ||
        e.type === 'tool.call.started' ||
        e.type === 'tool.call.response' ||
        e.type === 'question.asked'
    )
  const processCollapsible =
    !isUser && !message.isStreaming && hasProcessModules && !hasPendingQuestion
  const showProcess = !processCollapsible || processExpanded

  // 生成耗时：由事件时间戳推导，用于"已完成 xs"状态展示（历史消息时间戳不可靠时自动隐藏）
  let durationText: string | null = null
  if (!isUser && !message.isStreaming && message.events && message.events.length >= 2) {
    const timestamps = message.events
      .map(e => e.timestamp)
      .filter((t): t is number => typeof t === 'number' && t > 0)
    if (timestamps.length >= 2) {
      const totalSec = Math.round((Math.max(...timestamps) - Math.min(...timestamps)) / 1000)
      if (totalSec >= 1) {
        const m = Math.floor(totalSec / 60)
        durationText = m > 0 ? `${m}m${totalSec % 60}s` : `${totalSec}s`
      }
    }
  }

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

  return (
    <div className={cn('group animate-message-in', isUser && 'flex flex-row-reverse')}>
      <div className={cn('flex flex-col gap-2', isUser ? 'max-w-[80%] items-end' : 'w-full')}>
        {/* 助手消息头部：头像 + 名称 */}
        {!isUser && (
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6 bg-accent">
              <AvatarFallback className="bg-accent text-accent-foreground">
                <Bot className="h-3.5 w-3.5" />
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium">{agentName || 'AI 助手'}</span>
          </div>
        )}

        {/* 已完成耗时：点击展开/收起过程模块（深度思考/工具调用/提问） */}
        {processCollapsible && (
          <button
            onClick={() => setProcessExpanded(!processExpanded)}
            className="group/mod mb-1 flex w-fit items-center gap-2 text-sm  text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            <span>已完成{durationText ? ` ${durationText}` : ''}</span>
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 shrink-0 transition-all duration-150',
                processExpanded && 'rotate-90'
              )}
            />
          </button>
        )}

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.attachments.map(attachment => (
              <AttachmentBadge key={attachment.id} attachment={attachment} />
            ))}
          </div>
        )}

        {/* Events in order — 按时间线渲染：深度思考 / 正文流式输出 / 工具调用 / 提问流程 */}
        {!isUser && message.events && message.events.length > 0 && (
          <div className="space-y-3">
            {(() => {
              const visibleEvents = message.events!
              const groupedEvents: any[] = []
              let currentThinkingGroup: any[] = []
              let currentDeltaGroup: any[] = []

              visibleEvents.forEach((event, index) => {
                if (event.type === 'thinking') {
                  if (currentDeltaGroup.length > 0) {
                    groupedEvents.push({ type: 'delta-group', events: currentDeltaGroup })
                    currentDeltaGroup = []
                  }
                  currentThinkingGroup.push(event)
                } else if (event.type === 'message.delta') {
                  if (currentThinkingGroup.length > 0) {
                    groupedEvents.push({ type: 'thinking-group', events: currentThinkingGroup })
                    currentThinkingGroup = []
                  }
                  currentDeltaGroup.push(event)
                } else {
                  if (currentThinkingGroup.length > 0) {
                    groupedEvents.push({ type: 'thinking-group', events: currentThinkingGroup })
                    currentThinkingGroup = []
                  }
                  if (currentDeltaGroup.length > 0) {
                    groupedEvents.push({ type: 'delta-group', events: currentDeltaGroup })
                    currentDeltaGroup = []
                  }
                  groupedEvents.push(event)
                }
              })

              if (currentThinkingGroup.length > 0) {
                groupedEvents.push({ type: 'thinking-group', events: currentThinkingGroup })
              }

              if (currentDeltaGroup.length > 0) {
                groupedEvents.push({ type: 'delta-group', events: currentDeltaGroup })
              }

              // 去重并合并工具调用事件
              const toolCallMap = new Map()
              const deduplicatedGroups = []

              for (const group of groupedEvents) {
                if (
                  (group.type === 'tool.call.started' || group.type === 'tool.call.response') &&
                  group.toolCall?.id
                ) {
                  const toolCallId = group.toolCall.id
                  if (toolCallMap.has(toolCallId)) {
                    const existing = toolCallMap.get(toolCallId)
                    const mergedToolCall = { ...existing.toolCall, ...group.toolCall }
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
              // 回答完毕后，过程模块折叠在「已完成」行下，仅保留正文（delta-group）
              if (!showProcess && group.type !== 'delta-group') return null
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
                return <ResponseBlock key={`delta-group-${groupIndex}`} content={deltaContent} />
              } else if (
                group.type === 'tool.call.started' ||
                group.type === 'tool.call.response'
              ) {
                return (
                  <div key={`tool-call-${group.toolCall?.id || groupIndex}`}>
                    {group.toolCall && <ToolCallBadge toolCall={group.toolCall} />}
                  </div>
                )
              } else if (group.type === 'question.asked') {
                // 该轮提问的结论事件（replied / rejected）在其之后
                const resolutionEvent =
                  groups
                    .slice(groupIndex + 1)
                    .find(
                      (g: any) => g.type === 'question.replied' || g.type === 'question.rejected'
                    ) ?? null
                const isLastAsked = !groups
                  .slice(groupIndex + 1)
                  .some((g: any) => g.type === 'question.asked')
                return (
                  <QuestionFlowBlock
                    key={`question-${groupIndex}`}
                    askedEvent={group}
                    message={message}
                    isLastAsked={isLastAsked}
                    resolutionEvent={resolutionEvent}
                  />
                )
              } else if (group.type === 'question.replied' || group.type === 'question.rejected') {
                // 结论已合并进对应的 QuestionFlowBlock 渲染
                return null
              }
              return null
            })}
          </div>
        )}

        {/* 流式进行中的尾随状态行（已有正文流式输出时） */}
        {!isUser &&
          message.isStreaming &&
          !hasPendingQuestion &&
          message.events?.some(e => e.type === 'message.delta') && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>生成回复中</span>
            </div>
          )}

        {/* Message Content — 当 events 中有 delta 时隐藏纯文本内容，避免重复渲染 */}
        {(isUser ||
          !message.events ||
          message.events.length === 0 ||
          !message.events.some(e => e.type === 'message.delta')) &&
          (isUser || message.content || (message.isStreaming && !hasPendingQuestion)) && (
            <>
              {message.status === 'interrupted' && !message.content ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertCircle className="h-4 w-4" />
                  <span>思考已中断</span>
                </div>
              ) : isUser ? (
                <div className="rounded-2xl bg-[#edf3fe] px-4 py-3">
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <MessageContent content={message.content} isStreaming={message.isStreaming} />
                  </div>
                </div>
              ) : (
                <ResponseBlock content={message.content} isStreaming={message.isStreaming} />
              )}
            </>
          )}

        {/* 产物卡片：常显在正文下方（ADR-D6），不随过程模块折叠 */}
        {!isUser && message.artifacts && message.artifacts.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {message.artifacts.map(artifact => (
              <ArtifactCard key={artifact.id} artifact={artifact} agentId={agentId} />
            ))}
          </div>
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

function ResponseBlock({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <MessageContent content={content} isStreaming={isStreaming} />
    </div>
  )
}

function MessageContent({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
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
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>生成回复中</span>
      </div>
    )
  }

  return (
    <>
      <MarkdownContent
        content={content}
        components={{
          pre: ({ children }) => {
            const child = children as React.ReactElement<any>
            const codeElement = child?.props?.children
            const className = child?.props?.className || ''
            const language = resolveCodeLanguage(className)
            const code =
              typeof codeElement === 'string' ? codeElement : String(codeElement || '').trim()

            if (language === 'mermaid') {
              return <MermaidChart chart={code} />
            }

            return <CodeBlock code={code} language={language} showLineNumbers={false} />
          },
          blockquote: ({ children }) => {
            return <Admonition type="blockquote">{children}</Admonition>
          },
        }}
      />
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
          <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
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

  // 处理换行符，确保在 HTML 中正确显示
  const formatForDisplay = (text: string): string => {
    if (!text) return ''
    return text.split('\\n').join('\n')
  }

  const formattedOutput = toolCall.output ? formatToolOutput(toolCall.output) : null
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
    <div className="text-sm">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="group/mod flex min-w-0 max-w-full items-center gap-2 py-1 text-muted-foreground transition-colors duration-150 hover:text-foreground"
      >
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <ToolIcon className={cn('h-3.5 w-3.5 shrink-0', config.iconClass)} />
              </span>
            </TooltipTrigger>
            {toolCall.name === 'read' && <TooltipContent>查看文件</TooltipContent>}
          </Tooltip>
        </TooltipProvider>
        <span className="font-mono text-xs font-medium truncate max-w-[70%]">
          {toolCall.name === 'exec'
            ? isExpanded
              ? toolCall.name
              : execCommand || toolCall.name
            : readFilePath || toolCall.name}
        </span>
        {toolCall.duration && (
          <span className="text-xs text-muted-foreground/70 shrink-0 font-mono">
            {(toolCall.duration / 1000).toFixed(1)}s
          </span>
        )}
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 shrink-0 transition-all duration-150',
            'opacity-0 -translate-x-1 group-hover/mod:translate-x-0 group-hover/mod:opacity-100',
            isExpanded && 'rotate-90'
          )}
        />
      </button>

      {/* Expandable content */}
      {isExpanded && (
        <div className="ml-5 mt-1 space-y-2 border-l border-border/50 pl-3 text-xs">
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
              {(execCommand || toolCall.inputRaw) && (
                <div className="flex items-start gap-2">
                  <span className="text-green-400 shrink-0 select-none">$</span>
                  <span className="text-zinc-100 whitespace-pre-wrap break-words">
                    {formatForDisplay(execCommand || toolCall.inputRaw || '')}
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
              {toolCall.input ? (
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
              ) : toolCall.inputRaw ? (
                // tool.call.delta 流式累积的原始内容
                <div>
                  <div className="text-muted-foreground mb-1 font-medium">输入（流式）</div>
                  <pre className="bg-muted/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words font-mono leading-relaxed">
                    {toolCall.inputRaw}
                  </pre>
                </div>
              ) : null}
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

function QuestionFlowBlock({
  askedEvent,
  message,
  isLastAsked,
  resolutionEvent,
}: {
  askedEvent: EventItem
  message: Message
  isLastAsked: boolean
  resolutionEvent: EventItem | null
}) {
  // message.question 始终持有最新一轮提问；历史轮次从事件 payload 还原
  const askedQuestions =
    (askedEvent.payload?.questions as QuestionInfo[] | null | undefined) ?? null
  const questions = isLastAsked ? (message.question ?? askedQuestions) : askedQuestions

  let status: 'pending' | 'replied' | 'rejected' = 'pending'
  let answers: string[][] | null = null
  if (resolutionEvent) {
    status = resolutionEvent.type === 'question.replied' ? 'replied' : 'rejected'
    answers =
      (resolutionEvent.payload?.answers as string[][] | undefined) ??
      (isLastAsked ? (message.questionAnswers ?? null) : null)
  } else if (isLastAsked && message.questionStatus) {
    status = message.questionStatus
    answers = message.questionAnswers ?? null
  }

  const [statusExpanded, setStatusExpanded] = useState(false)
  const [cardExpanded, setCardExpanded] = useState(status === 'replied')

  // 已跳过
  if (status === 'rejected') {
    return (
      <div className="flex items-center gap-2 py-0.5 text-sm text-muted-foreground">
        <CircleSlash className="h-3.5 w-3.5 shrink-0" />
        <span>您跳过了此问题</span>
      </div>
    )
  }

  // 提问中：活跃等待态仅在消息仍在流式生成时展示
  const waiting =
    status === 'pending' &&
    isLastAsked &&
    !!message.isStreaming &&
    (message.questionStatus ?? 'pending') === 'pending'

  return (
    <div className="space-y-2">
      {/* 状态行：仅提问中（pending）展示 */}
      {status === 'pending' && (
        <div>
          <button
            onClick={() => questions?.length && setStatusExpanded(!statusExpanded)}
            className="group/mod flex items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            {waiting && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
            <span>等待你的回答</span>
            {questions && questions.length > 0 && (
              <ChevronRight
                className={cn(
                  'h-3.5 w-3.5 shrink-0 transition-all duration-150',
                  'opacity-0 -translate-x-1 group-hover/mod:translate-x-0 group-hover/mod:opacity-100',
                  statusExpanded && 'rotate-90'
                )}
              />
            )}
          </button>
          {statusExpanded && questions && (
            <div className="mt-1.5 space-y-1 border-l border-border/50 pl-3 text-sm">
              {questions.map((q, i) => (
                <p key={i} className="leading-relaxed text-muted-foreground/80">
                  {i + 1}. {q.header || q.question}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 提问卡片行：向用户提问 */}
      <div>
        <button
          onClick={() => setCardExpanded(!cardExpanded)}
          className="group/mod flex items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
        >
          <MessageSquare className="h-3.5 w-3.5 shrink-0" />
          <span>向用户提问</span>
          <ChevronRight
            className={cn(
              'h-3.5 w-3.5 shrink-0 transition-all duration-150',
              'opacity-0 -translate-x-1 group-hover/mod:translate-x-0 group-hover/mod:opacity-100',
              cardExpanded && 'rotate-90'
            )}
          />
        </button>
        {cardExpanded && (
          <div className="mt-1.5 space-y-3 rounded-xl bg-muted/50 px-4 py-3">
            {questions && questions.length > 0 ? (
              questions.map((q, i) => {
                const ans = answers?.[i] ?? []
                return (
                  <div key={i}>
                    <div className="text-sm text-muted-foreground">{q.header || q.question}</div>
                    {ans.length > 0 ? (
                      <div className="mt-0.5 text-sm font-semibold text-foreground">
                        {ans.join('、')}
                      </div>
                    ) : (
                      <div className="mt-0.5 text-sm text-muted-foreground/60">
                        {waiting ? '待回答' : '（未作答）'}
                      </div>
                    )}
                  </div>
                )
              })
            ) : (
              <div className="text-sm text-muted-foreground">{askedEvent.content}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ThinkingGroup({ events, completed }: { events: EventItem[]; completed: boolean }) {
  const [expanded, setExpanded] = useState(!completed)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 流式输出时保持滚动到底部
  useEffect(() => {
    if (expanded && !completed && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events.length, expanded, completed])

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="group/mod flex items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
      >
        <span>深度思考</span>
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 shrink-0 transition-all duration-150',
            'opacity-0 -translate-x-1 group-hover/mod:translate-x-0 group-hover/mod:opacity-100',
            expanded && 'rotate-90'
          )}
        />
      </button>

      {expanded && (
        <div
          ref={scrollRef}
          className="mt-1.5 max-h-72 space-y-1.5 overflow-y-auto border-l border-border/50 pl-3 text-sm scrollbar-thin"
        >
          {events.map((event, index) => (
            <p key={`thinking-step-${index}`} className="leading-relaxed text-muted-foreground/80">
              {event.content}
            </p>
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
