'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { History, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { useChatStore } from '@/lib/store'
import { useScheduledTaskStore } from '@/lib/stores/scheduled-task-store'
import {
  scheduledTaskService,
  type ScheduledTaskRunWithTask,
} from '@/services/scheduled-task-service'
import { RunRecordsTimeline } from './run-timeline'
import {
  buildTaskScheduleLabels,
  filterRuns,
  groupRunsByGranularity,
  RUN_TASK_ALL,
  type RunRecordsView,
} from './run-records-utils'

/** 服务端聚合接口的分页批次大小：每次多取一批用于筛选/滚动（与展示页大小独立可调）。 */
const FETCH_BATCH_SIZE = 20
/** 首屏与「加载更多」每次新增展示的记录条数。 */
const PAGE_SIZE = 20
/** 筛选命中率低时自动补拉服务端批次的上限：避免一次筛选触发无上限请求，剩余交给「加载更多」。 */
const MAX_AUTO_BACKFILL_BATCHES = 5

interface RunRecordsController {
  records: ScheduledTaskRunWithTask[] // 已加载的窗口（服务端倒序，按需追加）
  visible: ScheduledTaskRunWithTask[] // 窗口内命中筛选、且落在展示范围内的记录
  matched: ScheduledTaskRunWithTask[] // 窗口内命中筛选条件的全部记录
  total: number // 服务端（未筛选）总条数
  loading: boolean // 有记录请求在途（含补拉与轮询重载）
  error: string | null // 记录请求失败文案（与任务列表的 error 区分）
  hasMore: boolean // 展示范围之外或服务端尚有未加载数据
  refresh: () => Promise<void>
  loadMore: () => void
}

/**
 * 执行记录数据源：跨任务聚合接口按服务端分页累积成本地窗口，筛选/分组/分页都在窗口内完成——
 * 筛选条件变化时按需补拉，免去为「按任务/状态筛选」再另开一套后端查询参数。
 */
export function useRunRecords(
  view: RunRecordsView,
  options: { enabled?: boolean } = {}
): RunRecordsController {
  const { enabled = true } = options
  const { t } = useTranslation('tool-panel')
  const runsByTask = useScheduledTaskStore(s => s.runsByTask)
  const storeRefresh = useScheduledTaskStore(s => s.refresh)
  const subscribe = useScheduledTaskStore(s => s.subscribe)
  const unsubscribe = useScheduledTaskStore(s => s.unsubscribe)

  const [records, setRecords] = useState<ScheduledTaskRunWithTask[]>([])
  const [total, setTotal] = useState(0)
  const [exhausted, setExhausted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 展示范围随筛选条件缓存：切换筛选时自然回到一页，无需在 effect 中重置 state。
  const [visibleWindow, setVisibleWindow] = useState<{ key: string; count: number }>({
    key: '',
    count: PAGE_SIZE,
  })

  // 以下 ref 供异步流程读取最新值（state 闭包会过期）。
  const recordsRef = useRef<ScheduledTaskRunWithTask[]>([])
  const totalRef = useRef(0) // 服务端总条数（未筛选），用于判断是否还有未加载数据
  const exhaustedRef = useRef(false) // 服务端已取空（返回不足一批），不再继续请求
  /** 记录请求互斥：同一时刻只允许一次，避免乱序覆盖与请求叠加。 */
  const inFlightRef = useRef(false)
  const viewRef = useRef(view) // 最新筛选条件，供异步补拉读取

  // 挂载即订阅共享数据源，复用全局轮询（侧栏/任务列表同一定时器）。
  useEffect(() => {
    if (!enabled) return
    subscribe()
    return () => unsubscribe()
  }, [enabled, subscribe, unsubscribe])

  // 每次渲染后同步筛选条件，保证补拉流程读到最新值。
  useEffect(() => {
    viewRef.current = view
  })

  /** 保证「筛选后可见条数」不少于 target：不足则按批补拉服务端数据，每批 FETCH_BATCH_SIZE 条。 */
  const ensureVisible = useCallback(
    async (target: number) => {
      if (inFlightRef.current) return
      inFlightRef.current = true
      setLoading(true)
      try {
        let batches = 0
        for (;;) {
          const loaded = recordsRef.current
          // 停手条件依次为：筛选已够 / 服务端取空 / 补拉批次上限 / 已取满总数（首轮 total 未知，放行一次）。
          if (filterRuns(loaded, viewRef.current).length >= target) break
          if (exhaustedRef.current || batches >= MAX_AUTO_BACKFILL_BATCHES) break
          if (loaded.length > 0 && loaded.length >= totalRef.current) break

          const result = await scheduledTaskService.listRunsPage({
            limit: FETCH_BATCH_SIZE,
            offset: recordsRef.current.length,
          })
          batches += 1
          recordsRef.current = [...recordsRef.current, ...result.items]
          totalRef.current = result.total
          setRecords(recordsRef.current)
          setTotal(result.total)
          if (result.items.length < FETCH_BATCH_SIZE) {
            exhaustedRef.current = true
            setExhausted(true)
            break
          }
        }
        setError(null)
      } catch (fetchError) {
        console.error('Failed to load run history:', fetchError)
        setError(t('scheduledTask.runs.loadFailed'))
      } finally {
        inFlightRef.current = false
        setLoading(false)
      }
    },
    [t]
  )

  /** 重新拉取已加载窗口：轮询发现新记录/状态变化时刷新，同时保留已加载深度。 */
  const reloadWindow = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setLoading(true)
    try {
      const limit = Math.max(FETCH_BATCH_SIZE, recordsRef.current.length)
      const result = await scheduledTaskService.listRunsPage({ limit, offset: 0 })
      // 一次请求结果覆盖窗口状态：records/total/exhausted 及其 ref 镜像同步更新。
      recordsRef.current = result.items
      totalRef.current = result.total
      exhaustedRef.current = result.items.length < limit
      setRecords(result.items)
      setTotal(result.total)
      setExhausted(exhaustedRef.current)
      setError(null)
    } catch (fetchError) {
      console.error('Failed to reload run history:', fetchError)
      setError(t('scheduledTask.runs.loadFailed'))
    } finally {
      inFlightRef.current = false
      setLoading(false)
    }
  }, [t])

  // 首屏与筛选/粒度变化：展示范围回到一页，并按需补拉匹配记录。
  const viewKey = `${view.granularity}|${view.taskId}|${view.status}`
  const visibleCount = visibleWindow.key === viewKey ? visibleWindow.count : PAGE_SIZE
  useEffect(() => {
    if (!enabled) return
    void ensureVisible(PAGE_SIZE)
  }, [enabled, viewKey, ensureVisible])

  // 轮询发现执行记录内容变化时重载窗口，新结果无需手动刷新即可出现。
  const runsSignatureRef = useRef('')
  useEffect(() => {
    const signature = JSON.stringify(runsByTask)
    const changed = runsSignatureRef.current !== '' && signature !== runsSignatureRef.current
    runsSignatureRef.current = signature
    if (!enabled || !changed) return
    void reloadWindow()
  }, [runsByTask, enabled, reloadWindow])

  const refresh = useCallback(async () => {
    const before = JSON.stringify(useScheduledTaskStore.getState().runsByTask)
    await storeRefresh(true)
    // 数据确实变化时由签名 effect 自动重载；未变化才显式重载，避免双请求。
    if (before === JSON.stringify(useScheduledTaskStore.getState().runsByTask)) {
      await reloadWindow()
    }
  }, [storeRefresh, reloadWindow])

  const loadMore = useCallback(() => {
    const target = visibleCount + PAGE_SIZE
    setVisibleWindow({ key: viewKey, count: target })
    void ensureVisible(target)
  }, [visibleCount, viewKey, ensureVisible])

  const matched = useMemo(() => filterRuns(records, view), [records, view])
  const visible = useMemo(() => matched.slice(0, visibleCount), [matched, visibleCount])
  const hasMore = matched.length > visibleCount || (!exhausted && records.length < total)

  return { records, visible, matched, total, loading, error, hasMore, refresh, loadMore }
}

interface RunRecordsProps {
  view: RunRecordsView
  controller: RunRecordsController
  onResetFilters: () => void // 清除筛选（无匹配结果时提供的快捷入口）
}

/** 执行记录列表主体：分组时间线 + 加载更多。 */
export function RunRecords({ view, controller, onResetFilters }: RunRecordsProps) {
  const { t } = useTranslation('tool-panel')
  const tasks = useScheduledTaskStore(s => s.tasks)
  const { visible, matched, records, total, loading, error, hasMore, loadMore } = controller

  // 这两项的文案在渲染时由 i18n 决定（与 task-card 同一做法），刻意不 memo：
  // 否则切换语言后 memo 不会重算，分组标题与调度规则会停留在旧语言。
  const scheduleLabels = buildTaskScheduleLabels(tasks)
  const groups = groupRunsByGranularity(visible, view.granularity)

  const handleViewConversation = (record: ScheduledTaskRunWithTask) => {
    if (!record.session_id) return
    void useChatStore.getState().refreshConversation(record.agent_id, record.session_id, {
      // 本地尚无该会话（超出 recent_runs 上限/缓存清空）时也要建成定时任务条目，避免落入普通会话列表。
      scheduledTaskId: record.task_id,
    })
  }

  const filtered = view.taskId !== RUN_TASK_ALL || view.status !== 'all'
  const loadMoreButton = hasMore ? (
    <Button variant="outline" size="sm" disabled={loading} onClick={loadMore}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {t('scheduledTask.runs.loadMore')}
    </Button>
  ) : null

  // 加载失败（error 已设置）时优先展示错误而非空态
  if (tasks.length === 0 && !loading && !error) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <History className="h-6 w-6" />
          </EmptyMedia>
          <EmptyTitle>{t('scheduledTask.runs.emptyTitle')}</EmptyTitle>
          <EmptyDescription>{t('scheduledTask.runs.emptyDescription')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  if (loading && records.length === 0) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-16 w-full rounded-md" />
        ))}
      </div>
    )
  }

  if (error && records.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t('scheduledTask.empty.loadFailedTitle')}</EmptyTitle>
          <EmptyDescription>{error}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  if (matched.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <History className="h-6 w-6" />
          </EmptyMedia>
          <EmptyTitle>
            {filtered ? t('scheduledTask.runs.noMatchTitle') : t('scheduledTask.runs.emptyTitle')}
          </EmptyTitle>
          <EmptyDescription>
            {filtered
              ? t('scheduledTask.runs.noMatchDescription')
              : t('scheduledTask.runs.notRunYet')}
          </EmptyDescription>
        </EmptyHeader>
        {filtered && (
          <EmptyContent>
            {/* 命中率低时窗口内可能为空，但服务端仍有未加载数据：保留继续扫描的入口 */}
            {loadMoreButton}
            <Button variant="ghost" size="sm" onClick={onResetFilters}>
              {t('scheduledTask.runs.clearFilters')}
            </Button>
          </EmptyContent>
        )}
      </Empty>
    )
  }

  return (
    <div>
      <RunRecordsTimeline
        groups={groups}
        scheduleLabels={scheduleLabels}
        onOpenConversation={handleViewConversation}
      />

      <div className="flex flex-col items-center gap-3 pt-6">
        <div className="text-xs text-muted-foreground">
          {filtered
            ? t('scheduledTask.runs.filteredCount', {
                visible: visible.length,
                loaded: records.length,
                total,
              })
            : t('scheduledTask.runs.shownCount', { visible: visible.length, total })}
        </div>
        {loadMoreButton}
      </div>
    </div>
  )
}
