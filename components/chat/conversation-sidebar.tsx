'use client'

import { useState, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import {
  MessageSquarePlus,
  Search,
  Pin,
  MoreHorizontal,
  Trash2,
  Edit3,
  ChevronLeft,
  Code2,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'
import { agentService } from '@/services/agent-service'
import { Agent } from '@/lib/types'
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
    agents: storeAgents,
    setAgents,
    removeAgent,
  } = useChatStore()
  
  useEffect(() => {
    setIsHydrated(true)
  }, [])
  
  const isEmpty = !isHydrated || conversations.length === 0

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        setAgentsLoading(true)
        const data = await agentService.getAgents()
        setAgents(data)
      } catch (err) {
        console.error('Failed to fetch agents:', err)
      } finally {
        setAgentsLoading(false)
      }
    }
    fetchAgents()
  }, [setAgents])
  
  const agents = storeAgents

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
              onClick={async () => await createConversation(agent.id, agent.name)}
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
                  onSelect={() => setCurrentConversation(conv.id)}
                  onDelete={() => deleteConversation(conv.id)}
                  onTogglePin={() => togglePinConversation(conv.id)}
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
                onSelect={() => setCurrentConversation(conv.id)}
                onDelete={() => deleteConversation(conv.id)}
                onTogglePin={() => togglePinConversation(conv.id)}
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
}

function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
  onTogglePin,
}: ConversationItemProps) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        'group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 transition-colors',
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
          <p className="truncate text-sm font-medium">{conversation.title}</p>
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
        <DropdownMenuContent align="end">
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
