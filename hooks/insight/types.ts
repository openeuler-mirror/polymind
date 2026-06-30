export type {
  AgentHealthResponse,
  AgentHealthStatus,
  AgentRuntimeHealthStatus,
  AtifDocument,
  AtifStep,
  AtifToolCall,
  ConversationInterruptionCount,
  InterruptionCountResponse,
  InterruptionRecord,
  InterruptionSeverity,
  InterruptionTypeDetail,
  ManagedAgentHealthOverallStatus,
  ModelTimeseriesBucket,
  SessionInterruptionCount,
  SessionSummary,
  TimeseriesBucket,
  TimeseriesResponse,
  TraceSummary,
  WittyAgentSummary,
} from '@/services/insight/api-types'

export type InsightPanelView = 'overview' | 'atif'

export type InsightAtifSource = 'session' | 'conversation'

export interface InsightAtifTarget {
  source: InsightAtifSource
  id: string
}
