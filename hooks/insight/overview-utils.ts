import type { InterruptionCountResponse, SessionInterruptionCount, SessionSummary } from './types'

interface InsightInterruptionTotalOptions {
  selectedWittyAgentId: string
  interruptionCountLoaded: boolean
  sessionInterruptionCountsLoaded: boolean
  interruptionCount: InterruptionCountResponse | null
  sessions: Array<Pick<SessionSummary, 'session_id'>>
  sessionInterruptionCounts: Record<string, Pick<SessionInterruptionCount, 'total'>>
}

export function isAllInsightAgents(value: string) {
  return value === 'all'
}

export function getInsightInterruptionTotal({
  selectedWittyAgentId,
  interruptionCountLoaded,
  sessionInterruptionCountsLoaded,
  interruptionCount,
  sessions,
  sessionInterruptionCounts,
}: InsightInterruptionTotalOptions): number | null {
  if (isAllInsightAgents(selectedWittyAgentId)) {
    return interruptionCountLoaded ? (interruptionCount?.total ?? 0) : null
  }

  if (!sessionInterruptionCountsLoaded) {
    return null
  }

  return sessions.reduce((total, session) => {
    return total + (sessionInterruptionCounts[session.session_id]?.total ?? 0)
  }, 0)
}
