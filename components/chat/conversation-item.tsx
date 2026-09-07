'use client'

import { useEffect, useRef, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import {
  AlertCircle,
  CircleCheck,
  CircleMinus,
  Loader2,
  MoreHorizontal,
  PencilLine,
  Pin,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { MessageStatus } from '@/lib/types'
import type { Message } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface ConversationItemData {
  id: string
  title: string
  updatedAt: Date
  pinned?: boolean
  agentId?: string
  agentName?: string
  sessionId?: string
  isStreaming?: boolean
  messages?: Message[]
  lastMessageStatus?: MessageStatus
}

interface ConversationItemProps {
  conversation: ConversationItemData
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
  /** 仅在 showPinAction 开启时需要提供；定时任务会话按任务归组，固定无意义。 */
  onTogglePin?: () => void
  onRename: (title: string) => void
  showActions?: boolean
  /** 是否显示“固定对话”操作；定时任务会话按任务归组，固定无意义，可关闭。 */
  showPinAction?: boolean
  /** 是否禁用“删除”操作（如定时任务会话执行中不可删除，与侧栏运行中保护对齐）。 */
  disableDelete?: boolean
  agentBadgeClassName?: string
  /** 用于层级缩进（如定时任务文件夹内的会话条目）。 */
  className?: string
}

function getConversationStatus(conversation: ConversationItemData): MessageStatus | null {
  if (conversation.isStreaming) return MessageStatus.GENERATING
  const messages = conversation.messages ?? []
  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
  if (lastAssistant?.status) return lastAssistant.status
  return conversation.lastMessageStatus ?? null
}

const statusIconMap: Record<MessageStatus, React.ComponentType<{ className?: string }>> = {
  [MessageStatus.GENERATING]: Loader2,
  [MessageStatus.COMPLETED]: CircleCheck,
  [MessageStatus.ERROR]: AlertCircle,
  [MessageStatus.INTERRUPTED]: CircleMinus,
}

const statusIconClass: Record<MessageStatus, string> = {
  [MessageStatus.GENERATING]: 'animate-spin text-muted-foreground',
  [MessageStatus.COMPLETED]: 'text-emerald-500',
  [MessageStatus.ERROR]: 'text-red-500',
  [MessageStatus.INTERRUPTED]: 'text-gray-500',
}

export function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
  onTogglePin,
  onRename,
  showActions = true,
  showPinAction = true,
  disableDelete = false,
  agentBadgeClassName,
  className,
}: ConversationItemProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(conversation.title)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const editTitleRef = useRef(editTitle)
  editTitleRef.current = editTitle
  // 重命名提交的重入保护：onBlur 与外部 mousedown 会先后触发 commitRename，
  const renameCommittedRef = useRef(false)
  const convStatus = getConversationStatus(conversation)

  const handleStartRename = () => {
    setEditTitle(conversation.title)
    renameCommittedRef.current = false
    setIsEditing(true)
  }

  const commitRename = () => {
    if (renameCommittedRef.current) return
    renameCommittedRef.current = true
    const trimmed = editTitleRef.current.trim()
    if (trimmed && trimmed !== conversation.title) {
      onRename(trimmed)
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      commitRename()
    } else if (e.key === 'Escape') {
      setEditTitle(conversation.title)
      renameCommittedRef.current = true
      setIsEditing(false)
    }
  }

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  useEffect(() => {
    if (!isEditing) return
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        commitRename()
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [isEditing])

  return (
    <div
      ref={containerRef}
      onClick={isEditing ? undefined : onSelect}
      className={cn(
        'group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 transition-colors',
        isEditing && 'inset-ring-2 inset-ring-primary bg-sidebar',
        isActive ? 'bg-accent text-accent-foreground' : 'bg-muted/60 hover:bg-muted',
        className
      )}
    >
      {convStatus &&
        (() => {
          const IconComponent = statusIconMap[convStatus]
          return <IconComponent className={cn('h-5 w-5 shrink-0', statusIconClass[convStatus])} />
        })()}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          {isEditing ? (
            <input
              ref={inputRef}
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onBlur={commitRename}
              onKeyDown={handleKeyDown}
              className="h-6 w-full bg-sidebar-accent px-1.5 text-sm font-medium outline-none"
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <p className="truncate text-sm font-medium">{conversation.title}</p>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2">
          {conversation.agentName && (
            <span
              className={cn(
                'shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium',
                agentBadgeClassName ?? 'bg-primary/10 text-primary/80'
              )}
            >
              {conversation.agentName}
            </span>
          )}
          <span className="shrink-0 text-[11px] text-muted-foreground/60">
            {formatDistanceToNow(conversation.updatedAt, {
              addSuffix: true,
              locale: zhCN,
            })}
          </span>
        </div>
      </div>

      {showActions && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-7 shrink-0',
                'w-0 !p-0 opacity-0 overflow-hidden',
                'group-hover:w-auto group-hover:!p-1 group-hover:opacity-100',
                'transition-all duration-200'
              )}
              onClick={e => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end">
            <DropdownMenuItem onClick={handleStartRename}>
              <PencilLine className="mr-2 h-4 w-4" />
              重命名
            </DropdownMenuItem>
            {showPinAction && (
              <DropdownMenuItem onClick={onTogglePin}>
                <Pin className="mr-2 h-4 w-4" />
                {conversation.pinned ? '取消固定' : '固定对话'}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={onDelete}
              disabled={disableDelete}
              title={disableDelete ? '执行中不可删除' : undefined}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
