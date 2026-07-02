'use client'

import { useCallback, useRef, useState } from 'react'
import {
  indexConversationInterruptionCounts,
  indexSessionInterruptionCounts,
  sortInterruptionRecords,
  type InsightInterruptionSheetState,
  type InsightQueryRange,
} from './overview-shared'
import type {
  ConversationInterruptionCount,
  InterruptionCountResponse,
  InterruptionRecord,
  SessionInterruptionCount,
  SessionSummary,
  TraceSummary,
} from './types'
import { getInsightErrorMessage } from './overview-shared'
import { insightService } from '@/services/insight/service'

export interface InsightOverviewInterruptionsController {
  interruptionCount: InterruptionCountResponse | null
  interruptionCountLoaded: boolean
  sessionInterruptionCounts: Record<string, SessionInterruptionCount>
  sessionInterruptionCountsLoaded: boolean
  conversationInterruptionCounts: Record<string, ConversationInterruptionCount>
  conversationInterruptionCountsLoaded: boolean
  sheet: InsightInterruptionSheetState
  setInterruptionSheetOpen: (open: boolean) => void
  openSessionInterruptions: (session: SessionSummary) => Promise<void>
  openConversationInterruptions: (trace: TraceSummary) => Promise<void>
  resolveInterruptionRecord: (record: InterruptionRecord) => Promise<void>
}

export function useInsightInterruptions() {
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
  const [sheet, setSheet] = useState<InsightInterruptionSheetState>({
    open: false,
    scope: null,
    title: '',
    records: [],
    loading: false,
    error: null,
  })
  const aggregateRequestIdRef = useRef(0)
  const sheetRequestIdRef = useRef(0)
  const currentQueryRef = useRef<{ queryRange: InsightQueryRange; wittyAgentId?: string } | null>(
    null
  )

  const refreshInterruptionAggregates = useCallback(
    async (options: { queryRange: InsightQueryRange; wittyAgentId?: string }) => {
      const requestId = ++aggregateRequestIdRef.current
      currentQueryRef.current = options

      const [interruptionResult, sessionCountsResult, conversationCountsResult] =
        await Promise.allSettled([
          insightService.getInterruptionCount({
            start_ns: options.queryRange.startNs,
            end_ns: options.queryRange.endNs,
            witty_agent_id: options.wittyAgentId,
          }),
          insightService.getInterruptionSessionCounts({
            start_ns: options.queryRange.startNs,
            end_ns: options.queryRange.endNs,
            witty_agent_id: options.wittyAgentId,
          }),
          insightService.getInterruptionConversationCounts({
            start_ns: options.queryRange.startNs,
            end_ns: options.queryRange.endNs,
            witty_agent_id: options.wittyAgentId,
          }),
        ])

      if (aggregateRequestIdRef.current !== requestId) {
        return
      }

      if (interruptionResult.status === 'fulfilled') {
        setInterruptionCount(interruptionResult.value)
        setInterruptionCountLoaded(true)
      } else {
        setInterruptionCount(null)
        setInterruptionCountLoaded(false)
      }

      if (sessionCountsResult.status === 'fulfilled') {
        setSessionInterruptionCounts(indexSessionInterruptionCounts(sessionCountsResult.value))
        setSessionInterruptionCountsLoaded(true)
      } else {
        setSessionInterruptionCounts({})
        setSessionInterruptionCountsLoaded(false)
      }

      if (conversationCountsResult.status === 'fulfilled') {
        setConversationInterruptionCounts(
          indexConversationInterruptionCounts(conversationCountsResult.value)
        )
        setConversationInterruptionCountsLoaded(true)
      } else {
        setConversationInterruptionCounts({})
        setConversationInterruptionCountsLoaded(false)
      }
    },
    []
  )

  const openInterruptionSheet = useCallback(
    async (scope: 'session' | 'conversation', targetId: string, title: string) => {
      const requestId = ++sheetRequestIdRef.current
      setSheet({
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

        if (sheetRequestIdRef.current !== requestId) {
          return
        }

        setSheet({
          open: true,
          scope,
          title,
          records: sortInterruptionRecords(records),
          loading: false,
          error: null,
        })
      } catch (loadError) {
        if (sheetRequestIdRef.current !== requestId) {
          return
        }

        setSheet({
          open: true,
          scope,
          title,
          records: [],
          loading: false,
          error: getInsightErrorMessage(loadError),
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

  const setInterruptionSheetOpen = useCallback((open: boolean) => {
    setSheet(currentValue => ({
      ...currentValue,
      open,
    }))
  }, [])

  const resolveInterruptionRecord = useCallback(
    async (record: InterruptionRecord) => {
      await insightService.resolveInterruption(record.interruption_id)

      setSheet(currentValue => ({
        ...currentValue,
        records: currentValue.records.filter(
          item => item.interruption_id !== record.interruption_id
        ),
      }))

      if (currentQueryRef.current) {
        await refreshInterruptionAggregates(currentQueryRef.current)
      }
    },
    [refreshInterruptionAggregates]
  )

  const controller: InsightOverviewInterruptionsController = {
    interruptionCount,
    interruptionCountLoaded,
    sessionInterruptionCounts,
    sessionInterruptionCountsLoaded,
    conversationInterruptionCounts,
    conversationInterruptionCountsLoaded,
    sheet,
    setInterruptionSheetOpen,
    openSessionInterruptions,
    openConversationInterruptions,
    resolveInterruptionRecord,
  }

  return {
    controller,
    interruptionCount,
    interruptionCountLoaded,
    sessionInterruptionCounts,
    sessionInterruptionCountsLoaded,
    refreshInterruptionAggregates,
  }
}
