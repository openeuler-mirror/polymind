'use client'

import { memo, useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { format } from 'date-fns'
import { enUS, zhCN } from 'date-fns/locale'
import {
  Bot,
  Copy,
  Check,
  RefreshCw,
  Wrench,
  FileText,
  Image as ImageIcon,
  Loader2,
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
  Search,
  Globe,
  FolderOpen,
  FileEdit,
  FilePlus,
  ListTodo,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import mermaid from 'mermaid'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { MarkdownContent } from '@/components/markdown/markdown-content'
import { CodeBlock } from '@/components/markdown/code-block'
import type { Message, ToolCall, Attachment, EventItem, QuestionInfo } from '@/lib/types'
import { formatToolOutput } from '@/lib/format-utils'
import { describeToolCall, previewToolOutput, type ToolCallKind } from '@/lib/tool-call-display'
import { resolveCodeLanguage } from '@/lib/artifacts'
import { ArtifactCard } from './artifact-card'
import { StreamErrorLine } from './stream-error-line'
import { MessageUsageBadge } from './message-usage'
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

  // 只给最后一条助手回复挂重新生成：后端按会话取目标，指定更早的回复无从表达。
  let lastAssistantIndex = -1
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'assistant') {
      lastAssistantIndex = i
      break
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      {messages.map((message, index) => (
        <MessageItem
          key={message.id}
          message={message}
          onRegenerate={index === lastAssistantIndex ? onRegenerate : undefined}
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
  const { t, i18n } = useTranslation('chat')
  const dateLocale = i18n.language.startsWith('zh') ? zhCN : enUS
  const [copied, setCopied] = useState(false)
  // 回答完毕后，过程模块（深度思考/工具调用/提问）折叠在「已完成」耗时行下
  const [processExpanded, setProcessExpanded] = useState(false)
  const isUser = message.role === 'user'
  const usage = message.usage

  // 派生状态：当前消息是否有等待回答的提问（此时不显示"生成回复中"加载态）
  const hasPendingQuestion =
    !isUser && !!message.question?.length && message.questionStatus === 'pending'

  // 中断态：由下面的状态行/提示统一表达。
  const interrupted = !isUser && message.status === 'interrupted'

  // 错误态：stream.error / client.error 事件落定后，由 StreamErrorLine 单行表达。
  const errored = !isUser && message.status === 'error'

  const artifacts = !isUser ? (message.artifacts ?? []) : []
  const hasArtifacts = artifacts.length > 0

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
    <div className={cn('animate-message-in', isUser && 'flex flex-row-reverse')}>
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

        {/* 已完成耗时 / 中断态：点击展开/收起过程模块（深度思考/工具调用/提问） */}
        {processCollapsible && (
          <button
            onClick={() => setProcessExpanded(!processExpanded)}
            className="group/mod flex w-fit items-center gap-2 text-sm text-process-foreground transition-colors duration-150 hover:text-foreground"
          >
            <span>
              {interrupted
                ? t('message.interrupted')
                : durationText
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

        {interrupted && !processCollapsible && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            <span>{t('message.interrupted')}</span>
          </div>
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
                // 思考段仍在生成 ⟺ 它是最后一个分组且消息仍在流式输出。
                const thinkingActive = !!message.isStreaming && groupIndex === groups.length - 1
                return (
                  <ThinkingGroup
                    key={`thinking-group-${groupIndex}`}
                    events={group.events ?? []}
                    completed={!thinkingActive}
                  />
                )
              } else if (group.type === 'delta-group') {
                const deltaContent = (group.events ?? []).map(event => event.content).join('')
                if (!deltaContent) return null
                return <MessageContent key={`delta-group-${groupIndex}`} content={deltaContent} />
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
              {isUser ? (
                <div className="rounded-2xl bg-user-bubble px-4 py-3">
                  <div className="whitespace-pre-wrap break-words text-[15px] leading-[1.75]">
                    {message.content}
                    {message.isStreaming && (
                      <span className="ml-0.5 inline-block h-4 w-0.5 animate-blink bg-foreground" />
                    )}
                  </div>
                </div>
              ) : (
                <MessageContent content={message.content} isStreaming={message.isStreaming} />
              )}
            </>
          )}

        {errored && (
          <div
            className={cn(
              (eventGroups.length > 0 || !!message.content) && 'mt-2',
              hasArtifacts && 'mb-2'
            )}
          >
            <StreamErrorLine error={message.streamError ?? null} />
          </div>
        )}

        {/* 产物卡片：常显在正文下方（ADR-D6），不随过程模块折叠；
            卡片内的下载/复制按钮只在悬停**该卡片**时出现（具名 group，见 ArtifactCard） */}
        {hasArtifacts && (
          <div className="grid grid-cols-2 gap-2">
            {artifacts.map(artifact => (
              <ArtifactCard key={artifact.id} artifact={artifact} agentId={agentId} />
            ))}
          </div>
        )}

        {/* 操作行：mt-2 + 父级 gap-1 = 12px；助手侧「操作 → 时间」，用户侧反转为「时间 → 复制」 */}
        <div
          className={cn(
            'mt-2 flex items-center gap-2 text-xs text-muted-foreground',
            isUser && 'flex-row-reverse gap-4'
          )}
        >
          {/* 复制/重新生成/用量在两侧都常显，不随悬停变化 */}
          {!message.isStreaming && (
            <div className="message-actions flex items-center gap-1">
              <div className="flex items-center gap-1">
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy}>
                        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('message.action.copy')}</TooltipContent>
                  </Tooltip>

                  {/* onRegenerate 缺省时不渲染按钮，而非渲染成点了没反应的图标 */}
                  {!isUser && onRegenerate && (
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => onRegenerate(message.id)}
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

              {/* 本轮用量：与复制/重新生成同排，点击展开明细。
                  流式期间不展示 —— 用量在后端跨 step 累计，收尾才完整。 */}
              {usage && <MessageUsageBadge usage={usage} />}
            </div>
          )}

          <span suppressHydrationWarning>
            {format(
              message.timestamp,
              i18n.language.startsWith('zh') ? 'M月d日 HH:mm' : 'MMM d HH:mm',
              { locale: dateLocale }
            )}
          </span>
        </div>
      </div>
    </div>
  )
})

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

            return <CodeBlock code={code} language={language} className="mb-2" />
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
        <span className="ml-2 text-sm text-muted-foreground">{t('message.mermaid.rendering')}</span>
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
  const [isExpanded, setIsExpanded] = useState(false)

  // 处理换行符，确保在 HTML 中正确显示
  const formatForDisplay = (text: string): string => {
    if (!text) return ''
    return text.split('\\n').join('\n')
  }

  // 输出：终态 output 优先；执行中只有增量 outputRaw（tool.call.delta 边跑边推）
  const rawOutput = toolCall.output ?? toolCall.outputRaw
  const formattedOutput = rawOutput ? formatToolOutput(rawOutput) : null
  const displayOutput = formattedOutput ? formatForDisplay(formattedOutput) : null

  // 工具行图标的配色只由状态决定（图标本身由工具类别决定）。
  // 执行中不做旋转动画：整行的时间线里大量图标同时旋转会干扰阅读，配色足以表达状态。
  const statusIconClass: Record<string, string> = {
    running: 'text-primary',
    completed: 'text-accent',
    error: 'text-destructive',
    pending: 'text-muted-foreground',
  }
  const iconClass = statusIconClass[toolCall.status] || statusIconClass.pending

  // 图标按工具「类别」映射（read/exec/编辑/搜索…），未知工具默认用 Wrench
  const toolIconByKind: Partial<Record<ToolCallKind, LucideIcon>> = {
    read: BookOpen,
    exec: SquareTerminal,
    edit: FileEdit,
    write: FilePlus,
    search: Search,
    list: FolderOpen,
    web: Globe,
    delegate: Cpu,
    question: MessageSquare,
    todo: ListTodo,
    skill: Sparkles,
  }
  // 一行描述「这一步做了什么」：标签（类别）+ 目标（入参摘要）
  const description = describeToolCall(toolCall)
  const ToolIcon = toolIconByKind[description.kind] || Wrench
  const toolLabel = description.labelKey
    ? t(description.labelKey, { defaultValue: toolCall.name })
    : toolCall.name

  // 提取命令文本（用于 exec 工具展开面板的终端视图）。
  // 按归一化类别判断，`bash` / `run_command` 等别名同样能命中。
  const getExecCommand = (): string | null => {
    if (description.kind !== 'exec' || !toolCall.input) return null
    const input = toolCall.input as Record<string, unknown>
    return (input.command as string) || null
  }
  const execCommand = getExecCommand()

  // 折叠态下的一行结果预览：错误必显示，正常结果只在「短输出」时显示，
  // 让用户不必展开就知道这一步产出了什么（长输出仍走展开面板）。
  const errorText = toolCall.error
    ? typeof toolCall.error === 'string'
      ? toolCall.error
      : JSON.stringify(toolCall.error)
    : ''
  const inlineNote = isRunning
    ? null
    : toolCall.status === 'error'
      ? (previewToolOutput(errorText) ?? null)
      : previewToolOutput(displayOutput)

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
                <ToolIcon className={cn('h-3.5 w-3.5 shrink-0', iconClass)} />
              </span>
            </TooltipTrigger>
            {description.kind === 'read' && (
              <TooltipContent>{t('message.toolCall.viewFile')}</TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
        <span className="shrink-0 text-xs font-medium">{toolLabel}</span>
        {description.target && (
          <>
            <span className="shrink-0 text-xs text-process-foreground/40">·</span>
            <span className="min-w-0 max-w-[70%] truncate font-mono text-xs text-process-foreground/90">
              {description.target}
            </span>
          </>
        )}
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

      {/* 结果预览：单行短内容 / 错误信息，避免用户必须展开才能知道这一步的产出 */}
      {!isExpanded && inlineNote && (
        <div
          className={cn(
            'ml-5 truncate pl-0 text-xs',
            toolCall.status === 'error' ? 'text-destructive' : 'text-process-foreground/60'
          )}
        >
          {inlineNote}
        </div>
      )}

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
  // 展开态由「提问状态 + 用户覆盖」派生：已作答默认展开（答案和原问题都要看得见），
  // 手动开合只对当前状态生效，状态从 pending 变为 replied 后自动展开。
  const [manualCard, setManualCard] = useState<{
    status: 'pending' | 'replied' | 'rejected'
    expanded: boolean
  } | null>(null)
  const cardExpanded =
    manualCard && manualCard.status === status ? manualCard.expanded : status === 'replied'

  const toggleCard = () => setManualCard({ status, expanded: !cardExpanded })

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
          onClick={toggleCard}
          className="group/mod flex min-w-0 max-w-full items-center gap-1.5 text-sm text-process-foreground transition-colors duration-150 hover:text-foreground"
        >
          <MessageSquare className="h-3.5 w-3.5 shrink-0" />
          <span className="shrink-0">{t('message.question.asked')}</span>
          {questions?.[0] && (
            <>
              <span className="shrink-0 text-process-foreground/40">·</span>
              <span className="min-w-0 max-w-[60%] truncate text-process-foreground/90">
                {questions[0].header || questions[0].question}
              </span>
            </>
          )}
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
                // header 通常是短标题，question 是完整问题；两者一致时不重复展示
                const showHeader = !!q.header && q.header !== q.question
                return (
                  <div key={i} className="space-y-1">
                    {showHeader && (
                      <div className="truncate text-xs text-process-foreground/70">{q.header}</div>
                    )}
                    {q.question && (
                      <div className="text-sm leading-relaxed text-foreground/90">{q.question}</div>
                    )}
                    <div className="flex items-start gap-2">
                      <span className="shrink-0 pt-px text-xs text-process-foreground/60">
                        {t('message.question.answer')}
                      </span>
                      {ans.length > 0 ? (
                        <span className="text-sm font-semibold text-foreground">
                          {ans.join('、')}
                        </span>
                      ) : (
                        <span className="text-sm text-process-foreground/80">
                          {waiting
                            ? t('message.question.pendingAnswer')
                            : t('message.question.unanswered')}
                        </span>
                      )}
                    </div>
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
  const scrollRef = useRef<HTMLDivElement>(null)
  // 仅当用户停留在底部时才自动跟随，避免上翻查看历史时被拽回底部。
  const pinnedToBottom = useRef(true)
  // 展开态由「阶段 + 用户覆盖」派生，不用 effect 同步 state，避免级联渲染：
  // - 生成中（completed=false）默认展开，思考完毕自动闭合；
  // - 用户手动开合只对当前阶段生效，阶段切换后回到自动跟随。
  const [manual, setManual] = useState<{ completed: boolean; expanded: boolean } | null>(null)
  const expanded = manual && manual.completed === completed ? manual.expanded : !completed

  const toggle = () => {
    if (!expanded) pinnedToBottom.current = true
    setManual({ completed, expanded: !expanded })
  }

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  // 依赖 events 而非 events.length：思考增量追加到同一个 thinking 事件，
  // 数组长度不变但内容在变，用 length 作依赖会导致后续增量不再触发滚动。
  useEffect(() => {
    const el = scrollRef.current
    if (expanded && !completed && el && pinnedToBottom.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [events, expanded, completed])

  return (
    <div>
      <button
        onClick={toggle}
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
          onScroll={handleScroll}
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
