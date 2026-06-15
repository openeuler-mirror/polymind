'use client'

import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import {
  MessageSquarePlus,
  Search,
  Pin,
  MoreHorizontal,
  Trash2,
  ChevronLeft,
  PencilLine,
  Loader2,
  CircleCheck,
  AlertCircle,
  CircleMinus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'
import { MessageStatus } from '@/lib/types'
import type { Message } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { CustomIcon } from '@/components/ui/custom-icon'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function ConversationSidebar() {
  const [searchQuery, setSearchQuery] = useState('')
  const [isHydrated, setIsHydrated] = useState(false)
  const {
    conversations,
    currentConversationId,
    isSidebarOpen,
    setCurrentConversation,
    deleteConversation,
    toggleSidebar,
    togglePinConversation,
    updateConversationTitle,
  } = useChatStore()

  useLayoutEffect(() => {
    setIsHydrated(true)
  }, [])

  const handleSelectConversation = (convId: string, agentId?: string, sessionId?: string) => {
    setCurrentConversation(convId)
  }

  const filteredConversations = conversations.filter(c =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const pinnedConversations = filteredConversations.filter(c => c.pinned)
  const regularConversations = filteredConversations.filter(c => !c.pinned)

  if (!isSidebarOpen) {
    return null
  }

  return (
    <div className="flex h-full w-72 flex-col border-r border-border bg-sidebar overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-sidebar-border p-4">
        <div className="flex items-center gap-2">
          <CustomIcon src="/icon.svg" size={24} className="h-6 w-6 text-primary" alt="Logo" />
          <span className="text-lg font-semibold">PolyMind</span>
        </div>
        <Button variant="ghost" size="icon" onClick={toggleSidebar}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
      </div>

      {/* New Task Button */}
      <div className="p-3">
        <Button
          variant="outline"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          onClick={() => {
            const state = useChatStore.getState()
            const currentConv = state.conversations.find(c => c.id === state.currentConversationId)
            const agentId =
              currentConv?.agentId ||
              state.currentAgentId ||
              state.agents.find(a => a.status !== 'deleted')?.id
            if (agentId) {
              state.startNewTask(agentId)
            }
          }}
        >
          <MessageSquarePlus className="h-4 w-4" />
          <span>新任务</span>
        </Button>
      </div>

      {/* Search */}
      {/* <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索对话..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div> */}

      {/* Conversation List */}
      <ScrollArea className="flex-1 min-h-0 px-2">
        {/* Pinned */}
        {isHydrated && pinnedConversations.length > 0 && (
          <div className="mb-4">
            <div className="mb-2 flex items-center gap-2 px-2 text-xs font-medium text-muted-foreground">
              <Pin className="h-3 w-3" />
              已固定
            </div>
            <div className="space-y-1">
              {pinnedConversations.map(conv => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isActive={conv.id === currentConversationId}
                  onSelect={() => handleSelectConversation(conv.id, conv.agentId, conv.sessionId)}
                  onDelete={() => deleteConversation(conv.id)}
                  onTogglePin={() => togglePinConversation(conv.id)}
                  onRename={title => updateConversationTitle(conv.id, title)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Regular */}
        <div>
          {isHydrated && pinnedConversations.length > 0 && regularConversations.length > 0 && (
            <div className="mb-2 px-2 text-xs font-medium text-muted-foreground">最近对话</div>
          )}
          <div className="space-y-1">
            {isHydrated &&
              regularConversations.map(conv => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isActive={conv.id === currentConversationId}
                  onSelect={() => handleSelectConversation(conv.id, conv.agentId, conv.sessionId)}
                  onDelete={() => deleteConversation(conv.id)}
                  onTogglePin={() => togglePinConversation(conv.id)}
                  onRename={title => updateConversationTitle(conv.id, title)}
                />
              ))}
          </div>
        </div>

        {!isHydrated || filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <MessageSquarePlus className="mb-2 h-8 w-8" />
            <p className="text-sm">暂无对话</p>
          </div>
        ) : null}
      </ScrollArea>
    </div>
  )
}

interface ConversationItemProps {
  conversation: {
    id: string
    title: string
    updatedAt: Date
    pinned?: boolean
    agentId?: string
    agentName?: string
    isStreaming?: boolean
    messages?: Message[]
    lastMessageStatus?: MessageStatus
  }
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
  onTogglePin: () => void
  onRename: (title: string) => void
}

function getConversationStatus(
  conversation: ConversationItemProps['conversation']
): MessageStatus | null {
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

function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
  onTogglePin,
  onRename,
}: ConversationItemProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(conversation.title)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const editTitleRef = useRef(editTitle)
  editTitleRef.current = editTitle
  const convStatus = getConversationStatus(conversation)

  const handleStartRename = () => {
    setEditTitle(conversation.title)
    setIsEditing(true)
  }

  const commitRename = () => {
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
        isActive ? 'bg-accent text-accent-foreground' : 'bg-muted/60 hover:bg-muted'
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
            <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary/80">
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
          <DropdownMenuItem onClick={onTogglePin}>
            <Pin className="mr-2 h-4 w-4" />
            {conversation.pinned ? '取消固定' : '固定对话'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
