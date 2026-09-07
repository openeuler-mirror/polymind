'use client'

import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { ChevronLeft, MessageSquarePlus, Search } from 'lucide-react'
import { useChatStore } from '@/lib/store'
import { MessageStatus, type Conversation } from '@/lib/types'
import {
  useScheduledTaskStore,
  refreshScheduledAfterConversationDelete,
} from '@/lib/stores/scheduled-task-store'
import {
  runStatusToMessageStatus,
  type ScheduledTask,
  type ScheduledTaskConversation,
} from '@/services/scheduled-task-service'
import { sessionService } from '@/services/session-service'
import { abortScheduledRunForSession } from '@/lib/stores/scheduled-run-controller'
import { useToast } from '@/hooks/use-toast'
import { groupSidebarConversations, sortByUpdatedAtDesc } from '@/lib/sidebar-utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { CustomIcon } from '@/components/ui/custom-icon'
import { DeleteScheduledTaskDialog } from '@/components/tool-panel/scheduled-task/delete-task-dialog'
import { ConversationItem } from './conversation-item'
import { ScheduledTaskFolder } from './scheduled-task-folder'
import { SidebarSection } from './sidebar-section'

export function ConversationSidebar() {
  const [searchQuery, setSearchQuery] = useState('')
  const [isHydrated, setIsHydrated] = useState(false)
  const [deleteTaskTarget, setDeleteTaskTarget] = useState<ScheduledTask | null>(null)
  const { toast } = useToast()

  const {
    conversations,
    currentConversationId,
    isSidebarOpen,
    setCurrentConversation,
    deleteConversation,
    toggleSidebar,
    togglePinConversation,
    updateConversationTitle,
    sidebarSectionsCollapsed,
    toggleSidebarSection,
    scheduledTaskFoldersCollapsed,
    toggleScheduledTaskFolder,
  } = useChatStore()
  const scheduledTasks = useScheduledTaskStore(s => s.tasks)
  const summaryConversationsByTask = useScheduledTaskStore(s => s.conversationsByTask)
  const refreshScheduled = useScheduledTaskStore(s => s.refresh)
  const subscribe = useScheduledTaskStore(s => s.subscribe)
  const unsubscribe = useScheduledTaskStore(s => s.unsubscribe)

  // 仅当侧栏展开时订阅共享数据源，参与全局轮询生命周期。
  useEffect(() => {
    if (!isSidebarOpen) return
    subscribe()
    return () => unsubscribe()
  }, [isSidebarOpen, subscribe, unsubscribe])

  useLayoutEffect(() => {
    setIsHydrated(true)
  }, [])

  const handleSelectConversation = (convId: string) => {
    setCurrentConversation(convId)
  }

  // 定时任务区条目统一选择：已加载且有消息的本地会话直接选中，
  // 否则懒加载会话详情并打上 scheduledTaskId 标记，供删除任务时级联清理本地会话。
  const handleSelectScheduledConversation = (conversation: Conversation) => {
    const state = useChatStore.getState()
    const existing = state.conversations.find(
      c => !!conversation.sessionId && c.sessionId === conversation.sessionId
    )
    if (existing && existing.messages.length > 0) {
      state.setCurrentConversation(existing.id)
    } else if (conversation.agentId && conversation.sessionId) {
      void state.refreshConversation(conversation.agentId, conversation.sessionId, {
        scheduledTaskId: conversation.scheduledTaskId,
      })
    }
  }

  const notifyDeleteFailed = () =>
    toast({
      title: '删除失败',
      description: '服务端会话删除未成功，请稍后重试',
      variant: 'destructive',
    })

  // 定时任务区条目统一删除（确认式）：后端删 session 成功后由外键级联删除对应 run 记录。
  // 本地会话走 deleteConversation（后端成功才移除本地并中止挂流，失败保留条目提示重试）；
  // 仅存在于摘要中的条目直接删 session，成功后中止本地挂流并强制刷新。
  const handleDeleteScheduledConversation = async (conversation: Conversation) => {
    const state = useChatStore.getState()
    const existing = state.conversations.find(
      c => !!conversation.sessionId && c.sessionId === conversation.sessionId
    )
    if (existing) {
      const deleted = await state.deleteConversation(existing.id)
      if (!deleted) {
        notifyDeleteFailed()
        return
      }
      refreshScheduledAfterConversationDelete(existing)
      return
    }
    if (!conversation.agentId || !conversation.sessionId) return
    try {
      await sessionService.deleteSession(conversation.agentId, conversation.sessionId)
      abortScheduledRunForSession(conversation.sessionId)
    } catch (error) {
      console.error('Failed to delete scheduled conversation:', error)
      notifyDeleteFailed()
      return
    }
    void refreshScheduled(true)
  }

  const handleRenameScheduledConversation = async (conversation: Conversation, title: string) => {
    const state = useChatStore.getState()
    const existing = state.conversations.find(
      c => !!conversation.sessionId && c.sessionId === conversation.sessionId
    )
    if (existing) {
      state.updateConversationTitle(existing.id, title)
    } else if (conversation.agentId && conversation.sessionId) {
      try {
        await sessionService.updateConversation(conversation.agentId, conversation.sessionId, {
          title,
        })
        void refreshScheduled(true)
      } catch (error) {
        console.error('Failed to rename scheduled conversation:', error)
      }
    }
  }

  const handleDeleteConversation = async (conversationId: string) => {
    const conversation = useChatStore.getState().conversations.find(c => c.id === conversationId)
    const deleted = await deleteConversation(conversationId)
    if (!deleted) {
      notifyDeleteFailed()
      return
    }
    // 删除定时会话后强制刷新：服务端已连带删除执行记录，刷新可丢弃在途轮询与缓存。
    refreshScheduledAfterConversationDelete(conversation)
  }

  const normalizedQuery = searchQuery.trim().toLowerCase()

  const filteredConversations = useMemo(
    () => conversations.filter(c => c.title.toLowerCase().includes(normalizedQuery)),
    [conversations, normalizedQuery]
  )

  const groups = useMemo(
    () => groupSidebarConversations(filteredConversations),
    [filteredConversations]
  )

  // 定时任务区以“会话”为唯一实体渲染：
  // - 后端 conversations 摘要为权威来源（含 last_run_status）；
  // - 本地已打开/手动触发的会话更实时，按 sessionId 去重后优先垫场，
  //   覆盖手动触发后到下一次轮询（≤10s）之间的空窗。
  const scheduledFolders = useMemo(() => {
    const searching = normalizedQuery.length > 0
    const localByTask = new Map<string, Conversation[]>()
    for (const conversation of conversations) {
      if (!conversation.scheduledTaskId) continue
      const list = localByTask.get(conversation.scheduledTaskId) ?? []
      list.push(conversation)
      localByTask.set(conversation.scheduledTaskId, list)
    }

    const folders: Array<{
      task: ScheduledTask
      isRunning: boolean
      conversations: Conversation[]
      runningSessionIds: ReadonlySet<string>
    }> = []
    for (const task of scheduledTasks) {
      // 搜索时：任务名命中则整组展示；否则仅保留标题命中的条目。
      const taskNameMatches = !searching || task.name.toLowerCase().includes(normalizedQuery)
      const localAll = localByTask.get(task.id) ?? []
      const localSessionIds = new Set(
        localAll.map(c => c.sessionId).filter((s): s is string => Boolean(s))
      )
      const summaries = summaryConversationsByTask[task.id] ?? []
      const matchesQuery = (conversation: Conversation) =>
        taskNameMatches || conversation.title.toLowerCase().includes(normalizedQuery)
      const entries = sortByUpdatedAtDesc([
        ...localAll.filter(matchesQuery),
        ...summaries
          // 已有本地会话的摘要按 sessionId 去重（本地条目更实时，优先渲染）。
          .filter(summary => !localSessionIds.has(summary.id))
          .map(summary => summaryToConversation(task, summary))
          .filter(matchesQuery),
      ])
      if (entries.length === 0) continue
      const runningSessionIds = new Set(
        summaries
          .filter(summary => summary.last_run_status === 'running')
          .map(summary => summary.id)
      )
      // 手动触发后、摘要轮询返回前的空窗：本地流式中的会话同样禁删。
      for (const conversation of localAll) {
        if (conversation.isStreaming && conversation.sessionId) {
          runningSessionIds.add(conversation.sessionId)
        }
      }
      folders.push({
        task,
        isRunning: task.has_running_run,
        conversations: entries,
        runningSessionIds,
      })
    }
    folders.sort((a, b) => folderLatestTime(b) - folderLatestTime(a))
    return folders
  }, [conversations, scheduledTasks, summaryConversationsByTask, normalizedQuery])

  const scheduledEntryCount = scheduledFolders.reduce((sum, f) => sum + f.conversations.length, 0)
  const totalCount = groups.pinned.length + groups.regular.length + scheduledEntryCount

  const renderPinnedItem = (conversation: Conversation) => {
    return (
      <ConversationItem
        key={conversation.id}
        conversation={conversation}
        isActive={conversation.id === currentConversationId}
        onSelect={() => handleSelectConversation(conversation.id)}
        onDelete={() => handleDeleteConversation(conversation.id)}
        onTogglePin={() => togglePinConversation(conversation.id)}
        onRename={title => updateConversationTitle(conversation.id, title)}
      />
    )
  }

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
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索对话..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Conversation List */}
      <ScrollArea className="flex-1 min-h-0 px-2">
        {!isHydrated || totalCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <MessageSquarePlus className="mb-2 h-8 w-8" />
            <p className="text-sm">暂无对话</p>
          </div>
        ) : (
          <>
            {groups.pinned.length > 0 && (
              <SidebarSection
                label="已置顶"
                collapsed={sidebarSectionsCollapsed.pinned}
                onToggle={() => toggleSidebarSection('pinned')}
              >
                {groups.pinned.map(conversation => renderPinnedItem(conversation))}
              </SidebarSection>
            )}

            {groups.regular.length > 0 && (
              <SidebarSection
                label="普通任务"
                collapsed={sidebarSectionsCollapsed.regular}
                onToggle={() => toggleSidebarSection('regular')}
              >
                {groups.regular.map(conversation => (
                  <ConversationItem
                    key={conversation.id}
                    conversation={conversation}
                    isActive={conversation.id === currentConversationId}
                    onSelect={() => handleSelectConversation(conversation.id)}
                    onDelete={() => handleDeleteConversation(conversation.id)}
                    onTogglePin={() => togglePinConversation(conversation.id)}
                    onRename={title => updateConversationTitle(conversation.id, title)}
                  />
                ))}
              </SidebarSection>
            )}

            {scheduledFolders.length > 0 && (
              <SidebarSection
                label="定时任务"
                collapsed={sidebarSectionsCollapsed.scheduled}
                onToggle={() => toggleSidebarSection('scheduled')}
              >
                {scheduledFolders.map(
                  ({ task, isRunning, conversations: taskConversations, runningSessionIds }) => (
                    <ScheduledTaskFolder
                      key={task.id}
                      task={task}
                      isRunning={isRunning}
                      conversations={taskConversations}
                      runningSessionIds={runningSessionIds}
                      collapsed={!!scheduledTaskFoldersCollapsed[task.id]}
                      activeConversationId={currentConversationId}
                      onToggle={() => toggleScheduledTaskFolder(task.id)}
                      onSelectConversation={handleSelectScheduledConversation}
                      onDeleteConversation={handleDeleteScheduledConversation}
                      onRenameConversation={handleRenameScheduledConversation}
                      onRequestDeleteTask={setDeleteTaskTarget}
                    />
                  )
                )}
              </SidebarSection>
            )}
          </>
        )}
      </ScrollArea>

      <DeleteScheduledTaskDialog
        task={deleteTaskTarget}
        onClose={() => setDeleteTaskTarget(null)}
      />
    </div>
  )
}

/** 后端会话摘要 → 侧栏 Conversation 形态（不进 chat-store，仅供渲染/交互）。 */
function summaryToConversation(
  task: ScheduledTask,
  summary: ScheduledTaskConversation
): Conversation {
  return {
    // 摘要条目无本地 id，以 sessionId 充当渲染 key；选中/删除/重命名按 sessionId 分支。
    id: summary.id,
    title: summary.title || '新对话',
    messages: [],
    createdAt: new Date(summary.created_at),
    updatedAt: new Date(summary.updated_at),
    agentId: task.agent_id,
    // 与手动触发时的本地会话保持一致（见 execution.ts），执行前后徽标统一显示“定时”。
    agentName: '定时',
    sessionId: summary.id,
    scheduledTaskId: task.id,
    // run 被 max_run_records 裁剪后 last_run_status 为 null，兜底显示为已完成。
    lastMessageStatus:
      summary.last_run_status === null
        ? MessageStatus.COMPLETED
        : runStatusToMessageStatus(summary.last_run_status),
  }
}

function folderLatestTime(folder: { conversations: Conversation[] }): number {
  let latest = 0
  for (const conversation of folder.conversations) {
    // updatedAt 可能来自 sessionStorage 缓存（Date 被 JSON 序列化成字符串），
    // 因此统一用 new Date() 包裹，兼容 Date 与 ISO 字符串两种形态。
    const ts = new Date(conversation.updatedAt).getTime()
    if (Number.isFinite(ts) && ts > latest) latest = ts
  }
  return latest
}
