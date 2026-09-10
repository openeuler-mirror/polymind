'use client'

import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  PanelLeftClose,
  MessageSquarePlus,
  Search,
  MessageCircle,
  Clock,
  Bot,
  X,
  type LucideIcon,
} from 'lucide-react'
import { format } from 'date-fns'
import { enUS, zhCN, type Locale } from 'date-fns/locale'
import type { TFunction } from 'i18next'
import i18n from '@/lib/i18n/config'
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
import { cn } from '@/lib/utils'
import { groupSidebarConversations, sortByUpdatedAtDesc } from '@/lib/sidebar-utils'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { CustomIcon } from '@/components/ui/custom-icon'
import { DeleteScheduledTaskDialog } from '@/components/tool-panel/scheduled-task/delete-task-dialog'
import { ConversationItem } from './conversation-item'
import { ScheduledTaskFolder } from './scheduled-task-folder'
import { SidebarSection } from './sidebar-section'

export function ConversationSidebar() {
  const { t, i18n } = useTranslation('chat')
  const dateLocale = i18n.language.startsWith('zh') ? zhCN : enUS
  const [isHydrated, setIsHydrated] = useState(false)
  const [deleteTaskTarget, setDeleteTaskTarget] = useState<ScheduledTask | null>(null)
  const [searchDialogOpen, setSearchDialogOpen] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const { toast } = useToast()

  const {
    conversations,
    currentConversationId,
    isSidebarOpen,
    isRightPanelOpen,
    activeRightPanelTab,
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
      title: t('sidebar.toast.deleteFailedTitle'),
      description: t('sidebar.toast.deleteFailedDescription'),
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

  // 搜索弹窗选中结果：本地会话直接选中，未加载的定时任务摘要懒加载会话详情。
  const handleSearchSelect = (conversation: Conversation) => {
    const state = useChatStore.getState()
    const existing = state.conversations.find(c => c.id === conversation.id)
    if (existing) {
      state.setCurrentConversation(existing.id)
    } else if (conversation.agentId && conversation.sessionId) {
      void state.refreshConversation(conversation.agentId, conversation.sessionId, {
        scheduledTaskId: conversation.scheduledTaskId,
      })
    }
    setSearchDialogOpen(false)
  }

  const groups = useMemo(() => groupSidebarConversations(conversations), [conversations])

  // 弹窗搜索的可检索会话集合：本地会话 + 定时任务后端摘要（按 sessionId 去重）。
  const searchableConversations = useMemo(() => {
    const list: Conversation[] = [...conversations]
    const localSessionIds = new Set(
      conversations.map(c => c.sessionId).filter((s): s is string => Boolean(s))
    )
    for (const task of scheduledTasks) {
      const summaries = summaryConversationsByTask[task.id] ?? []
      for (const summary of summaries) {
        if (!localSessionIds.has(summary.id)) {
          list.push(summaryToConversation(task, summary, t))
        }
      }
    }
    return list
  }, [conversations, scheduledTasks, summaryConversationsByTask, t])

  const dialogQuery = searchKeyword.trim()

  // 搜索索引：每条会话的正文小写串只算一次（随 searchableConversations 变化重建），
  // 避免每次输入/每次重渲染都对全部消息重复 toLowerCase。
  const searchIndex = useMemo(() => {
    const index = new Map<string, SearchIndexEntry>()
    for (const conversation of searchableConversations) {
      const messages = (conversation.messages ?? []).map(message => {
        const content = message.content ?? ''
        return { content, lower: content.toLowerCase() }
      })
      index.set(conversation.id, {
        messages,
        haystack: messages.map(message => message.lower).join('\n'),
      })
    }
    return index
  }, [searchableConversations])

  // 命中标题或任意消息内容的会话，按最近更新时间排序；
  // 预览文本在同一次 memo 内算出，渲染阶段只读结果，不再逐行扫描消息。
  const dialogResults = useMemo(() => {
    const q = dialogQuery.toLowerCase()
    if (!q) return []
    return sortByUpdatedAtDesc(
      searchableConversations.filter(c => {
        if (c.title.toLowerCase().includes(q)) return true
        return searchIndex.get(c.id)?.haystack.includes(q) ?? false
      })
    ).map(conversation => ({
      conversation,
      snippet: pickConversationSnippet(searchIndex.get(conversation.id), q),
    }))
  }, [searchableConversations, searchIndex, dialogQuery])

  // 定时任务区以“会话”为唯一实体渲染：
  // - 后端 conversations 摘要为权威来源（含 last_run_status）；
  // - 本地已打开/手动触发的会话更实时，按 sessionId 去重后优先垫场，
  //   覆盖手动触发后到下一次轮询（≤10s）之间的空窗。
  const scheduledFolders = useMemo(() => {
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
      const localAll = localByTask.get(task.id) ?? []
      const localSessionIds = new Set(
        localAll.map(c => c.sessionId).filter((s): s is string => Boolean(s))
      )
      const summaries = summaryConversationsByTask[task.id] ?? []
      const entries = sortByUpdatedAtDesc([
        ...localAll,
        ...summaries
          // 已有本地会话的摘要按 sessionId 去重（本地条目更实时，优先渲染）。
          .filter(summary => !localSessionIds.has(summary.id))
          .map(summary => summaryToConversation(task, summary, t)),
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
  }, [conversations, scheduledTasks, summaryConversationsByTask, t])

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

  // 顶部导航项：仅「智能体 / 定时任务」映射到右侧面板 tab，高亮直接跟随面板真实状态；
  // 「新对话」是动作、「IM 频道」是占位，都不持有选中态，避免导航高亮与真实视图不一致。
  const navItems: { id: string; label: string; icon: LucideIcon; panelTabId: string | null }[] = [
    { id: 'chat', label: t('sidebar.nav.newChat'), icon: MessageSquarePlus, panelTabId: null },
    { id: 'im', label: t('sidebar.nav.imChannel'), icon: MessageCircle, panelTabId: null },
    { id: 'agent', label: t('sidebar.nav.agent'), icon: Bot, panelTabId: 'agent' },
    {
      id: 'scheduled-tasks',
      label: t('sidebar.nav.scheduledTasks'),
      icon: Clock,
      panelTabId: 'scheduled-tasks',
    },
  ]

  // 打开右侧面板并确保可见（agent / scheduled-tasks）。
  const openRightPanelTab = (tab: {
    id: string
    name: string
    icon: LucideIcon
    color: string
  }) => {
    const state = useChatStore.getState()
    state.addRightPanelTab(tab)
    state.setActiveRightPanelTab(tab.id)
    if (!state.isRightPanelOpen) {
      state.toggleRightPanel()
    }
  }

  const startNewTask = () => {
    const state = useChatStore.getState()
    const currentConv = state.conversations.find(c => c.id === state.currentConversationId)
    const agentId =
      currentConv?.agentId ||
      state.currentAgentId ||
      state.agents.find(a => a.status !== 'deleted')?.id
    if (agentId) {
      state.startNewTask(agentId)
    }
  }

  const handleNavClick = (navId: string) => {
    if (navId === 'chat') {
      startNewTask()
    } else if (navId === 'agent') {
      openRightPanelTab({
        id: 'agent',
        name: t('sidebar.panelTab.agent'),
        icon: Bot,
        color: 'text-cyan-500',
      })
    } else if (navId === 'scheduled-tasks') {
      openRightPanelTab({
        id: 'scheduled-tasks',
        name: t('sidebar.panelTab.scheduledTasks'),
        icon: Clock,
        color: 'text-violet-500',
      })
    } else if (navId === 'im') {
      toast({
        title: t('sidebar.toast.imChannelTitle'),
        description: t('sidebar.toast.imChannelDescription'),
      })
    }
  }

  return (
    <div className="flex h-full w-72 flex-col border-r border-border bg-sidebar overflow-hidden">
      {/* Header：高度与 chat-header（h-16）保持一致，两栏顶线对齐 */}
      <div className="flex h-16 shrink-0 items-center justify-between pl-4 pr-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <CustomIcon src="/icon.svg" size={24} className="h-6 w-6 text-primary" alt="Logo" />
            <span className="text-lg font-semibold">PolyMind</span>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={t('sidebar.action.searchConversation')}
            title={t('sidebar.action.searchConversation')}
            onClick={() => {
              setSearchKeyword('')
              setSearchDialogOpen(true)
            }}
          >
            <Search className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={t('sidebar.action.collapseSidebar')}
            onClick={toggleSidebar}
            title={t('sidebar.action.collapseSidebar')}
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Top Nav */}
      <nav className="px-3 pt-1 pb-2">
        {navItems.map(item => {
          const Icon = item.icon
          // 面板类入口的高亮来自面板真实状态：面板关闭或切到别的 tab 时自动熄灭
          const isActive =
            item.panelTabId !== null && isRightPanelOpen && activeRightPanelTab === item.panelTabId
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground'
                  : 'hover:bg-sidebar-accent/60'
              )}
            >
              <Icon className={cn('h-4 w-4', isActive && 'text-primary')} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Conversation List */}
      <ScrollArea className="flex-1 min-h-0 px-3">
        {!isHydrated ? (
          <div className="h-full" />
        ) : totalCount === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-background text-muted-foreground">
              <MessageSquarePlus className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium">{t('sidebar.empty.title')}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t('sidebar.empty.description')}
              </p>
            </div>
          </div>
        ) : (
          <>
            {groups.pinned.length > 0 && (
              <SidebarSection
                label={t('sidebar.section.pinned')}
                collapsed={sidebarSectionsCollapsed.pinned}
                onToggle={() => toggleSidebarSection('pinned')}
              >
                {groups.pinned.map(conversation => renderPinnedItem(conversation))}
              </SidebarSection>
            )}

            {groups.regular.length > 0 && (
              <SidebarSection
                label={t('sidebar.section.regular')}
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
                label={t('sidebar.section.scheduled')}
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

      {/* 搜索对话弹窗 */}
      <Dialog open={searchDialogOpen} onOpenChange={setSearchDialogOpen}>
        <DialogContent
          showCloseButton={false}
          className={cn(
            'max-w-2xl gap-0 overflow-hidden p-0 sm:max-w-2xl top-[12%] translate-y-0',
            dialogQuery.length > 0
              ? 'grid-rows-[auto_1fr] h-[min(72vh,560px)]'
              : 'grid-rows-[auto] h-auto'
          )}
        >
          <DialogTitle className="sr-only">{t('sidebar.search.title')}</DialogTitle>

          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              aria-label={t('sidebar.search.title')}
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              placeholder={t('sidebar.search.placeholder')}
              className="flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button
              type="button"
              aria-label={t('sidebar.search.clear')}
              onClick={() => setSearchKeyword('')}
              className="text-muted-foreground transition-colors hover:text-foreground"
              title={t('sidebar.search.clearTitle')}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {dialogQuery.length > 0 && (
            <ScrollArea className="min-h-0 px-3 py-3">
              {dialogResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Search className="h-7 w-7" />
                  </div>
                  <p className="text-sm text-muted-foreground">{t('sidebar.search.empty')}</p>
                </div>
              ) : (
                <ul className="space-y-1">
                  {dialogResults.map(({ conversation, snippet }) => (
                    <li key={conversation.id}>
                      <button
                        type="button"
                        onClick={() => handleSearchSelect(conversation)}
                        className={cn(
                          'flex w-full items-start gap-4 rounded-xl px-4 py-3 text-left transition-colors',
                          conversation.id === currentConversationId
                            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                            : 'hover:bg-muted'
                        )}
                      >
                        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <MessageCircle className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">
                              {conversation.title}
                            </span>
                            <span className="ml-auto shrink-0 text-xs text-muted-foreground/60">
                              {formatConversationDate(conversation.updatedAt, dateLocale)}
                            </span>
                          </div>
                          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                            {snippet}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** 后端会话摘要 → 侧栏 Conversation 形态（不进 chat-store，仅供渲染/交互）。 */
function summaryToConversation(
  task: ScheduledTask,
  summary: ScheduledTaskConversation,
  t: TFunction
): Conversation {
  return {
    // 摘要条目无本地 id，以 sessionId 充当渲染 key；选中/删除/重命名按 sessionId 分支。
    id: summary.id,
    title: summary.title || t('sidebar.untitled'),
    messages: [],
    createdAt: new Date(summary.created_at),
    updatedAt: new Date(summary.updated_at),
    agentId: task.agent_id,
    // 与手动触发时的本地会话保持一致（见 execution.ts），执行前后徽标统一显示“定时”。
    agentName: t('sidebar.scheduledBadge'),
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

/** 安全格式化会话日期：兼容 Date 与 ISO 字符串，非法日期返回空串避免 date-fns 抛错。 */
function formatConversationDate(date: Date, locale: Locale): string {
  const ts = new Date(date).getTime()
  if (!Number.isFinite(ts)) return ''
  return format(new Date(date), i18n.t('chat:sidebar.dateFormat'), { locale })
}

/** 搜索索引条目：正文原文 + 已小写正文，搜索判定与预览共用，避免重复计算。 */
interface SearchIndexEntry {
  messages: { content: string; lower: string }[]
  /** 全部正文的小写拼接，用于「是否命中」判定 */
  haystack: string
}

/**
 * 从搜索索引中提取预览文本：优先命中关键词的消息，其次最新一条有内容的消息。
 * 单次倒序遍历，不做数组反转、不重复小写化（query 已由调用方转小写）。
 */
function pickConversationSnippet(entry: SearchIndexEntry | undefined, query: string): string {
  if (!entry || entry.messages.length === 0) return ''
  let latest = ''
  let matched = ''
  for (let i = entry.messages.length - 1; i >= 0; i--) {
    const message = entry.messages[i]
    if (!latest && message.content.trim()) latest = message.content
    if (!matched && message.lower.includes(query)) matched = message.content
    if (latest && matched) break
  }
  return (matched || latest).replace(/\s+/g, ' ').trim()
}
