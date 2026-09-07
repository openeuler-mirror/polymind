'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { History, RefreshCw } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { useChatStore } from '@/lib/store'
import { useScheduledTaskStore } from '@/lib/stores/scheduled-task-store'
import { formatDateTime } from '@/lib/date-utils'
import {
  scheduledTaskService,
  type ScheduledTaskRunWithTask,
} from '@/services/scheduled-task-service'
import { getRunStatusMeta } from './utils'

/** 执行记录页前端分页大小。 */
const PAGE_SIZE = 20

export function RunRecords() {
  const tasks = useScheduledTaskStore(s => s.tasks)
  const runsByTask = useScheduledTaskStore(s => s.runsByTask)
  const loading = useScheduledTaskStore(s => s.loading)
  const error = useScheduledTaskStore(s => s.error)
  const refresh = useScheduledTaskStore(s => s.refresh)
  const subscribe = useScheduledTaskStore(s => s.subscribe)
  const unsubscribe = useScheduledTaskStore(s => s.unsubscribe)

  // 执行记录页通过后端聚合接口做服务端分页（跨全部任务），
  // 与侧栏/任务列表使用的 recent_runs（每任务 10 条）分离。
  const [records, setRecords] = useState<ScheduledTaskRunWithTask[]>([])
  const [total, setTotal] = useState(0)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  /** 拉取序号：并发请求只允许最新一次写入结果，避免乱序覆盖。 */
  const historyFetchSeqRef = useRef(0)

  // 挂载即订阅共享数据源，复用全局轮询（任务列表/侧栏）。
  useEffect(() => {
    subscribe()
    return () => unsubscribe()
  }, [subscribe, unsubscribe])

  const loadPage = useCallback(async (targetPage: number) => {
    const seq = ++historyFetchSeqRef.current
    setHistoryLoading(true)
    try {
      const result = await scheduledTaskService.listRunsPage({
        limit: PAGE_SIZE,
        offset: (targetPage - 1) * PAGE_SIZE,
      })
      if (seq !== historyFetchSeqRef.current) return
      setRecords(result.items)
      setTotal(result.total)
      setHistoryError(null)
    } catch (fetchError) {
      if (seq !== historyFetchSeqRef.current) return
      console.error('Failed to load run history:', fetchError)
      setHistoryError('加载执行记录失败')
    } finally {
      if (seq === historyFetchSeqRef.current) setHistoryLoading(false)
    }
  }, [])

  // 数据刷新后页码可能越界，展示与导航时收敛到有效范围。
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)

  // 页码变化（含初次挂载）时拉取对应页。
  useEffect(() => {
    void loadPage(currentPage)
  }, [currentPage, loadPage])

  // 轮询发现新执行记录（recent_runs 变化）时，后台同步刷新当前页，
  // 执行记录页无需等手动刷新即可跟上新结果。只负责“数据变化而页码未变”的重载：
  // 页码变化由上面的 currentPage effect 触发，这里跳过，避免同一页重复请求；
  // 且始终用收敛后的 currentPage，避免 total 收缩（如删除任务）后请求越界页。
  const runsSignatureRef = useRef('')
  const lastLoadedPageRef = useRef(currentPage)
  useEffect(() => {
    const pageChanged = lastLoadedPageRef.current !== currentPage
    lastLoadedPageRef.current = currentPage
    const signature = JSON.stringify(runsByTask)
    const changed = runsSignatureRef.current !== '' && signature !== runsSignatureRef.current
    runsSignatureRef.current = signature
    if (!changed || pageChanged) return
    void loadPage(currentPage)
  }, [runsByTask, currentPage, loadPage])

  const handleRefresh = async () => {
    const before = JSON.stringify(useScheduledTaskStore.getState().runsByTask)
    await refresh(true)
    // 数据确实变化时由签名 effect 自动重载当前页；未变化才显式重载，避免双请求。
    const after = JSON.stringify(useScheduledTaskStore.getState().runsByTask)
    if (before === after) {
      void loadPage(currentPage)
    }
  }

  const handleViewConversation = (record: ScheduledTaskRunWithTask) => {
    if (!record.session_id) return
    void useChatStore.getState().refreshConversation(record.agent_id, record.session_id, {
      // 本地尚无该会话（超出 recent_runs 上限/缓存清空）时也要建成定时任务条目，
      // 避免落入普通会话列表。
      scheduledTaskId: record.task_id,
    })
  }

  // 加载失败（error 已设置）时优先展示错误而非空态
  if (tasks.length === 0 && !loading && !error) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <History className="h-6 w-6" />
          </EmptyMedia>
          <EmptyTitle>暂无执行记录</EmptyTitle>
          <EmptyDescription>创建定时任务后，任务的执行结果会汇总展示在这里。</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const refreshing = loading || historyLoading

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">共 {total} 条记录</div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleRefresh()}
          disabled={refreshing}
        >
          <RefreshCw className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          刷新
        </Button>
      </div>

      {refreshing && records.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-md" />
          ))}
        </div>
      ) : (historyError || error) && records.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>加载失败</EmptyTitle>
            <EmptyDescription>{historyError || error}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : records.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <History className="h-6 w-6" />
            </EmptyMedia>
            <EmptyTitle>暂无执行记录</EmptyTitle>
            <EmptyDescription>任务尚未执行过，或在卡片上点击“立刻执行”触发一次。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-lg border">
            {records.map((record, index) => {
              const status = getRunStatusMeta(record.status)
              return (
                <div
                  key={record.id}
                  className={
                    index > 0 ? 'border-t border-border bg-card px-4 py-3' : 'bg-card px-4 py-3'
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">
                        {record.task_name}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {formatDateTime(record.started_at)} → {formatDateTime(record.finished_at)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {record.session_id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-primary"
                          onClick={() => handleViewConversation(record)}
                        >
                          查看对话
                        </Button>
                      )}
                      <Badge variant="outline" className={status.className}>
                        {status.label}
                      </Badge>
                    </div>
                  </div>
                  {record.error && (
                    <div className="mt-1 truncate text-xs text-red-600" title={record.error}>
                      {record.error}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {pageCount > 1 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                第 {currentPage} / {pageCount} 页
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  // 基于 currentPage 导航，避免 page state 越界后无法回退。
                  onClick={() => setPage(currentPage - 1)}
                >
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= pageCount}
                  onClick={() => setPage(currentPage + 1)}
                >
                  下一页
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
