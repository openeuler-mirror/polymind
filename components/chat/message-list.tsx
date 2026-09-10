'use client'

import { memo, useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
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
import { ShimmerText } from '@/components/ui/shimmer-text'
import {
  getMessageEventGroups,
  isProcessGroup,
  type MessageEventGroup,
} from '@/lib/message-event-groups'

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
  const { t } = useTranslation('chat')
  const [copied, setCopied] = useState(false)
  // 回答完毕后，过程模块（深度思考/工具调用/提问）折叠在「已完成」耗时行下
  const [processExpanded, setProcessExpanded] = useState(false)
  const isUser = message.role === 'user'

  // 派生状态：当前消息是否有等待回答的提问（此时不显示"生成回复中"加载态）
  const hasPendingQuestion =
    !isUser && !!message.question?.length && message.questionStatus === 'pending'

  // 事件分组：按时间线渲染（深度思考 / 正文 / 工具调用 / 提问）。
  // 分组带缓存与尾部增量复用，避免流式期间每个 delta 都重建整条时间线。
  const eventGroups: MessageEventGroup[] =
    !isUser && message.events && message.events.length > 0
      ? getMessageEventGroups(message.id, message.events)
      : []

  // 过程模块是否参与「已完成」折叠：复用 isProcessGroup，避免与分组定义各写一份判定
  const hasProcessModules = !isUser && eventGroups.some(isProcessGroup)
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

  // 折叠态在「已完成」之外保留的正文段 = 最后一段正文。
  // 若它排在最后一个过程事件之后，就是「收尾回答」；否则（收尾是工具调用/提问/思考）
  // 说明本轮没有尾随正文，此时必须回退展示最后一段正文，
  // 否则过程模块与正文会被整体折叠，用户看到一条空消息。
  const collapsedDeltaIndex = eventGroups.reduce(
    (acc: number, group: MessageEventGroup, index: number) =>
      group.type === 'delta-group' ? index : acc,
    -1
  )
  const hasCollapsedContent = collapsedDeltaIndex >= 0

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
      <div className={cn('flex flex-col gap-1', isUser ? 'max-w-[80%] items-end' : 'w-full')}>
        {/* 助手消息头部：头像 + 名称 */}
        {!isUser && (
          <div className="flex items-center gap-2 mb-2">
            <Avatar className="h-6 w-6 bg-accent">
              <AvatarFallback className="bg-accent text-accent-foreground">
                <Bot className="h-3.5 w-3.5" />
              </AvatarFallback>
            </Avatar>
            <span className="text-base font-medium">
              {agentName || t('message.assistantFallback')}
            </span>
          </div>
        )}

        {/* 已完成耗时：点击展开/收起过程模块（深度思考/工具调用/提问） */}
        {processCollapsible && (
          <button
            onClick={() => setProcessExpanded(!processExpanded)}
            className="group/mod flex w-fit items-center gap-2 text-sm text-process-foreground transition-colors duration-150 hover:text-foreground"
          >
            <span>
              {durationText
                ? t('message.completedWithDuration', { duration: durationText })
                : t('message.completed')}
            </span>
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
        {!isUser && eventGroups.length > 0 && (
          <div
            className={cn(
              'space-y-3',
              // 「已完成」行与首个过程模块之间的间距：展开态需要更明显的分隔
              processCollapsible && processExpanded && 'mt-3',
              // 折叠态仅保留正文时，与「已完成」行保持适度间距
              processCollapsible && !processExpanded && hasCollapsedContent && 'mt-2'
            )}
          >
            {eventGroups.map((group, groupIndex, groups) => {
              // 折叠态：只保留最后一段正文，其余过程模块（含中途正文）收进「已完成」内部
              if (!showProcess && groupIndex !== collapsedDeltaIndex) return null
              if (group.type === 'thinking-group') {
                const isLastGroup = groupIndex === groups.length - 1
                const thinkingCompleted = !!message.content || !isLastGroup || !message.isStreaming
                return (
                  <ThinkingGroup
                    key={`thinking-group-${groupIndex}`}
                    events={group.events ?? []}
                    completed={thinkingCompleted}
                  />
                )
              } else if (group.type === 'delta-group') {
                const deltaContent = (group.events ?? []).map(event => event.content).join('')
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
                      (g: MessageEventGroup) =>
                        g.type === 'question.replied' || g.type === 'question.rejected'
                    ) ?? null
                const isLastAsked = !groups
                  .slice(groupIndex + 1)
                  .some((g: MessageEventGroup) => g.type === 'question.asked')
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

        {/* 流式进行中的尾随状态行（已有正文流式输出时）— 呼吸脉冲而非 spinner */}
        {!isUser &&
          message.isStreaming &&
          !hasPendingQuestion &&
          message.events?.some(e => e.type === 'message.delta') && <StreamingIndicator />}

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
                  <span>{t('message.interrupted')}</span>
                </div>
              ) : isUser ? (
                // 用户气泡底色走 --user-bubble 语义 token：
                // 浅色是淡蓝、深色是主色叠加，暗色模式下正文（近白）依然可读。
                <div className="rounded-2xl bg-user-bubble px-4 py-3">
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
              <span>
                {t('message.usage.inputTokens', { count: message.usage.inputTokens })}
              </span>
              <span>
                {t('message.usage.outputTokens', { count: message.usage.outputTokens })}
              </span>
              <span>{t('message.usage.cost', { cost: message.usage.totalCost || 0 })}</span>
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
                  <TooltipContent>{t('message.action.copy')}</TooltipContent>
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
                      <TooltipContent>{t('message.action.regenerate')}</TooltipContent>
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
  // 正文行高：项目未启用 @tailwindcss/typography（prose 类不生效），行高需显式设置。
  // 从浏览器默认的 1.5 放宽到 1.75，缓解中文长段落「挤」的观感。
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none leading-[1.75]">
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
    return <StreamingIndicator />
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
  const { t } = useTranslation('chat')
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
              <span>{t('message.codeBlock.copied')}</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>{t('message.codeBlock.copy')}</span>
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
  const { t } = useTranslation('chat')
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
        setError(err instanceof Error ? err.message : t('message.mermaid.renderFailed'))
      } finally {
        setIsLoading(false)
      }
    }

    renderChart()
  }, [chart, t])

  if (isLoading) {
    return (
      <div className="mb-2 flex items-center justify-center rounded-lg bg-muted p-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">
          {t('message.mermaid.rendering')}
        </span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mb-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
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
  const { t } = useTranslation('chat')
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
        label: t('message.admonition.note'),
      },
      info: {
        icon: <Info className="h-5 w-5" />,
        color: 'text-blue-500',
        bg: 'bg-blue-500/10 border-blue-500/50',
        label: t('message.admonition.info'),
      },
      tip: {
        icon: <Lightbulb className="h-5 w-5" />,
        color: 'text-green-500',
        bg: 'bg-green-500/10 border-green-500/50',
        label: t('message.admonition.tip'),
      },
      warning: {
        icon: <AlertTriangle className="h-5 w-5" />,
        color: 'text-yellow-500',
        bg: 'bg-yellow-500/10 border-yellow-500/50',
        label: t('message.admonition.warning'),
      },
      caution: {
        icon: <AlertTriangle className="h-5 w-5" />,
        color: 'text-orange-500',
        bg: 'bg-orange-500/10 border-orange-500/50',
        label: t('message.admonition.caution'),
      },
      danger: {
        icon: <AlertTriangle className="h-5 w-5" />,
        color: 'text-red-500',
        bg: 'bg-red-500/10 border-red-500/50',
        label: t('message.admonition.danger'),
      },
      important: {
        icon: <AlertTriangle className="h-5 w-5" />,
        color: 'text-purple-500',
        bg: 'bg-purple-500/10 border-purple-500/50',
        label: t('message.admonition.important'),
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
  const { t } = useTranslation('chat')
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
      label: t('message.toolCall.status.running'),
      labelClass: 'bg-primary/10 text-primary',
    },
    completed: {
      icon: CheckCircle2,
      iconClass: 'text-accent',
      label: t('message.toolCall.status.completed'),
      labelClass: 'bg-accent/10 text-accent',
    },
    error: {
      icon: AlertCircle,
      iconClass: 'text-destructive',
      label: t('message.toolCall.status.error'),
      labelClass: 'bg-destructive/10 text-destructive',
    },
    pending: {
      icon: Wrench,
      iconClass: 'text-muted-foreground',
      label: t('message.toolCall.status.pending'),
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
    <div className="text-sm text-process-foreground">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="group/mod flex min-w-0 max-w-full items-center gap-2 py-1 text-process-foreground transition-colors duration-150 hover:text-foreground"
      >
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <ToolIcon className={cn('h-3.5 w-3.5 shrink-0', config.iconClass)} />
              </span>
            </TooltipTrigger>
            {toolCall.name === 'read' && (
              <TooltipContent>{t('message.toolCall.viewFile')}</TooltipContent>
            )}
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
          <span className="text-xs text-process-foreground/70 shrink-0 font-mono">
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
              <pre className="text-muted-foreground bg-muted/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words font-mono leading-relaxed">
                {displayOutput}
              </pre>
            ) : toolCall.error ? (
              <pre className="text-muted-foreground bg-destructive/10 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words font-mono leading-relaxed">
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
                  <div className="text-process-foreground mb-1 font-medium">
                    {t('message.toolCall.input')}
                  </div>
                  <pre className="text-muted-foreground bg-muted/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words font-mono leading-relaxed">
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
                  <div className="text-process-foreground mb-1 font-medium">
                    {t('message.toolCall.inputStreaming')}
                  </div>
                  <pre className="text-muted-foreground bg-muted/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words font-mono leading-relaxed">
                    {toolCall.inputRaw}
                  </pre>
                </div>
              ) : null}
              {/* 错误状态下 output 通常与 error 内容重复，只展示错误区域 */}
              {displayOutput && toolCall.status !== 'error' && (
                <div>
                  <div className="text-process-foreground mb-1 font-medium">
                    {t('message.toolCall.output')}
                  </div>
                  <pre className="text-muted-foreground bg-muted/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words font-mono leading-relaxed">
                    {displayOutput}
                  </pre>
                </div>
              )}
              {toolCall.error && (
                <div>
                  <div className="text-destructive mb-1 font-medium">
                    {t('message.toolCall.error')}
                  </div>
                  <pre className="text-muted-foreground bg-destructive/10 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words font-mono leading-relaxed">
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
  askedEvent: MessageEventGroup
  message: Message
  isLastAsked: boolean
  resolutionEvent: MessageEventGroup | null
}) {
  const { t } = useTranslation('chat')
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
      <div className="flex items-center gap-2 py-0.5 text-sm text-process-foreground">
        <CircleSlash className="h-3.5 w-3.5 shrink-0" />
        <span>{t('message.question.skipped')}</span>
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
            className="group/mod flex items-center gap-1.5 text-sm text-process-foreground transition-colors duration-150 hover:text-foreground"
          >
            {waiting && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
            <span>{t('message.question.waiting')}</span>
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
                <p key={i} className="leading-relaxed text-process-foreground">
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
          className="group/mod flex items-center gap-1.5 text-sm text-process-foreground transition-colors duration-150 hover:text-foreground"
        >
          <MessageSquare className="h-3.5 w-3.5 shrink-0" />
          <span>{t('message.question.asked')}</span>
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
                    <div className="text-sm text-process-foreground">{q.header || q.question}</div>
                    {ans.length > 0 ? (
                      <div className="mt-0.5 text-sm font-semibold text-foreground">
                        {ans.join('、')}
                      </div>
                    ) : (
                      <div className="mt-0.5 text-sm text-process-foreground/80">
                        {waiting
                          ? t('message.question.pendingAnswer')
                          : t('message.question.unanswered')}
                      </div>
                    )}
                  </div>
                )
              })
            ) : (
              <div className="text-sm text-process-foreground">{askedEvent.content}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * StreamingIndicator — 生成态/流式思考的扫光反馈（替代 Loader2 spinner）。
 * 仅用于流式生成态；真正的阻塞式 loading（加载历史、流程渲染中）仍使用 Loader2。
 * memo：流式期间 MessageItem 每个 delta 都重渲染，指示器文本固定，跳过重渲染。
 */
const StreamingIndicator = memo(function StreamingIndicator({ text }: { text?: string }) {
  const { t } = useTranslation('chat')
  const displayText = text ?? t('message.streaming')
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground pt-2">
      <ShimmerText text={displayText} />
    </span>
  )
})

function ThinkingGroup({ events, completed }: { events: EventItem[]; completed: boolean }) {
  const { t } = useTranslation('chat')
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
        className="group/mod flex items-center gap-1.5 text-sm text-process-foreground transition-colors duration-150 hover:text-foreground"
      >
        {completed ? (
          <span>{t('message.thinking')}</span>
        ) : (
          <ShimmerText text={t('message.thinking')} />
        )}
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
            <p key={`thinking-step-${index}`} className="leading-relaxed text-process-foreground">
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
