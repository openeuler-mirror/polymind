'use client'

import { create } from 'zustand'

import {
  scheduledTaskService,
  runStatusToMessageStatus,
  SCHEDULED_RUNS_PER_TASK,
  type ScheduledTask,
  type ScheduledTaskRun,
} from '@/services/scheduled-task-service'
import { cacheGet, cacheSet, CACHE_KEYS } from '@/lib/cache'
import { useChatStore } from '@/lib/store'
import type { ScheduledConversationSnapshot } from '@/lib/stores/chat-store'

/** 全局唯一轮询间隔：侧栏与执行记录页共享同一定时器，避免重复请求。 */
const POLL_INTERVAL_MS = 10000
/** 侧栏会话缓存 TTL。 */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

interface ScheduledSidebarCache {
  tasks: ScheduledTask[]
  runsByTask: Record<string, ScheduledTaskRun[]>
}

// 模块级单例轮询状态：不放入 store state，避免无关渲染。
let pollTimer: number | null = null
let activeSubscribers = 0
let fetching = false

interface ScheduledTaskSlice {
  tasks: ScheduledTask[]
  runsByTask: Record<string, ScheduledTaskRun[]>
  loading: boolean
  error: string
  /** 触发一次拉取（防并发叠加）。 */
  refresh: () => Promise<void>
  /** 订阅数据源：首个订阅者启动全局轮询。 */
  subscribe: () => void
  /** 取消订阅：最后一个订阅者停止全局轮询。 */
  unsubscribe: () => void
}

/**
 * 把轮询到的执行记录同步为侧边栏会话：新出现的 session 建占位会话，
 * 已存在的会话只刷新元数据（状态/流式标记/时间），不覆盖本地消息，
 * 也不切换当前会话。这样调度器自动触发的执行无需手动刷新页面即可出现在侧栏。
 */
function syncScheduledRunsToChat(
  tasks: ScheduledTask[],
  runsByTask: Record<string, ScheduledTaskRun[]>
) {
  try {
    const now = new Date()
    const snapshots: ScheduledConversationSnapshot[] = []
    for (const task of tasks) {
      for (const run of runsByTask[task.id] ?? []) {
        if (!run.session_id) continue
        const startedAt = run.started_at ? new Date(run.started_at) : null
        const createdAt = run.created_at ? new Date(run.created_at) : now
        snapshots.push({
          sessionId: run.session_id,
          taskId: task.id,
          agentId: task.agent_id,
          title: task.name,
          isStreaming: run.status === 'running',
          lastMessageStatus: runStatusToMessageStatus(run.status),
          updatedAt: startedAt ?? createdAt,
          createdAt,
        })
      }
    }
    useChatStore.getState().mergeScheduledConversationSnapshots(snapshots)
  } catch (error) {
    // 同步失败不应影响任务列表本身。
    console.error('Failed to sync scheduled runs into conversations:', error)
  }
}

const cached = cacheGet<ScheduledSidebarCache>(CACHE_KEYS.SCHEDULED_SIDEBAR)

export const useScheduledTaskStore = create<ScheduledTaskSlice>((set, get) => ({
  tasks: cached?.tasks ?? [],
  runsByTask: cached?.runsByTask ?? {},
  loading: !cached,
  error: '',

  refresh: async () => {
    if (fetching) return
    fetching = true
    try {
      const data = await scheduledTaskService.listTasks(undefined, SCHEDULED_RUNS_PER_TASK)
      const grouped: Record<string, ScheduledTaskRun[]> = {}
      for (const task of data) {
        grouped[task.id] = task.recent_runs ?? []
      }
      set({ tasks: data, runsByTask: grouped, error: '' })
      cacheSet(CACHE_KEYS.SCHEDULED_SIDEBAR, { tasks: data, runsByTask: grouped }, CACHE_TTL_MS)
      // 非手动触发的执行（调度器到点）在此被并入会话列表，侧边栏自动出现。
      syncScheduledRunsToChat(data, grouped)
    } catch (error) {
      console.error('Failed to load scheduled tasks:', error)
      set({ error: '加载定时任务失败' })
    } finally {
      fetching = false
      set({ loading: false })
    }
  },

  subscribe: () => {
    activeSubscribers += 1
    if (activeSubscribers === 1) {
      void get().refresh()
      pollTimer = window.setInterval(() => {
        // 页面不可见时不拉取，减少后台开销。
        if (!document.hidden) void get().refresh()
      }, POLL_INTERVAL_MS)
    }
  },

  unsubscribe: () => {
    activeSubscribers = Math.max(0, activeSubscribers - 1)
    if (activeSubscribers === 0 && pollTimer) {
      window.clearInterval(pollTimer)
      pollTimer = null
    }
  },
}))
