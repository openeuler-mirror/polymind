'use client'

import { ChevronRight, Clock, MoreHorizontal, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Conversation } from '@/lib/types'
import type { ScheduledTask } from '@/services/scheduled-task-service'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConversationItem } from './conversation-item'

interface ScheduledTaskFolderProps {
  task: ScheduledTask
  /** 任务是否有 running 状态的 run（后端 has_running_run，删除任务保护用）。 */
  isRunning: boolean
  /** 会话条目：后端摘要（未打开）与本地会话按 sessionId 去重合并，统一以会话条目渲染。 */
  conversations: Conversation[]
  /** running 状态（或本地流式中）的 sessionId 集合，用于禁用运行中条目的删除。 */
  runningSessionIds: ReadonlySet<string>
  collapsed: boolean
  /** 当前选中的会话 id，用于高亮定时任务区内的会话条目。 */
  activeConversationId: string | null
  onToggle: () => void
  onSelectConversation: (conversation: Conversation) => void
  onDeleteConversation: (conversation: Conversation) => void
  onRenameConversation: (conversation: Conversation, title: string) => void
  onRequestDeleteTask: (task: ScheduledTask) => void
}

export function ScheduledTaskFolder({
  task,
  isRunning,
  conversations,
  runningSessionIds,
  collapsed,
  activeConversationId,
  onToggle,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  onRequestDeleteTask,
}: ScheduledTaskFolderProps) {
  const open = !collapsed
  const total = conversations.length

  return (
    <div className="group/folder mb-1">
      <Collapsible open={open} onOpenChange={onToggle}>
        {/* 外层 flex 容器内：左侧为折叠触发区（含图标、名称、会话数），
            右侧绝对定位的菜单按钮叠在会话数之上，悬停时通过 group 互斥切换。 */}
        <div className="relative flex items-center">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
            >
              {/* 悬停时左侧时钟图标丝滑切换为展开箭头，体现“可折叠”语义。 */}
              <span className="relative grid h-3.5 w-3.5 shrink-0 place-items-center">
                <Clock className="absolute h-3.5 w-3.5 transition-all duration-200 ease-out group-hover/folder:scale-0 group-hover/folder:opacity-0 group-hover/folder:rotate-45" />
                <ChevronRight
                  className={cn(
                    'absolute h-3 w-3 scale-0 opacity-0 transition-all duration-200 ease-out group-hover/folder:scale-100 group-hover/folder:opacity-100',
                    open && 'rotate-90'
                  )}
                />
              </span>
              <span className="flex-1 truncate text-left">{task.name}</span>
              {/* 最右侧：默认展示会话数徽标，悬停时丝滑淡出让位给三点菜单。 */}
              <span className="relative grid h-5 min-w-5 shrink-0 place-items-center">
                {total > 0 && (
                  <span className="absolute rounded-full bg-muted px-1.5 py-0.5 text-[10px] transition-all duration-200 ease-out group-hover/folder:scale-0 group-hover/folder:opacity-0">
                    {total}
                  </span>
                )}
              </span>
            </button>
          </CollapsibleTrigger>
          {/* 悬停时显现的三点菜单：绝对定位叠在会话数位置，点击仅触发菜单不折叠。 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-5 w-5 -translate-y-1/2 scale-50 p-0 opacity-0 transition-all duration-200 ease-out group-hover/folder:scale-100 group-hover/folder:opacity-100 group-focus-within/folder:scale-100 group-focus-within/folder:opacity-100"
                onClick={e => e.stopPropagation()}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end">
              <DropdownMenuItem
                onClick={() => onRequestDeleteTask(task)}
                disabled={isRunning}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                删除定时任务
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <CollapsibleContent className="space-y-1 pt-0.5">
          {conversations.map(conversation => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              isActive={conversation.id === activeConversationId}
              onSelect={() => onSelectConversation(conversation)}
              onDelete={() => onDeleteConversation(conversation)}
              onRename={title => onRenameConversation(conversation, title)}
              showPinAction={false}
              disableDelete={
                !!conversation.sessionId && runningSessionIds.has(conversation.sessionId)
              }
            />
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
