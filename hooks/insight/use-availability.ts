'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  isInsightBackendUnavailable,
  isInsightCapabilitiesResponse,
  type InsightAvailabilityStatus,
} from '@/services/insight/availability'
import { insightService } from '@/services/insight/service'

interface InsightAvailabilityState {
  status: InsightAvailabilityStatus
  checkAvailability: () => Promise<void>
}

export function useInsightAvailability(): InsightAvailabilityState {
  const [status, setStatus] = useState<InsightAvailabilityStatus>('checking')

  const checkAvailability = useCallback(async () => {
    setStatus('checking')

    try {
      const result = await insightService.getCapabilities()
      setStatus(
        isInsightCapabilitiesResponse(result) && result.enabled && result.reachable
          ? 'available'
          : 'unavailable'
      )
    } catch (error) {
      setStatus(isInsightBackendUnavailable(error) ? 'unavailable' : 'available')
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    queueMicrotask(() => {
      if (!cancelled) {
        void checkAvailability()
      }
    })

    return () => {
      cancelled = true
    }
  }, [checkAvailability])

  return {
    status,
    checkAvailability,
  }
}
