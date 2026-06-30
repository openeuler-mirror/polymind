export type InsightQueryValue = string | number | boolean | null | undefined

export type InsightQueryParams = Record<string, InsightQueryValue>

export interface InsightCapabilitiesFeatures {
  sessions: boolean
  timeseries: boolean
  interruptions: boolean
  health: boolean
}

export interface InsightCapabilitiesResponse {
  enabled: boolean
  reachable: boolean
  features: InsightCapabilitiesFeatures
}

export interface WittyAgentSummary {
  witty_agent_id: string
  witty_agent_name: string
  status: string
}

export type InterruptionSeverity = 'critical' | 'high' | 'medium' | 'low'

export interface InsightTimeRangeParams {
  [key: string]: InsightQueryValue
  start_ns?: number
  end_ns?: number
  witty_agent_id?: string
}

export interface InsightTimeseriesParams extends InsightTimeRangeParams {
  buckets?: number
}

export interface SessionSummary {
  session_id: string
  runtime_session_id: string | null
  witty_agent_id: string
  witty_agent_name: string
  agent_name: string | null
  conversation_count: number
  first_seen_ns: number
  last_seen_ns: number
  total_input_tokens: number
  total_output_tokens: number
  model: string | null
}

export interface TraceSummary {
  trace_id: string
  conversation_id: string
  call_count: number
  total_input_tokens: number
  total_output_tokens: number
  start_ns: number
  end_ns: number | null
  model: string | null
  user_query: string | null
}

export interface TraceEventDetail {
  id: number
  call_id: string | null
  start_timestamp_ns: number
  end_timestamp_ns: number | null
  model: string | null
  input_tokens: number
  output_tokens: number
  total_tokens: number
  input_messages: string | null
  output_messages: string | null
  system_instructions: string | null
  agent_name: string | null
  process_name: string | null
  pid: number | null
  user_query: string | null
  event_json: string | null
  trace_id: string | null
  conversation_id: string | null
  cache_read_tokens?: number | null
  status?: string | null
  interruption_type?: string | null
}

export interface TimeseriesBucket {
  bucket_start_ns: number
  input_tokens: number
  output_tokens: number
  total_tokens: number
}

export interface ModelTimeseriesBucket {
  bucket_start_ns: number
  model: string
  total_tokens: number
}

export interface TimeseriesResponse {
  token_series: TimeseriesBucket[]
  model_series: ModelTimeseriesBucket[]
}

export interface InterruptionRecord {
  id?: number | null
  interruption_id: string
  session_id: string | null
  runtime_session_id: string | null
  trace_id: string | null
  conversation_id: string | null
  call_id: string | null
  pid: number | null
  agent_name: string | null
  interruption_type: string
  severity: InterruptionSeverity
  occurred_at_ns: number
  detail: string | null
  resolved: boolean
}

export type InterruptionSeverityCounts = Record<InterruptionSeverity, number>

export interface InterruptionCountResponse {
  total: number
  by_severity: InterruptionSeverityCounts
}

export interface InterruptionTypeStat {
  interruption_type: string
  severity: string
  count: number
}

interface InterruptionAggregateCount {
  total: number
  by_severity: InterruptionSeverityCounts
  types: InterruptionTypeStat[]
}

export interface SessionInterruptionCount extends InterruptionAggregateCount {
  session_id: string
  runtime_session_id: string | null
}

export interface ConversationInterruptionCount extends InterruptionAggregateCount {
  conversation_id: string
}

export type AgentRuntimeHealthState =
  | 'healthy'
  | 'unhealthy'
  | 'hung'
  | 'unknown'
  | 'no_port'
  | 'offline'

export type ManagedAgentHealthOverallStatus =
  | AgentRuntimeHealthState
  | 'degraded'
  | 'missing_runtime'
  | 'ambiguous'

export interface AgentRuntimeHealthStatus {
  pid: number
  agent_name: string
  category: string
  exe_path: string
  ports: number[]
  status: AgentRuntimeHealthState
  last_check_time: number
  latency_ms: number | null
  error_message: string | null
}

export interface AgentHealthStatus {
  witty_agent_id: string
  witty_agent_name: string
  witty_status: string | null
  overall_status: ManagedAgentHealthOverallStatus
  status_reason?: string | null
  adapter_type: string | null
  sandbox_type: string | null
  workspace_path: string | null
  gateway_port: number | null
  adapter_base_url: string | null
  adapter_ready: boolean | null
  adapter_status: string | null
  adapter_latency_ms: number | null
  adapter_error_message: string | null
  adapter_pid: number | null
  stderr_log_path: string | null
  runtime: AgentRuntimeHealthStatus | null
  candidate_runtimes: AgentRuntimeHealthStatus[]
}

export interface AgentHealthResponse {
  agents: AgentHealthStatus[]
  orphan_runtimes: AgentRuntimeHealthStatus[]
  last_scan_time: number
}

export interface AtifToolCall {
  tool_call_id: string
  function_name: string
  arguments: unknown
}

export interface AtifObservationResult {
  source_call_id?: string
  content?: string
}

export interface AtifObservation {
  results: AtifObservationResult[]
}

export interface AtifStepMetrics {
  prompt_tokens?: number
  completion_tokens?: number
  cached_tokens?: number
  extra?: unknown
}

export interface AtifStep {
  step_id: number
  timestamp?: string
  source: 'system' | 'user' | 'agent'
  message?: string
  model_name?: string
  reasoning_content?: string
  tool_calls?: AtifToolCall[]
  observation?: AtifObservation
  metrics?: AtifStepMetrics
  extra?: unknown
}

export interface AtifAgent {
  name: string
  version: string
  model_name?: string
  tool_definitions?: unknown[]
  extra?: unknown
}

export interface AtifFinalMetrics {
  total_prompt_tokens?: number
  total_completion_tokens?: number
  total_cached_tokens?: number
  total_steps?: number
  extra?: unknown
}

export interface AtifDocument {
  schema_version: string
  session_id: string
  runtime_session_id?: string | null
  agent: AtifAgent
  steps: AtifStep[]
  final_metrics?: AtifFinalMetrics
  extra?: unknown
}

export interface InterruptionResolveResponse {
  status: string
}

export interface AgentHealthActionResponse {
  ok: boolean
}

export interface RestartAgentHealthResponse extends AgentHealthActionResponse {
  new_pid: number
  cmd: string[]
}
