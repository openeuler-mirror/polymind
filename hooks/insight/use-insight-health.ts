'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { filterManagedHealthAgents, sortManagedHealthAgents } from './agent-health-utils'
import type { AgentHealthStatus } from './types'
import { getInsightErrorMessage } from './overview-shared'
import { insightService } from '@/services/insight/service'

export interface InsightOverviewHealthController {
  agents: AgentHealthStatus[]
  lastScanTime: number | null
  loading: boolean
  error: string | null
  acknowledgeOfflineAgent: (pid: number) => Promise<void>
}

export function useInsightHealth(options: { enabled: boolean; selectedWittyAgentId: string }) {
  const { enabled, selectedWittyAgentId } = options
  const [healthAgents, setHealthAgents] = useState<AgentHealthStatus[]>([])
  const [healthLastScanTime, setHealthLastScanTime] = useState<number | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)
  const [healthError, setHealthError] = useState<string | null>(null)
  const healthRequestIdRef = useRef(0)
  const healthAgentCountRef = useRef(0)

  useEffect(() => {
    healthAgentCountRef.current = healthAgents.length
  }, [healthAgents.length])

  const refreshHealth = useCallback(
    async (showLoading = false) => {
      if (!enabled) {
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
        setHealthError(getInsightErrorMessage(loadError))
      } finally {
        if (healthRequestIdRef.current === requestId) {
          setHealthLoading(false)
        }
      }
    },
    [enabled, selectedWittyAgentId]
  )

  const acknowledgeOfflineAgent = useCallback(
    async (pid: number) => {
      await insightService.deleteAgentHealth(pid)
      await refreshHealth(true)
    },
    [refreshHealth]
  )

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

  const controller: InsightOverviewHealthController = {
    agents: healthAgents,
    lastScanTime: healthLastScanTime,
    loading: healthLoading,
    error: healthError,
    acknowledgeOfflineAgent,
  }

  return {
    controller,
    healthAgents,
    refreshHealth,
  }
}
