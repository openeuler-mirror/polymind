'use client'

import { useState, useEffect, useRef } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import {
  MessageSquarePlus,
  Search,
  Pin,
  MoreHorizontal,
  Trash2,
  ChevronLeft,
  Loader2,
  PencilLine,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'
import { cacheGet, CACHE_KEYS } from '@/lib/cache'
import type { Conversation, Agent } from '@/lib/types'
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
  const [agentsLoading, setAgentsLoading] = useState(true)
  const [isHydrated, setIsHydrated] = useState(false)
  const {
    conversations,
    currentConversationId,
    isSidebarOpen,
    createConversation,
    setCurrentConversation,
    deleteConversation,
    toggleSidebar,
    togglePinConversation,
    updateConversationTitle,
    agents: storeAgents,
  } = useChatStore()
  
  useEffect(() => {
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    const fetchAgents = async () => {
      // Check cache synchronously before any async work
      const cached = cacheGet<{ agents: Agent[]; conversations: Conversation[]; sessionAgentNames: [string, string][] }>(CACHE_KEYS.AGENTS_CONVERSATIONS)
      console.log('cached:',cached)
      if (cached) {
        // Apply cached data to store INSTANTLY — no loading spinner needed
        console.log('fetch agents from cache:',{ agents: cached.agents })
        setAgentsLoading(false)
        useChatStore.setState(state => {
          const existingIds = new Set(state.conversations.map(c => c.id))
          const existingSessionIds = new Set(state.conversations.map(c => c.sessionId).filter(Boolean))
          const freshConvs = cached.conversations.filter(
            c => !existingIds.has(c.id) && !existingSessionIds.has(c.sessionId)
          )
          const merged = [...freshConvs, ...state.conversations].sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          )
          return { agents: cached.agents, conversations: merged }
        })
        // Sync URL params from restored state
        const state = useChatStore.getState()
        const conv = state.conversations.find(c => c.id === state.currentConversationId)
        if (conv?.agentId && conv?.sessionId) {
          syncUrlParams(conv.agentId, conv.sessionId)
        }
      }

      // Always fetch fresh data in background
      try {
        if (!cached) setAgentsLoading(true)
        const store = useChatStore.getState()
        await store.fetchAgentsWithConversations()
        const state = useChatStore.getState()
        const conv = state.conversations.find(c => c.id === state.currentConversationId)
        if (conv?.agentId && conv?.sessionId) {
          syncUrlParams(conv.agentId, conv.sessionId)
        }
      } catch (err) {
        console.error('Failed to fetch agents:', err)
      } finally {
        setAgentsLoading(false)
      }
    }
    fetchAgents()
  }, [])

  const agents = storeAgents

  const syncUrlParams = (agentId?: string, sessionId?: string) => {
    const params = new URLSearchParams(window.location.search)
    if (agentId) params.set('agent', agentId)
    else params.delete('agent')
    if (sessionId) params.set('session', sessionId)
    else params.delete('session')
    const qs = params.toString()
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    window.history.replaceState(null, '', url)
  }

  const handleSelectConversation = (convId: string, agentId?: string, sessionId?: string) => {
    setCurrentConversation(convId)
    syncUrlParams(agentId, sessionId)
  }

  const handleCreateConversation = async (agentId: string, agentName?: string) => {
    const convId = await createConversation(agentId, agentName)
    const conv = useChatStore.getState().conversations.find(c => c.id === convId)
    syncUrlParams(agentId, conv?.sessionId)
  }

  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const pinnedConversations = filteredConversations.filter((c) => c.pinned)
  const regularConversations = filteredConversations.filter((c) => !c.pinned)

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

      {/* Agent List */}
      <ScrollArea className="p-3 max-h-48">
        {agentsLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : agents.filter(agent => agent.status !== 'deleted').length === 0 ? (
          <div className="text-center py-4 text-muted-foreground text-sm">
            暂无 Agent
          </div>
        ) : (
          agents.filter(agent => agent.status !== 'deleted').map((agent) => (
            <Button
              key={agent.id}
              className="w-full justify-start gap-2 mb-1"
              variant="ghost"
              onClick={async () => await handleCreateConversation(agent.id, agent.name)}
            >
              <MessageSquarePlus className="h-4 w-4" />
              <span className="truncate">{agent.name}</span>
            </Button>
          ))
        )}
      </ScrollArea>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索对话..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

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
              {pinnedConversations.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isActive={conv.id === currentConversationId}
                  onSelect={() => handleSelectConversation(conv.id, conv.agentId, conv.sessionId)}
                  onDelete={() => deleteConversation(conv.id)}
                  onTogglePin={() => togglePinConversation(conv.id)}
                  onRename={(title) => updateConversationTitle(conv.id, title)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Regular */}
        <div>
          {isHydrated && pinnedConversations.length > 0 && regularConversations.length > 0 && (
            <div className="mb-2 px-2 text-xs font-medium text-muted-foreground">
              最近对话
            </div>
          )}
          <div className="space-y-1">
            {isHydrated && regularConversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === currentConversationId}
                onSelect={() => handleSelectConversation(conv.id, conv.agentId, conv.sessionId)}
                onDelete={() => deleteConversation(conv.id)}
                onTogglePin={() => togglePinConversation(conv.id)}
                onRename={(title) => updateConversationTitle(conv.id, title)}
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
  }
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
  onTogglePin: () => void
  onRename: (title: string) => void
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
        isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'hover:bg-sidebar-accent/50'
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          {conversation.agentName && (
            <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary/80">
              {conversation.agentName}
            </span>
          )}
          {isEditing ? (
            <input
              ref={inputRef}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={commitRename}
              onKeyDown={handleKeyDown}
              className="h-6 w-full bg-sidebar-accent px-1.5 text-sm font-medium outline-none"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <p className="truncate text-sm font-medium">{conversation.title}</p>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatDistanceToNow(conversation.updatedAt, {
            addSuffix: true,
            locale: zhCN,
          })}
        </p>
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
            onClick={(e) => e.stopPropagation()}
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
          <DropdownMenuItem
            onClick={onDelete}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
