'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import type { SessionSummary, TraceSummary } from './types'
import {
  getInsightErrorMessage,
  sortSessions,
  sortTraces,
  type InsightQueryRange,
} from './overview-shared'
import { insightService } from '@/services/insight/service'

const PAGE_SIZE = 10

export interface InsightOverviewSessionsController {
  sessions: SessionSummary[]
  visibleSessions: SessionSummary[]
  sessionPage: number
  setSessionPage: (page: number) => void
  sessionTotalPages: number
  pageSize: number
  expandedSessionId: string | null
  toggleSession: (sessionId: string) => Promise<void>
  tracesBySessionId: Record<string, TraceSummary[]>
  traceLoadingBySessionId: Record<string, boolean>
  traceErrorBySessionId: Record<string, string | null>
}

export function useInsightSessions() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null)
  const [sessionPage, setSessionPageState] = useState(0)
  const [tracesBySessionId, setTracesBySessionId] = useState<Record<string, TraceSummary[]>>({})
  const [traceLoadingBySessionId, setTraceLoadingBySessionId] = useState<Record<string, boolean>>(
    {}
  )
  const [traceErrorBySessionId, setTraceErrorBySessionId] = useState<Record<string, string | null>>(
    {}
  )
  const refreshRequestIdRef = useRef(0)
  const traceQueryRangeRef = useRef<InsightQueryRange | null>(null)

  const clearSessions = useCallback(() => {
    setSessions([])
    setExpandedSessionId(null)
    setTracesBySessionId({})
    setTraceLoadingBySessionId({})
    setTraceErrorBySessionId({})
    setSessionPageState(0)
  }, [])

  const refreshSessions = useCallback(
    async (options: { queryRange: InsightQueryRange; wittyAgentId?: string }) => {
      const requestId = ++refreshRequestIdRef.current
      traceQueryRangeRef.current = options.queryRange

      try {
        const result = await insightService.getSessions({
          start_ns: options.queryRange.startNs,
          end_ns: options.queryRange.endNs,
          witty_agent_id: options.wittyAgentId,
        })

        if (refreshRequestIdRef.current !== requestId) {
          return []
        }

        setSessions(sortSessions(result))
        setExpandedSessionId(null)
        setTracesBySessionId({})
        setTraceLoadingBySessionId({})
        setTraceErrorBySessionId({})
        setSessionPageState(0)

        return result
      } catch (error) {
        if (refreshRequestIdRef.current !== requestId) {
          return []
        }

        clearSessions()
        throw error
      }
    },
    [clearSessions]
  )

  const loadSessionTraces = useCallback(
    async (sessionId: string, force = false) => {
      const queryRange = traceQueryRangeRef.current
      if (!queryRange) {
        return
      }

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
      } catch (error) {
        setTraceErrorBySessionId(currentValue => ({
          ...currentValue,
          [sessionId]: getInsightErrorMessage(error),
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
    [tracesBySessionId]
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

  const sessionTotalPages = Math.max(1, Math.ceil(sessions.length / PAGE_SIZE))
  const visibleSessions = useMemo(
    () => sessions.slice(sessionPage * PAGE_SIZE, (sessionPage + 1) * PAGE_SIZE),
    [sessionPage, sessions]
  )

  const controller: InsightOverviewSessionsController = {
    sessions,
    visibleSessions,
    sessionPage,
    setSessionPage: setSessionPageState,
    sessionTotalPages,
    pageSize: PAGE_SIZE,
    expandedSessionId,
    toggleSession,
    tracesBySessionId,
    traceLoadingBySessionId,
    traceErrorBySessionId,
  }

  return {
    controller,
    sessions,
    refreshSessions,
  }
}
