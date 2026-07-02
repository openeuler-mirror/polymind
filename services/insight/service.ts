import { httpClient } from '@/lib/http-client'
import type {
  AgentHealthActionResponse,
  AgentHealthResponse,
  AtifDocument,
  ConversationInterruptionCount,
  InsightCapabilitiesResponse,
  InsightQueryParams,
  InsightTimeRangeParams,
  InsightTimeseriesParams,
  InterruptionCountResponse,
  InterruptionRecord,
  InterruptionResolveResponse,
  InterruptionTypeStat,
  RestartAgentHealthResponse,
  SessionInterruptionCount,
  SessionSummary,
  TimeseriesResponse,
  TraceEventDetail,
  TraceSummary,
  WittyAgentSummary,
} from './api-types'

function buildQueryString(params: InsightQueryParams = {}): string {
  const searchParams = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      return
    }

    searchParams.set(key, String(value))
  })

  const query = searchParams.toString()
  return query ? `?${query}` : ''
}

class InsightService {
  public getCapabilities() {
    return httpClient.get<InsightCapabilitiesResponse>('/insight/capabilities')
  }

  public getWittyAgents() {
    return httpClient.get<WittyAgentSummary[]>('/insight/witty-agents')
  }

  public getSessions(params: InsightTimeRangeParams = {}) {
    return httpClient.get<SessionSummary[]>(`/insight/sessions${buildQueryString(params)}`)
  }

  public getSessionTraces(sessionId: string, params: InsightTimeRangeParams = {}) {
    return httpClient.get<TraceSummary[]>(
      `/insight/sessions/${encodeURIComponent(sessionId)}/traces${buildQueryString(params)}`
    )
  }

  public getSessionInterruptions(sessionId: string) {
    return httpClient.get<InterruptionRecord[]>(
      `/insight/sessions/${encodeURIComponent(sessionId)}/interruptions`
    )
  }

  public getTraceDetail(traceId: string) {
    return httpClient.get<TraceEventDetail[]>(`/insight/traces/${encodeURIComponent(traceId)}`)
  }

  public getConversationDetail(conversationId: string) {
    return httpClient.get<TraceEventDetail[]>(
      `/insight/conversations/${encodeURIComponent(conversationId)}`
    )
  }

  public getConversationInterruptions(conversationId: string) {
    return httpClient.get<InterruptionRecord[]>(
      `/insight/conversations/${encodeURIComponent(conversationId)}/interruptions`
    )
  }

  public getTimeseries(params: InsightTimeseriesParams = {}) {
    return httpClient.get<TimeseriesResponse>(`/insight/timeseries${buildQueryString(params)}`)
  }

  public getInterruptionCount(params: InsightTimeRangeParams = {}) {
    return httpClient.get<InterruptionCountResponse>(
      `/insight/interruptions/count${buildQueryString(params)}`
    )
  }

  public getInterruptionStats(params: InsightTimeRangeParams = {}) {
    return httpClient.get<InterruptionTypeStat[]>(
      `/insight/interruptions/stats${buildQueryString(params)}`
    )
  }

  public getInterruptionSessionCounts(params: InsightTimeRangeParams = {}) {
    return httpClient.get<SessionInterruptionCount[]>(
      `/insight/interruptions/session-counts${buildQueryString(params)}`
    )
  }

  public getInterruptionConversationCounts(params: InsightTimeRangeParams = {}) {
    return httpClient.get<ConversationInterruptionCount[]>(
      `/insight/interruptions/conversation-counts${buildQueryString(params)}`
    )
  }

  public resolveInterruption(interruptionId: string) {
    return httpClient.post<InterruptionResolveResponse>(
      `/insight/interruptions/${encodeURIComponent(interruptionId)}/resolve`
    )
  }

  public getAgentHealth() {
    return httpClient.get<AgentHealthResponse>('/insight/agent-health')
  }

  public deleteAgentHealth(pid: number) {
    return httpClient.delete<AgentHealthActionResponse>(`/insight/agent-health/${pid}`)
  }

  public restartAgentHealth(pid: number) {
    return httpClient.post<RestartAgentHealthResponse>(`/insight/agent-health/${pid}/restart`)
  }

  public getAtifBySession(sessionId: string) {
    return httpClient.get<AtifDocument>(
      `/insight/export/atif/session/${encodeURIComponent(sessionId)}`
    )
  }

  public getAtifByConversation(conversationId: string) {
    return httpClient.get<AtifDocument>(
      `/insight/export/atif/conversation/${encodeURIComponent(conversationId)}`
    )
  }
}

export const insightService = new InsightService()
