'use client'

import { create } from 'zustand'

import {
  scheduledTaskService,
  SCHEDULED_RUNS_PER_TASK,
  type ScheduledTask,
  type ScheduledTaskRun,
} from '@/services/scheduled-task-service'
import { cacheGet, cacheSet, CACHE_KEYS } from '@/lib/cache'
import { useChatStore } from '@/lib/store'
import { createLatestRunner } from '@/lib/stores/latest-runner'
import { abortScheduledTaskRuns } from '@/lib/stores/scheduled-run-controller'

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
/** 手动刷新（force）可绕过在途互斥，结果按“最后发起者生效”合并。 */
const fetchLatest = createLatestRunner()

interface ScheduledTaskSlice {
  tasks: ScheduledTask[]
  runsByTask: Record<string, ScheduledTaskRun[]>
  loading: boolean
  error: string
  /** 触发一次拉取（防并发叠加）。 */
  refresh: (force?: boolean) => Promise<void>
  /** 删除任务并清理本地会话与缓存：中止在途挂流、调用后端删除、强制刷新。 */
  deleteTaskAndPurge: (taskId: string) => Promise<void>
  /** 订阅数据源：首个订阅者启动全局轮询。 */
  subscribe: () => void
  /** 取消订阅：最后一个订阅者停止全局轮询。 */
  unsubscribe: () => void
}

const cached = cacheGet<ScheduledSidebarCache>(CACHE_KEYS.SCHEDULED_SIDEBAR)

export const useScheduledTaskStore = create<ScheduledTaskSlice>((set, get) => ({
  tasks: cached?.tasks ?? [],
  runsByTask: cached?.runsByTask ?? {},
  loading: !cached,
  error: '',

  refresh: async (force = false) => {
    // 后台轮询保持互斥（不叠加）；手动刷新（force）总是发起新请求，
    // 避免恰逢轮询在途时"立即更新"被静默吞掉。
    // 注意：loading 仅表示首载（初始值 !cached），这里不再置 true，
    // 否则每 10s 轮询会翻转 loading 导致骨架屏/刷新按钮闪烁。
    await fetchLatest.run(force, async isLatest => {
      try {
        const data = await scheduledTaskService.listTasks(undefined, SCHEDULED_RUNS_PER_TASK)
        // 已有更新的请求在途时，丢弃本次过期结果，避免旧响应覆盖新数据。
        if (!isLatest()) return
        const grouped: Record<string, ScheduledTaskRun[]> = {}
        for (const task of data) {
          grouped[task.id] = task.recent_runs ?? []
        }
        set({ tasks: data, runsByTask: grouped, error: '' })
        cacheSet(CACHE_KEYS.SCHEDULED_SIDEBAR, { tasks: data, runsByTask: grouped }, CACHE_TTL_MS)
      } catch (error) {
        if (!isLatest()) return
        console.error('Failed to load scheduled tasks:', error)
        set({ error: '加载定时任务失败' })
      } finally {
        if (isLatest()) {
          set({ loading: false })
        }
      }
    })
  },

  deleteTaskAndPurge: async taskId => {
    // 先等待后端删除成功，再中止本地挂流与清理会话：
    // abortScheduledTaskRuns 只中断本地 SSE 挂流、不会停止后端 run，若在删除前
    // 中止而删除失败（如 409 TASK_BUSY），会话会停在“生成中”且不再收尾。
    // 删除成功后再中止，配合下方的 purge，挂流收尾写入对已清理会话为空操作。
    await scheduledTaskService.deleteTask(taskId)
    abortScheduledTaskRuns(taskId)
    // 服务端已级联删除该任务的全部执行会话，本地只需按 taskId 清理
    // 已打开的定时会话详情，不需要枚举 recent_runs 作为删除范围。
    useChatStore.getState().purgeConversationsByScheduledTask(taskId)
    // 顺带清理该任务在侧栏的文件夹折叠状态，避免 localStorage 残留死键。
    useChatStore.getState().clearScheduledTaskFolderCollapsed(taskId)
    await get().refresh(true)
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
