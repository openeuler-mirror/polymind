'use client'

import { memo, useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import {
  User,
  Bot,
  Copy,
  Check,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Wrench,
  FileText,
  Image as ImageIcon,
  Loader2,
  CheckCircle2,
  Info,
  AlertTriangle,
  Lightbulb,
  ChevronDown,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import mermaid from 'mermaid'
import 'katex/dist/katex.min.css'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { Message, ToolCall, Attachment, EventItem } from '@/lib/types'

interface MessageListProps {
  messages: Message[]
}

export function MessageList({ messages }: MessageListProps) {
  const [isHydrated, setIsHydrated] = useState(false)
  
  useEffect(() => {
    setIsHydrated(true)
  }, [])
  
  if (!isHydrated || messages.length === 0) {
    return null
  }
  
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
    </div>
  )
}

const MessageItem = memo(function MessageItem({
  message,
}: {
  message: Message
}) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // 调试：打印 message 对象
  console.log('Rendering message:', message);

  return (
    <div
      className={cn(
        'group flex gap-4 animate-message-in',
        isUser && 'flex-row-reverse'
      )}
    >
      <Avatar className={cn('h-8 w-8 shrink-0', isUser ? 'bg-primary' : 'bg-accent')}>
        <AvatarFallback className={isUser ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground'}>
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>

      <div
        className={cn(
          'flex max-w-[80%] flex-col gap-2',
          isUser && 'items-end'
        )}
      >
        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.attachments.map((attachment) => (
              <AttachmentBadge key={attachment.id} attachment={attachment} />
            ))}
          </div>
        )}

        {/* Events in order */}
        {message.events && message.events.length > 0 && (
          <div className="space-y-2">
            {(() => {
              const groupedEvents: any[] = []
              let currentThinkingGroup: any[] = []
              let currentDeltaGroup: any[] = []
              
              message.events.forEach((event, index) => {
                // Skip tool.call.started events because we'll show the tool call when we get the response
                if (event.type === 'tool.call.started') {
                  return
                }
                
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
              
              return groupedEvents
            })().map((group: any, groupIndex: number) => {
              // 调试：打印 group 对象
              console.log('Rendering group:', group);
              if (group.type === 'thinking-group') {
                return (
                  <div key={`thinking-group-${groupIndex}`} className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm space-y-2">
                    {group.events.map((event: EventItem, index: number) => (
                      <div key={`thinking-${groupIndex}-${index}`} className="flex items-center gap-2">
                        {message.content ? (
                          <CheckCircle2 className="h-4 w-4 text-accent" />
                        ) : (
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        )}
                        <span className="text-muted-foreground">{event.content}</span>
                      </div>
                    ))}
                  </div>
                )
              } else if (group.type === 'delta-group') {
                const deltaContent = group.events.map((event: EventItem) => event.content).join('')
                return (
                  <div key={`delta-group-${groupIndex}`} className="rounded-2xl px-4 py-3 bg-card border border-border">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <MessageContent content={deltaContent} />
                    </div>
                  </div>
                )
              } else if (group.type === 'tool.call.response') {
                return (
                  <div key={`${group.type}-${group.toolCall?.id || groupIndex}`}>
                    {group.toolCall && <ToolCallBadge toolCall={group.toolCall} />}
                  </div>
                )
              }
              return null
            })}
          </div>
        )}

        {/* Message Content - now displayed in events section */}
        {(!message.events || message.events.length === 0) && (
          <div
            className={cn(
              'rounded-2xl px-4 py-3',
              isUser
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border border-border'
            )}
          >
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <MessageContent content={message.content} isStreaming={message.isStreaming} />
            </div>
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

          {!isUser && !message.isStreaming && (
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={handleCopy}
                    >
                      {copied ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>复制</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>重新生成</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <ThumbsUp className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>有帮助</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <ThumbsDown className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>没帮助</TooltipContent>
                </Tooltip>
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
}: {
  content: string
  isStreaming?: boolean
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
          p: ({ children }) => (
            <p className="mb-2 last:mb-0">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="mb-2 list-disc space-y-1 pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2 list-decimal space-y-1 pl-5">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-sm leading-relaxed">{children}</li>
          ),
          code: ({ className, children, node, ...props }) => {
            const isInline = !className
            const codeString = String(children).replace(/\n$/, '')

            if (isInline) {
              return (
                <code
                  className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm"
                  {...props}
                >
                  {children}
                </code>
              )
            }

            const match = /language-(\w+)/.exec(className || '')
            const language = match ? match[1] : ''

            if (language === 'mermaid') {
              return <MermaidChart chart={codeString} />
            }

            return (
              <code className={className} {...props}>
                {children}
              </code>
            )
          },
          pre: ({ children }) => (
            <pre className="mb-2 overflow-x-auto rounded-lg bg-muted p-3">{children}</pre>
          ),
          blockquote: ({ children, ...props }) => {
            return <Admonition type="blockquote">{children}</Admonition>
          },
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-primary underline hover:text-primary/80"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="mb-2 overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-sm">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/50">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-left font-semibold">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2">{children}</td>
          ),
          hr: () => <hr className="my-4 border-border" />,
          img: ({ src, alt }) => (
            <img
              src={src}
              alt={alt}
              className="max-w-full rounded-lg"
              loading="lazy"
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
      {isStreaming && <span className="ml-0.5 inline-block h-4 w-0.5 animate-blink bg-foreground" />}
    </>
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
        (child) =>
          child &&
          typeof child === 'object' &&
          'type' in child &&
          child.type === 'details'
      )
      setIsDetails(hasDetails)
    }
  }, [children])

  const getAdmonitionConfig = () => {
    const typeMap: Record<string, { icon: React.ReactNode; color: string; bg: string; label: string }> = {
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

    return typeMap[type?.toLowerCase() || ''] || {
      icon: null,
      color: 'border-muted-foreground/30',
      bg: 'border-l-4',
      label: '',
    }
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
          <ChevronDown
            className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
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

  return (
    <div className="rounded-lg border border-border bg-muted/50 text-sm">
      <div 
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isRunning ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        ) : isCompleted ? (
          <CheckCircle2 className="h-4 w-4 text-accent" />
        ) : (
          <Wrench className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="font-medium">{toolCall.name}</span>
        {toolCall.duration && (
          <span className="text-muted-foreground">
            {(toolCall.duration / 1000).toFixed(1)}s
          </span>
        )}
        <span className={`ml-auto transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-down h-4 w-4 text-muted-foreground">
            <path d="m6 9 6 6 6-6"/>
          </svg>
        </span>
      </div>
      {isExpanded && (
        <div className="px-3 pb-2 space-y-1">
          {toolCall.displayText && (
            <div className="text-muted-foreground">
              {toolCall.displayText}
            </div>
          )}
          {toolCall.input && (
            <div className="text-xs text-muted-foreground">
              <span>输入: </span>
              <code>{JSON.stringify(toolCall.input)}</code>
            </div>
          )}
          {toolCall.output && (
            <div className="text-xs text-muted-foreground">
              <span>输出: </span>
              <code>{toolCall.output}</code>
            </div>
          )}
          {toolCall.error && (
            <div className="text-xs text-red-500">
              <span>错误: </span>
              <code>{toolCall.error}</code>
            </div>
          )}
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
