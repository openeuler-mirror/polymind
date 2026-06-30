'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { filterManagedHealthAgents, sortManagedHealthAgents } from './agent-health-utils'
import { getInsightInterruptionTotal, isAllInsightAgents } from './overview-utils'
import type {
  AgentHealthStatus,
  ConversationInterruptionCount,
  InterruptionCountResponse,
  InterruptionRecord,
  InterruptionSeverity,
  InterruptionTypeDetail,
  SessionInterruptionCount,
  SessionSummary,
  TimeseriesResponse,
  TraceSummary,
  WittyAgentSummary,
} from './types'
import { insightService } from '@/services/insight/service'

export type InsightRangePreset = '1h' | '6h' | '24h' | '7d'

export interface InsightQueryRange {
  preset: InsightRangePreset
  label: string
  startMs: number
  endMs: number
  startNs: number
  endNs: number
}

export interface InsightOverviewSummary {
  sessionCount: number
  conversationCount: number
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  interruptionTotal: number | null
}

interface InsightAgentFilterOption extends WittyAgentSummary {
  label: string
}

export interface InsightInterruptionSheetState {
  open: boolean
  scope: 'session' | 'conversation' | null
  title: string
  records: InterruptionRecord[]
  loading: boolean
  error: string | null
}

const RANGE_PRESETS: Array<{
  id: InsightRangePreset
  label: string
  durationMs: number
}> = [
  { id: '1h', label: '最近 1 小时', durationMs: 1 * 60 * 60 * 1000 },
  { id: '6h', label: '最近 6 小时', durationMs: 6 * 60 * 60 * 1000 },
  { id: '24h', label: '最近 24 小时', durationMs: 24 * 60 * 60 * 1000 },
  { id: '7d', label: '最近 7 天', durationMs: 7 * 24 * 60 * 60 * 1000 },
]

function buildQueryRange(preset: InsightRangePreset): InsightQueryRange {
  const matchedPreset = RANGE_PRESETS.find(item => item.id === preset) ?? RANGE_PRESETS[2]
  const endMs = Date.now()
  const startMs = endMs - matchedPreset.durationMs

  return {
    preset,
    label: matchedPreset.label,
    startMs,
    endMs,
    startNs: startMs * 1_000_000,
    endNs: endMs * 1_000_000,
  }
}

function sortSessions(sessions: SessionSummary[]): SessionSummary[] {
  return [...sessions].sort((left, right) => right.last_seen_ns - left.last_seen_ns)
}

function sortWittyAgents(agents: WittyAgentSummary[]): WittyAgentSummary[] {
  return [...agents].sort((left, right) =>
    left.witty_agent_name.localeCompare(right.witty_agent_name)
  )
}

function sortTraces(traces: TraceSummary[]): TraceSummary[] {
  return [...traces].sort((left, right) => right.start_ns - left.start_ns)
}

function sortInterruptionRecords(records: InterruptionRecord[]): InterruptionRecord[] {
  return [...records].sort((left, right) => right.occurred_at_ns - left.occurred_at_ns)
}

function indexSessionInterruptionCounts(
  counts: SessionInterruptionCount[]
): Record<string, SessionInterruptionCount> {
  return counts.reduce<Record<string, SessionInterruptionCount>>((accumulator, currentValue) => {
    accumulator[currentValue.session_id] = currentValue
    return accumulator
  }, {})
}

function indexConversationInterruptionCounts(
  counts: ConversationInterruptionCount[]
): Record<string, ConversationInterruptionCount> {
  return counts.reduce<Record<string, ConversationInterruptionCount>>(
    (accumulator, currentValue) => {
      accumulator[currentValue.conversation_id] = currentValue
      return accumulator
    },
    {}
  )
}

function decrementSeverityCounts(
  counts: Record<InterruptionSeverity, number>,
  severity: InterruptionSeverity
): Record<InterruptionSeverity, number> {
  return {
    ...counts,
    [severity]: Math.max(0, counts[severity] - 1),
  }
}

function decrementTypeCounts(
  types: InterruptionTypeDetail[],
  severity: InterruptionSeverity,
  interruptionType: string
): InterruptionTypeDetail[] {
  return types
    .map(type =>
      type.severity === severity && type.interruption_type === interruptionType
        ? { ...type, count: Math.max(0, type.count - 1) }
        : type
    )
    .filter(type => type.count > 0)
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Witty Insight 数据加载失败'
}

function createAgentFilterOptions(agents: WittyAgentSummary[]): InsightAgentFilterOption[] {
  return sortWittyAgents(agents).map(agent => ({
    ...agent,
    label: agent.witty_agent_name,
  }))
}

export function useInsightOverview(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true
  const [selectedPreset, setSelectedPreset] = useState<InsightRangePreset>('24h')
  const [selectedWittyAgentId, setSelectedWittyAgentId] = useState('all')
  const [wittyAgents, setWittyAgents] = useState<WittyAgentSummary[]>([])
  const [queryRange, setQueryRange] = useState<InsightQueryRange>(() => buildQueryRange('24h'))
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [interruptionCount, setInterruptionCount] = useState<InterruptionCountResponse | null>(null)
  const [interruptionCountLoaded, setInterruptionCountLoaded] = useState(false)
  const [sessionInterruptionCounts, setSessionInterruptionCounts] = useState<
    Record<string, SessionInterruptionCount>
  >({})
  const [sessionInterruptionCountsLoaded, setSessionInterruptionCountsLoaded] = useState(false)
  const [conversationInterruptionCounts, setConversationInterruptionCounts] = useState<
    Record<string, ConversationInterruptionCount>
  >({})
  const [conversationInterruptionCountsLoaded, setConversationInterruptionCountsLoaded] =
    useState(false)
  const [healthAgents, setHealthAgents] = useState<AgentHealthStatus[]>([])
  const [healthLastScanTime, setHealthLastScanTime] = useState<number | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [tokenSeries, setTokenSeries] = useState<TimeseriesResponse['token_series']>([])
  const [modelSeries, setModelSeries] = useState<TimeseriesResponse['model_series']>([])
  const [timeseriesLoading, setTimeseriesLoading] = useState(true)
  const [timeseriesError, setTimeseriesError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null)
  const [sessionPage, setSessionPage] = useState(0)
  const [tracesBySessionId, setTracesBySessionId] = useState<Record<string, TraceSummary[]>>({})
  const [traceLoadingBySessionId, setTraceLoadingBySessionId] = useState<Record<string, boolean>>(
    {}
  )
  const [traceErrorBySessionId, setTraceErrorBySessionId] = useState<Record<string, string | null>>(
    {}
  )
  const requestIdRef = useRef(0)
  const interruptionRequestIdRef = useRef(0)
  const healthRequestIdRef = useRef(0)
  const lastUpdatedRef = useRef<Date | null>(null)
  const sessionCountRef = useRef(0)
  const tokenSeriesCountRef = useRef(0)
  const modelSeriesCountRef = useRef(0)
  const healthAgentCountRef = useRef(0)
  const [interruptionSheet, setInterruptionSheet] = useState<InsightInterruptionSheetState>({
    open: false,
    scope: null,
    title: '',
    records: [],
    loading: false,
    error: null,
  })
  const pageSize = 10

  useEffect(() => {
    lastUpdatedRef.current = lastUpdated
  }, [lastUpdated])

  useEffect(() => {
    sessionCountRef.current = sessions.length
  }, [sessions.length])

  useEffect(() => {
    tokenSeriesCountRef.current = tokenSeries.length
  }, [tokenSeries.length])

  useEffect(() => {
    modelSeriesCountRef.current = modelSeries.length
  }, [modelSeries.length])

  useEffect(() => {
    healthAgentCountRef.current = healthAgents.length
  }, [healthAgents.length])

  const agentFilterOptions = useMemo(() => createAgentFilterOptions(wittyAgents), [wittyAgents])

  const refreshHealth = useCallback(
    async (showLoading = false) => {
      if (!enabled) {
        setHealthLoading(false)
        return
      }

      const requestId = ++healthRequestIdRef.current

      if (showLoading || healthAgentCountRef.current === 0) {
        setHealthLoading(true)
      }

      try {
        const result = await insightService.getAgentHealth()

        if (healthRequestIdRef.current !== requestId) {
          return
        }

        const filteredAgents = filterManagedHealthAgents(result.agents, selectedWittyAgentId)

        setHealthAgents(sortManagedHealthAgents(filteredAgents))
        setHealthLastScanTime(result.last_scan_time)
        setHealthError(null)
      } catch (loadError) {
        if (healthRequestIdRef.current !== requestId) {
          return
        }

        setHealthAgents([])
        setHealthLastScanTime(null)
        setHealthError(getErrorMessage(loadError))
      } finally {
        if (healthRequestIdRef.current === requestId) {
          setHealthLoading(false)
        }
      }
    },
    [enabled, selectedWittyAgentId]
  )

  const acknowledgeOfflineAgent = useCallback(async (pid: number) => {
    await insightService.deleteAgentHealth(pid)

    setHealthAgents(currentValue =>
      sortManagedHealthAgents(
        currentValue.map(agent =>
          agent.runtime?.pid === pid
            ? {
                ...agent,
                overall_status: 'missing_runtime',
                status_reason: '已确认移除离线 runtime，等待下一次健康扫描同步',
                runtime: null,
              }
            : agent
        )
      )
    )
  }, [])

  const refreshOverview = useCallback(async () => {
    if (!enabled) {
      setLoading(false)
      setRefreshing(false)
      setTimeseriesLoading(false)
      setHealthLoading(false)
      return
    }

    const requestId = ++requestIdRef.current
    const nextQueryRange = buildQueryRange(selectedPreset)
    const shouldBlock = sessionCountRef.current === 0 && lastUpdatedRef.current === null

    if (shouldBlock) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }

    setError(null)
    setTimeseriesError(null)
    setLastUpdated(new Date())
    void refreshHealth()

    if (tokenSeriesCountRef.current === 0 && modelSeriesCountRef.current === 0) {
      setTimeseriesLoading(true)
    }

    const selectedAgentId = isAllInsightAgents(selectedWittyAgentId)
      ? undefined
      : selectedWittyAgentId

    const [
      wittyAgentsResult,
      sessionsResult,
      timeseriesResult,
      interruptionResult,
      sessionInterruptionCountsResult,
      conversationInterruptionCountsResult,
    ] = await Promise.allSettled([
      insightService.getWittyAgents(),
      insightService.getSessions({
        start_ns: nextQueryRange.startNs,
        end_ns: nextQueryRange.endNs,
        witty_agent_id: selectedAgentId,
      }),
      insightService.getTimeseries({
        start_ns: nextQueryRange.startNs,
        end_ns: nextQueryRange.endNs,
        witty_agent_id: selectedAgentId,
        buckets: 30,
      }),
      insightService.getInterruptionCount({
        start_ns: nextQueryRange.startNs,
        end_ns: nextQueryRange.endNs,
        witty_agent_id: selectedAgentId,
      }),
      insightService.getInterruptionSessionCounts({
        start_ns: nextQueryRange.startNs,
        end_ns: nextQueryRange.endNs,
        witty_agent_id: selectedAgentId,
      }),
      insightService.getInterruptionConversationCounts({
        start_ns: nextQueryRange.startNs,
        end_ns: nextQueryRange.endNs,
        witty_agent_id: selectedAgentId,
      }),
    ])

    if (requestIdRef.current !== requestId) {
      return
    }

    if (wittyAgentsResult.status === 'fulfilled') {
      const agents = sortWittyAgents(wittyAgentsResult.value)
      setWittyAgents(agents)
      setSelectedWittyAgentId(currentValue => {
        if (currentValue === 'all') {
          return currentValue
        }

        return agents.some(agent => agent.witty_agent_id === currentValue) ? currentValue : 'all'
      })
    }

    if (interruptionResult.status === 'fulfilled') {
      setInterruptionCount(interruptionResult.value)
      setInterruptionCountLoaded(true)
    } else {
      setInterruptionCount(null)
      setInterruptionCountLoaded(false)
    }

    if (sessionInterruptionCountsResult.status === 'fulfilled') {
      setSessionInterruptionCounts(
        indexSessionInterruptionCounts(sessionInterruptionCountsResult.value)
      )
      setSessionInterruptionCountsLoaded(true)
    } else {
      setSessionInterruptionCounts({})
      setSessionInterruptionCountsLoaded(false)
    }

    if (conversationInterruptionCountsResult.status === 'fulfilled') {
      setConversationInterruptionCounts(
        indexConversationInterruptionCounts(conversationInterruptionCountsResult.value)
      )
      setConversationInterruptionCountsLoaded(true)
    } else {
      setConversationInterruptionCounts({})
      setConversationInterruptionCountsLoaded(false)
    }

    if (timeseriesResult.status === 'fulfilled') {
      setTokenSeries(timeseriesResult.value.token_series)
      setModelSeries(timeseriesResult.value.model_series)
      setTimeseriesError(null)
      setTimeseriesLoading(false)
    } else {
      setTokenSeries([])
      setModelSeries([])
      setTimeseriesError(getErrorMessage(timeseriesResult.reason))
      setTimeseriesLoading(false)
    }

    if (sessionsResult.status === 'rejected') {
      setSessions([])
      setExpandedSessionId(null)
      setTracesBySessionId({})
      setTraceLoadingBySessionId({})
      setTraceErrorBySessionId({})
      setSessionPage(0)
      setQueryRange(nextQueryRange)
      setError(getErrorMessage(sessionsResult.reason))
      setLoading(false)
      setRefreshing(false)
      return
    }

    setSessions(sortSessions(sessionsResult.value))
    setExpandedSessionId(null)
    setTracesBySessionId({})
    setTraceLoadingBySessionId({})
    setTraceErrorBySessionId({})
    setSessionPage(0)
    setQueryRange(nextQueryRange)
    setLoading(false)
    setRefreshing(false)
  }, [enabled, refreshHealth, selectedPreset, selectedWittyAgentId])

  const loadSessionTraces = useCallback(
    async (sessionId: string, force = false) => {
      if (!force && tracesBySessionId[sessionId]) {
        return
      }

      setTraceLoadingBySessionId(currentValue => ({
        ...currentValue,
        [sessionId]: true,
      }))
      setTraceErrorBySessionId(currentValue => ({
        ...currentValue,
        [sessionId]: null,
      }))

      try {
        const traces = await insightService.getSessionTraces(sessionId, {
          start_ns: queryRange.startNs,
          end_ns: queryRange.endNs,
        })

        setTracesBySessionId(currentValue => ({
          ...currentValue,
          [sessionId]: sortTraces(traces),
        }))
      } catch (loadError) {
        setTraceErrorBySessionId(currentValue => ({
          ...currentValue,
          [sessionId]: getErrorMessage(loadError),
        }))
        setTracesBySessionId(currentValue => ({
          ...currentValue,
          [sessionId]: [],
        }))
      } finally {
        setTraceLoadingBySessionId(currentValue => ({
          ...currentValue,
          [sessionId]: false,
        }))
      }
    },
    [queryRange.endNs, queryRange.startNs, tracesBySessionId]
  )

  const toggleSession = useCallback(
    async (sessionId: string) => {
      if (expandedSessionId === sessionId) {
        setExpandedSessionId(null)
        return
      }

      setExpandedSessionId(sessionId)
      await loadSessionTraces(sessionId)
    },
    [expandedSessionId, loadSessionTraces]
  )

  const openInterruptionSheet = useCallback(
    async (scope: 'session' | 'conversation', targetId: string, title: string) => {
      const requestId = ++interruptionRequestIdRef.current

      setInterruptionSheet({
        open: true,
        scope,
        title,
        records: [],
        loading: true,
        error: null,
      })

      try {
        const records =
          scope === 'session'
            ? await insightService.getSessionInterruptions(targetId)
            : await insightService.getConversationInterruptions(targetId)

        if (interruptionRequestIdRef.current !== requestId) {
          return
        }

        setInterruptionSheet({
          open: true,
          scope,
          title,
          records: sortInterruptionRecords(records),
          loading: false,
          error: null,
        })
      } catch (loadError) {
        if (interruptionRequestIdRef.current !== requestId) {
          return
        }

        setInterruptionSheet({
          open: true,
          scope,
          title,
          records: [],
          loading: false,
          error: getErrorMessage(loadError),
        })
      }
    },
    []
  )

  const openSessionInterruptions = useCallback(
    async (session: SessionSummary) => {
      await openInterruptionSheet('session', session.session_id, 'Session 异常中断')
    },
    [openInterruptionSheet]
  )

  const openConversationInterruptions = useCallback(
    async (trace: TraceSummary) => {
      await openInterruptionSheet('conversation', trace.conversation_id, 'Conversation 异常中断')
    },
    [openInterruptionSheet]
  )

  const setInterruptionSheetOpen = useCallback((nextOpen: boolean) => {
    setInterruptionSheet(currentValue => ({
      ...currentValue,
      open: nextOpen,
    }))
  }, [])

  const resolveInterruptionRecord = useCallback(async (record: InterruptionRecord) => {
    await insightService.resolveInterruption(record.interruption_id)

    setInterruptionCount(currentValue => {
      if (!currentValue) {
        return currentValue
      }

      return {
        total: Math.max(0, currentValue.total - 1),
        by_severity: decrementSeverityCounts(currentValue.by_severity, record.severity),
      }
    })

    if (record.session_id) {
      setSessionInterruptionCounts(currentValue => {
        const existing = currentValue[record.session_id!]
        if (!existing) {
          return currentValue
        }

        const nextTotal = Math.max(0, existing.total - 1)
        const nextCounts: SessionInterruptionCount = {
          session_id: existing.session_id,
          runtime_session_id: existing.runtime_session_id,
          total: nextTotal,
          by_severity: decrementSeverityCounts(existing.by_severity, record.severity),
          types: decrementTypeCounts(existing.types, record.severity, record.interruption_type),
        }

        if (nextTotal === 0) {
          const next = { ...currentValue }
          delete next[record.session_id!]
          return next
        }

        return {
          ...currentValue,
          [record.session_id!]: nextCounts,
        }
      })
    }

    if (record.conversation_id) {
      setConversationInterruptionCounts(currentValue => {
        const existing = currentValue[record.conversation_id!]
        if (!existing) {
          return currentValue
        }

        const nextTotal = Math.max(0, existing.total - 1)
        const nextCounts: ConversationInterruptionCount = {
          conversation_id: existing.conversation_id,
          total: nextTotal,
          by_severity: decrementSeverityCounts(existing.by_severity, record.severity),
          types: decrementTypeCounts(existing.types, record.severity, record.interruption_type),
        }

        if (nextTotal === 0) {
          const next = { ...currentValue }
          delete next[record.conversation_id!]
          return next
        }

        return {
          ...currentValue,
          [record.conversation_id!]: nextCounts,
        }
      })
    }

    setInterruptionSheet(currentValue => ({
      ...currentValue,
      records: currentValue.records.filter(item => item.interruption_id !== record.interruption_id),
    }))
  }, [])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      setRefreshing(false)
      setTimeseriesLoading(false)
      setHealthLoading(false)
      return
    }

    void refreshOverview()
  }, [enabled, refreshOverview])

  useEffect(() => {
    if (!enabled) {
      return
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshHealth()
      }
    }

    const timerId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshHealth()
      }
    }, 15000)

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(timerId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled, refreshHealth])

  const sessionCount = sessions.length
  const conversationCount = sessions.reduce(
    (count, session) => count + session.conversation_count,
    0
  )
  const totalInputTokens = sessions.reduce(
    (count, session) => count + session.total_input_tokens,
    0
  )
  const totalOutputTokens = sessions.reduce(
    (count, session) => count + session.total_output_tokens,
    0
  )
  const totalTokens = totalInputTokens + totalOutputTokens
  const interruptionTotal = getInsightInterruptionTotal({
    selectedWittyAgentId,
    interruptionCountLoaded,
    sessionInterruptionCountsLoaded,
    interruptionCount,
    sessions,
    sessionInterruptionCounts,
  })
  const summary: InsightOverviewSummary = {
    sessionCount,
    conversationCount,
    totalInputTokens,
    totalOutputTokens,
    totalTokens,
    interruptionTotal,
  }

  const sessionTotalPages = Math.max(1, Math.ceil(sessions.length / pageSize))
  const visibleSessions = sessions.slice(sessionPage * pageSize, (sessionPage + 1) * pageSize)

  return {
    rangePresets: RANGE_PRESETS,
    selectedPreset,
    setSelectedPreset,
    selectedWittyAgentId,
    setSelectedWittyAgentId,
    wittyAgents,
    agentFilterOptions,
    queryRange,
    sessions,
    visibleSessions,
    interruptionCount,
    interruptionCountLoaded,
    sessionInterruptionCounts,
    sessionInterruptionCountsLoaded,
    conversationInterruptionCounts,
    conversationInterruptionCountsLoaded,
    healthAgents,
    healthLastScanTime,
    healthLoading,
    healthError,
    acknowledgeOfflineAgent,
    tokenSeries,
    modelSeries,
    timeseriesLoading,
    timeseriesError,
    summary,
    loading,
    refreshing,
    error,
    lastUpdated,
    sessionPage,
    setSessionPage,
    sessionTotalPages,
    pageSize,
    expandedSessionId,
    toggleSession,
    tracesBySessionId,
    traceLoadingBySessionId,
    traceErrorBySessionId,
    interruptionSheet,
    setInterruptionSheetOpen,
    openSessionInterruptions,
    openConversationInterruptions,
    resolveInterruptionRecord,
    refreshOverview,
  }
}

export type InsightOverviewController = ReturnType<typeof useInsightOverview>
