'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import type { WittyAgentSummary } from './types'
import {
  buildQueryRange,
  createAgentFilterOptions,
  RANGE_PRESETS,
  sortWittyAgents,
  type InsightAgentFilterOption,
  type InsightQueryRange,
  type InsightRangePreset,
} from './overview-shared'
import { insightService } from '@/services/insight/service'

export interface InsightOverviewFiltersController {
  rangePresets: typeof RANGE_PRESETS
  selectedPreset: InsightRangePreset
  setSelectedPreset: (preset: InsightRangePreset) => void
  selectedWittyAgentId: string
  setSelectedWittyAgentId: (wittyAgentId: string) => void
  wittyAgents: WittyAgentSummary[]
  agentFilterOptions: InsightAgentFilterOption[]
  queryRange: InsightQueryRange
}

export function useInsightFilters() {
  const [selectedPreset, setSelectedPresetState] = useState<InsightRangePreset>('24h')
  const [selectedWittyAgentId, setSelectedWittyAgentIdState] = useState('all')
  const [wittyAgents, setWittyAgents] = useState<WittyAgentSummary[]>([])
  const [queryRange, setQueryRange] = useState<InsightQueryRange>(() => buildQueryRange('24h'))
  const requestIdRef = useRef(0)

  const applyWittyAgents = useCallback((agents: WittyAgentSummary[]) => {
    const sortedAgents = sortWittyAgents(agents)
    setWittyAgents(sortedAgents)
    setSelectedWittyAgentIdState(currentValue => {
      if (currentValue === 'all') {
        return currentValue
      }

      return sortedAgents.some(agent => agent.witty_agent_id === currentValue)
        ? currentValue
        : 'all'
    })
  }, [])

  const refreshWittyAgents = useCallback(async () => {
    const requestId = ++requestIdRef.current
    const agents = await insightService.getWittyAgents()

    if (requestIdRef.current !== requestId) {
      return
    }

    applyWittyAgents(agents)
  }, [applyWittyAgents])

  const agentFilterOptions = useMemo(() => createAgentFilterOptions(wittyAgents), [wittyAgents])

  const controller: InsightOverviewFiltersController = {
    rangePresets: RANGE_PRESETS,
    selectedPreset,
    setSelectedPreset: setSelectedPresetState,
    selectedWittyAgentId,
    setSelectedWittyAgentId: setSelectedWittyAgentIdState,
    wittyAgents,
    agentFilterOptions,
    queryRange,
  }

  return {
    controller,
    queryRange,
    selectedPreset,
    selectedWittyAgentId,
    refreshWittyAgents,
    setQueryRange,
  }
}
