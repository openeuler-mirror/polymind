'use client'

import { useCallback, useRef, useState } from 'react'
import type { TimeseriesResponse } from './types'
import type { InsightQueryRange } from './overview-shared'
import { getInsightErrorMessage } from './overview-shared'
import { insightService } from '@/services/insight/service'

export interface InsightOverviewTimeseriesController {
  tokenSeries: TimeseriesResponse['token_series']
  modelSeries: TimeseriesResponse['model_series']
  startNs: number
  endNs: number
  loading: boolean
  error: string | null
}

export function useInsightTimeseries() {
  const [tokenSeries, setTokenSeries] = useState<TimeseriesResponse['token_series']>([])
  const [modelSeries, setModelSeries] = useState<TimeseriesResponse['model_series']>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const refreshTimeseries = useCallback(
    async (options: {
      queryRange: InsightQueryRange
      wittyAgentId?: string
      showLoading: boolean
    }) => {
      const requestId = ++requestIdRef.current
      if (options.showLoading) {
        setLoading(true)
      }

      try {
        const result = await insightService.getTimeseries({
          start_ns: options.queryRange.startNs,
          end_ns: options.queryRange.endNs,
          witty_agent_id: options.wittyAgentId,
          buckets: 30,
        })

        if (requestIdRef.current !== requestId) {
          return
        }

        setTokenSeries(result.token_series)
        setModelSeries(result.model_series)
        setError(null)
      } catch (loadError) {
        if (requestIdRef.current !== requestId) {
          return
        }

        setTokenSeries([])
        setModelSeries([])
        setError(getInsightErrorMessage(loadError))
      } finally {
        if (requestIdRef.current === requestId) {
          setLoading(false)
        }
      }
    },
    []
  )

  const stopLoading = useCallback(() => {
    setLoading(false)
  }, [])

  const controller: InsightOverviewTimeseriesController = {
    tokenSeries,
    modelSeries,
    startNs: 0,
    endNs: 0,
    loading,
    error,
  }

  return {
    controller,
    tokenSeries,
    modelSeries,
    stopLoading,
    refreshTimeseries,
  }
}
