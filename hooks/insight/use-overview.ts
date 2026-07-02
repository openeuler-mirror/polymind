'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getInsightInterruptionTotal,
  getInsightOverviewLoadMode,
  isAllInsightAgents,
  shouldShowInsightTimeseriesLoading,
} from './overview-utils'
import {
  buildQueryRange,
  getInsightErrorMessage,
  type InsightOverviewSummary,
} from './overview-shared'
import { useInsightFilters, type InsightOverviewFiltersController } from './use-insight-filters'
import { useInsightHealth, type InsightOverviewHealthController } from './use-insight-health'
import {
  useInsightInterruptions,
  type InsightOverviewInterruptionsController,
} from './use-insight-interruptions'
import { useInsightSessions, type InsightOverviewSessionsController } from './use-insight-sessions'
import {
  useInsightTimeseries,
  type InsightOverviewTimeseriesController,
} from './use-insight-timeseries'

export type {
  InsightOverviewSummary,
  InsightQueryRange,
  InsightRangePreset,
} from './overview-shared'
export type { InsightOverviewFiltersController } from './use-insight-filters'
export type { InsightOverviewHealthController } from './use-insight-health'
export type { InsightOverviewInterruptionsController } from './use-insight-interruptions'
export type { InsightOverviewSessionsController } from './use-insight-sessions'
export type { InsightOverviewTimeseriesController } from './use-insight-timeseries'

export interface InsightOverviewStatusController {
  loading: boolean
  refreshing: boolean
  error: string | null
  lastUpdated: Date | null
}

export interface InsightOverviewSummaryController {
  loading: boolean
  interruptionCountLoaded: boolean
  summary: InsightOverviewSummary
}

export interface InsightOverviewActionsController {
  refreshOverview: () => Promise<void>
}

export interface InsightOverviewController {
  filters: InsightOverviewFiltersController
  status: InsightOverviewStatusController
  summary: InsightOverviewSummaryController
  sessions: InsightOverviewSessionsController
  timeseries: InsightOverviewTimeseriesController
  health: InsightOverviewHealthController
  interruptions: InsightOverviewInterruptionsController
  actions: InsightOverviewActionsController
}

export function useInsightOverview(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const requestIdRef = useRef(0)
  const overviewStateRef = useRef({
    lastUpdated: null as Date | null,
    sessionCount: 0,
    tokenSeriesCount: 0,
    modelSeriesCount: 0,
  })

  const filtersState = useInsightFilters()
  const sessionsState = useInsightSessions()
  const timeseriesState = useInsightTimeseries()
  const interruptionsState = useInsightInterruptions()
  const healthState = useInsightHealth({
    enabled,
    selectedWittyAgentId: filtersState.selectedWittyAgentId,
  })
  const {
    controller: filtersController,
    queryRange,
    selectedPreset,
    selectedWittyAgentId,
    refreshWittyAgents,
    setQueryRange,
  } = filtersState
  const { controller: sessionsController, sessions, refreshSessions } = sessionsState
  const {
    controller: timeseriesController,
    tokenSeries,
    modelSeries,
    refreshTimeseries,
  } = timeseriesState
  const {
    controller: interruptionsController,
    interruptionCount,
    interruptionCountLoaded,
    sessionInterruptionCounts,
    sessionInterruptionCountsLoaded,
    refreshInterruptionAggregates,
  } = interruptionsState
  const { controller: healthController, refreshHealth } = healthState

  useEffect(() => {
    overviewStateRef.current = {
      lastUpdated,
      sessionCount: sessions.length,
      tokenSeriesCount: tokenSeries.length,
      modelSeriesCount: modelSeries.length,
    }
  }, [lastUpdated, modelSeries.length, sessions.length, tokenSeries.length])

  const refreshOverview = useCallback(async () => {
    if (!enabled) {
      return
    }

    const requestId = ++requestIdRef.current
    const nextQueryRange = buildQueryRange(selectedPreset)
    const nextLoadMode = getInsightOverviewLoadMode({
      sessionCount: overviewStateRef.current.sessionCount,
      lastUpdated: overviewStateRef.current.lastUpdated,
    })

    if (nextLoadMode === 'loading') {
      setLoading(true)
    } else {
      setRefreshing(true)
    }

    setError(null)
    setLastUpdated(new Date())
    setQueryRange(nextQueryRange)

    const selectedAgentId = isAllInsightAgents(selectedWittyAgentId)
      ? undefined
      : selectedWittyAgentId

    const showTimeseriesLoading = shouldShowInsightTimeseriesLoading({
      tokenSeriesCount: overviewStateRef.current.tokenSeriesCount,
      modelSeriesCount: overviewStateRef.current.modelSeriesCount,
    })

    const results = await Promise.allSettled([
      refreshWittyAgents(),
      refreshSessions({
        queryRange: nextQueryRange,
        wittyAgentId: selectedAgentId,
      }),
      refreshTimeseries({
        queryRange: nextQueryRange,
        wittyAgentId: selectedAgentId,
        showLoading: showTimeseriesLoading,
      }),
      refreshInterruptionAggregates({
        queryRange: nextQueryRange,
        wittyAgentId: selectedAgentId,
      }),
      refreshHealth(),
    ])

    if (requestIdRef.current !== requestId) {
      return
    }

    const sessionsResult = results[1]
    if (sessionsResult.status === 'rejected') {
      setError(getInsightErrorMessage(sessionsResult.reason))
      setLoading(false)
      setRefreshing(false)
      return
    }

    setLoading(false)
    setRefreshing(false)
  }, [
    enabled,
    refreshHealth,
    refreshInterruptionAggregates,
    refreshSessions,
    refreshTimeseries,
    refreshWittyAgents,
    selectedPreset,
    selectedWittyAgentId,
    setQueryRange,
  ])

  useEffect(() => {
    if (!enabled) {
      return
    }

    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) {
        void refreshOverview()
      }
    })

    return () => {
      cancelled = true
    }
  }, [enabled, refreshOverview])

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

  const controller: InsightOverviewController = {
    filters: filtersController,
    status: {
      loading,
      refreshing,
      error,
      lastUpdated,
    },
    summary: {
      loading,
      interruptionCountLoaded,
      summary: {
        sessionCount,
        conversationCount,
        totalInputTokens,
        totalOutputTokens,
        totalTokens,
        interruptionTotal,
      },
    },
    sessions: sessionsController,
    timeseries: {
      ...timeseriesController,
      startNs: queryRange.startNs,
      endNs: queryRange.endNs,
    },
    health: healthController,
    interruptions: interruptionsController,
    actions: {
      refreshOverview,
    },
  }

  return controller
}
