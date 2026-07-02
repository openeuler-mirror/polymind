import type {
  ConversationInterruptionCount,
  InterruptionRecord,
  SessionInterruptionCount,
  SessionSummary,
  TraceSummary,
  WittyAgentSummary,
} from './types'

export type InsightRangePreset = '1h' | '6h' | '24h' | '7d'

export interface InsightQueryRange {
  label: string
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

export interface InsightAgentFilterOption extends WittyAgentSummary {
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

export const RANGE_PRESETS: Array<{
  id: InsightRangePreset
  label: string
  durationMs: number
}> = [
  { id: '1h', label: '最近 1 小时', durationMs: 1 * 60 * 60 * 1000 },
  { id: '6h', label: '最近 6 小时', durationMs: 6 * 60 * 60 * 1000 },
  { id: '24h', label: '最近 24 小时', durationMs: 24 * 60 * 60 * 1000 },
  { id: '7d', label: '最近 7 天', durationMs: 7 * 24 * 60 * 60 * 1000 },
]

export function buildQueryRange(preset: InsightRangePreset): InsightQueryRange {
  const matchedPreset = RANGE_PRESETS.find(item => item.id === preset) ?? RANGE_PRESETS[2]
  const endMs = Date.now()
  const startMs = endMs - matchedPreset.durationMs

  return {
    label: matchedPreset.label,
    startNs: startMs * 1_000_000,
    endNs: endMs * 1_000_000,
  }
}

export function sortSessions(sessions: SessionSummary[]): SessionSummary[] {
  return [...sessions].sort((left, right) => right.last_seen_ns - left.last_seen_ns)
}

export function sortWittyAgents(agents: WittyAgentSummary[]): WittyAgentSummary[] {
  return [...agents].sort((left, right) =>
    left.witty_agent_name.localeCompare(right.witty_agent_name)
  )
}

export function sortTraces(traces: TraceSummary[]): TraceSummary[] {
  return [...traces].sort((left, right) => right.start_ns - left.start_ns)
}

export function sortInterruptionRecords(records: InterruptionRecord[]): InterruptionRecord[] {
  return [...records].sort((left, right) => right.occurred_at_ns - left.occurred_at_ns)
}

export function indexSessionInterruptionCounts(
  counts: SessionInterruptionCount[]
): Record<string, SessionInterruptionCount> {
  return counts.reduce<Record<string, SessionInterruptionCount>>((accumulator, currentValue) => {
    accumulator[currentValue.session_id] = currentValue
    return accumulator
  }, {})
}

export function indexConversationInterruptionCounts(
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

export function getInsightErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Witty Insight 数据加载失败'
}

export function createAgentFilterOptions(agents: WittyAgentSummary[]): InsightAgentFilterOption[] {
  return sortWittyAgents(agents).map(agent => ({
    ...agent,
    label: agent.witty_agent_name,
  }))
}
