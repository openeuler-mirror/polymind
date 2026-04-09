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
  Edit3,
  ChevronLeft,
  Code2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { TimeAgo } from '@/components/ui/time-ago'

export function ConversationSidebar() {
  const [searchQuery, setSearchQuery] = useState('')
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
  } = useChatStore()

  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const pinnedConversations = filteredConversations.filter((c) => c.pinned)
  const regularConversations = filteredConversations.filter((c) => !c.pinned)

  if (!isSidebarOpen) {
    return (
      <div className="flex h-full w-16 flex-col items-center border-r border-border bg-sidebar py-4">
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                className="mb-4"
              >
                <CustomIcon src="/icon.svg" size={20} className="h-5 w-5 text-primary" alt="Menu" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">展开侧边栏</TooltipContent>
          </Tooltip>


          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={createConversation}
                className="mb-2"
              >
                <MessageSquarePlus className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">问答</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => window.open('#APP_GENERATION_URL_PLACEHOLDER', '_blank')}
                className="mb-2"
              >
                <Code2 className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">应用生成</TooltipContent>
          </Tooltip>

        </TooltipProvider>
      </div>
    )
  }

  return (
    <div className="flex h-full w-72 flex-col border-r border-border bg-sidebar">
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

      {/* Action Buttons */}
      <div className="p-3 space-y-2">
        <Button
          className="w-full justify-start gap-2"
          variant="ghost"
          onClick={createConversation}
        >
          <MessageSquarePlus className="h-4 w-4" />
          问答
        </Button>
        <Button
          className="w-full justify-start gap-2"
          variant="ghost"
          onClick={() => window.open('#APP_GENERATION_URL_PLACEHOLDER', '_blank')}
        >
          <Code2 className="h-4 w-4" />
          应用生成
        </Button>
      </div>

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
      <ScrollArea className="flex-1 px-2">
        {/* Pinned */}
        {pinnedConversations.length > 0 && (
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
                  onRename={updateConversationTitle}
                />
              ))}
            </div>
          </div>
        )}

        {/* Regular */}
        <div>
          {pinnedConversations.length > 0 && regularConversations.length > 0 && (
            <div className="mb-2 px-2 text-xs font-medium text-muted-foreground">
              最近对话
            </div>
          )}
          <div className="space-y-1">
            {regularConversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === currentConversationId}
                onSelect={() => setCurrentConversation(conv.id)}
                onDelete={() => deleteConversation(conv.id)}
                onTogglePin={() => togglePinConversation(conv.id)}
                onRename={updateConversationTitle}
              />
            ))}
          </div>
        </div>

        {filteredConversations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <MessageSquarePlus className="mb-2 h-8 w-8" />
            <p className="text-sm">暂无对话</p>
          </div>
        )}
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
  onRename,
}: ConversationItemProps & { onRename: (id: string, title: string) => void }) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [newTitle, setNewTitle] = useState(conversation.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isRenaming) {
      // 确保输入框已经完全渲染完成
      const timer = setTimeout(() => {
        if (inputRef.current) {
          console.log('Focusing input...');
          // 强制聚焦输入框
          inputRef.current.focus();
          inputRef.current.select();
          // 手动触发光标闪烁
          inputRef.current.setSelectionRange(
            inputRef.current.value.length,
            inputRef.current.value.length
          );
          console.log('Input focused:', document.activeElement === inputRef.current);
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isRenaming]);

  const handleRenameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRenaming(true);
  };

  const handleRenameSubmit = (e: React.FormEvent | React.KeyboardEvent) => {
    if ('preventDefault' in e) {
      e.preventDefault();
    }
    if (newTitle.trim()) {
      onRename(conversation.id, newTitle.trim());
    }
    setIsRenaming(false);
    // 重命名完成后，将焦点设置到容器上
    setTimeout(() => {
      if (containerRef.current) {
        containerRef.current.focus();
      }
    }, 0);
  };

  const handleRenameCancel = (e: React.MouseEvent | React.FocusEvent | React.KeyboardEvent) => {
    if ('stopPropagation' in e) {
      e.stopPropagation();
    }
    setNewTitle(conversation.title);
    setIsRenaming(false);
    // 取消重命名后，将焦点设置到容器上
    setTimeout(() => {
      if (containerRef.current) {
        containerRef.current.focus();
      }
    }, 0);
  };

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      onClick={onSelect}
      className={cn(
        'group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 transition-colors',
        isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'hover:bg-sidebar-accent/50'
      )}
    >
      <div className="min-w-0 flex-1">
        {isRenaming ? (
          <form onSubmit={handleRenameSubmit} className="w-full">
            <input
              ref={inputRef}
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onBlur={(e) => {
                // 只有当点击的不是下拉菜单时才保存
                if (!e.relatedTarget || !(e.relatedTarget as HTMLElement).closest('[data-slot="dropdown-menu"]')) {
                  handleRenameSubmit(e);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleRenameSubmit(e);
                } else if (e.key === 'Escape') {
                  handleRenameCancel(e);
                }
              }}
              className="w-full rounded-md border border-primary bg-transparent px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </form>
        ) : (
          <>
            <p className="truncate text-sm font-medium">{conversation.title}</p>
            <p className="text-xs text-muted-foreground">
              <TimeAgo date={conversation.updatedAt} />
            </p>
          </>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 group-hover:opacity-100"
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
          <DropdownMenuItem onClick={handleRenameClick}>
            <Edit3 className="mr-2 h-4 w-4" />
            重命名
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
