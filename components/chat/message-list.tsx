'use client'

import { memo } from 'react'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { Message, ToolCall, Attachment } from '@/lib/types'
import { useState } from 'react'

interface MessageListProps {
  messages: Message[]
}

export function MessageList({ messages }: MessageListProps) {
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

        {/* Tool Calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-2">
            {message.toolCalls.map((toolCall) => (
              <ToolCallBadge key={toolCall.id} toolCall={toolCall} />
            ))}
          </div>
        )}

        {/* Message Content */}
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
  if (!content && isStreaming) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>思考中...</span>
      </div>
    )
  }

  // Simple markdown-like rendering
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []

  lines.forEach((line, idx) => {
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={idx} className="mb-2 mt-4 text-lg font-semibold first:mt-0">
          {line.slice(3)}
        </h2>
      )
    } else if (line.startsWith('### ')) {
      elements.push(
        <h3 key={idx} className="mb-2 mt-3 text-base font-semibold first:mt-0">
          {line.slice(4)}
        </h3>
      )
    } else if (line.startsWith('- ')) {
      elements.push(
        <li key={idx} className="ml-4 list-disc">
          {renderInlineMarkdown(line.slice(2))}
        </li>
      )
    } else if (line.match(/^\d+\. /)) {
      elements.push(
        <li key={idx} className="ml-4 list-decimal">
          {renderInlineMarkdown(line.replace(/^\d+\. /, ''))}
        </li>
      )
    } else if (line.startsWith('```')) {
      // Skip code fence markers
    } else if (line.trim()) {
      elements.push(
        <p key={idx} className="mb-2 last:mb-0">
          {renderInlineMarkdown(line)}
        </p>
      )
    }
  })

  return (
    <>
      {elements}
      {isStreaming && <span className="ml-0.5 inline-block h-4 w-0.5 animate-blink bg-foreground" />}
    </>
  )
}

function renderInlineMarkdown(text: string): React.ReactNode {
  // Handle bold text
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      )
    }
    // Handle inline code
    const codeParts = part.split(/(`[^`]+`)/g)
    return codeParts.map((codePart, codeIdx) => {
      if (codePart.startsWith('`') && codePart.endsWith('`')) {
        return (
          <code
            key={`${idx}-${codeIdx}`}
            className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm"
          >
            {codePart.slice(1, -1)}
          </code>
        )
      }
      return codePart
    })
  })
}

function ToolCallBadge({ toolCall }: { toolCall: ToolCall }) {
  const isRunning = toolCall.status === 'running'
  const isCompleted = toolCall.status === 'completed'

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
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
