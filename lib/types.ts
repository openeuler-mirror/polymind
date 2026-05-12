// ============================================
// 聊天相关类型
// ============================================

/**
 * 消息接口
 */
export interface EventItem {
  type: 'thinking' | 'tool.call.started' | 'tool.call.response' | 'message.delta' | 'message.completed' | 'usage.updated' | 'session.runtime.changed' | 'stream.error' | 'client.error'
  session_id?: string
  event_id?: string
  ts_ms?: number
  runtime_type?: string
  payload?: Record<string, any>
  content?: string
  timestamp?: number
  toolCall?: ToolCall
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  isStreaming?: boolean
  toolCalls?: ToolCall[]
  attachments?: Attachment[]
  thinking?: string[]
  displayText?: string[]
  events?: EventItem[]
  usage?: {
    inputTokens?: number
    outputTokens?: number
    totalCost?: number
  }
}

/**
 * 工具调用接口
 */
export interface ToolCall {
  id: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'error'
  input?: Record<string, unknown>
  output?: string
  error?: string
  duration?: number
  displayText?: string
}

/**
 * 附件接口
 */
export interface Attachment {
  id: string
  name: string
  type: 'file' | 'image' | 'code'
  size: number
  url?: string
  content?: string
}

/**
 * 会话接口
 */
export interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
  updatedAt: Date
  model?: string
  pinned?: boolean
  agentId?: string  // 创建该会话的 agent ID
  agentName?: string  // 创建该会话的 agent 名称
  isStreaming?: boolean  // 该会话是否正在生成消息
}

// ============================================
// 工具和模型相关类型
// ============================================

/**
 * MCP工具接口
 */
export interface MCPTool {
  id: string
  name: string
  description: string
  category: 'search' | 'code' | 'data' | 'file' | 'web' | 'system'
  enabled: boolean
  icon?: string
}

/**
 * 模型提供商枚举
 */
export enum ModelProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
  OLLAMA = 'ollama',
  AZURE = 'azure',
  DEEPSEEK = 'deepseek',
  GLM = 'glm',
  MINIMAX = 'minimax',
  KIMI = 'kimi',
  CUSTOM = 'custom'
}

/**
 * 模型配置接口
 */
export interface ModelConfig {
  id: string
  name: string
  provider: ModelProvider | string
  apiBaseUrl?: string
  description?: string
  enabled: boolean
  maxTokens?: number
  temperature?: number
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

/**
 * 创建模型配置请求接口
 */
export interface CreateModelRequest {
  name: string
  provider: ModelProvider | string
  apiKey: string
  apiBaseUrl?: string
  description?: string
  enabled?: boolean
  maxTokens?: number
  temperature?: number
  isDefault?: boolean
}

// ============================================
// Agent相关类型
// ============================================

/**
 * Agent状态枚举
 */
export enum AgentStatus {
  RUNNING = 'running',
  PAUSED = 'paused',
  ERROR = 'error'
}

/**
 * 模型服务类型枚举
 */
export enum ModelServiceType {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
  AZURE = 'azure'
}

/**
 * 模型服务配置接口
 */
export interface ModelServiceConfig {
  type: ModelServiceType
  name: string
  defaultApiUrl: string
  description: string
}

/**
 * 模型服务配置对象
 */
export const MODEL_SERVICES: Record<ModelServiceType, ModelServiceConfig> = {
  [ModelServiceType.OPENAI]: {
    type: ModelServiceType.OPENAI,
    name: 'OpenAI',
    defaultApiUrl: 'https://api.openai.com/v1',
    description: 'OpenAI 模型服务'
  },
  [ModelServiceType.ANTHROPIC]: {
    type: ModelServiceType.ANTHROPIC,
    name: 'Anthropic',
    defaultApiUrl: 'https://api.anthropic.com/v1',
    description: 'Anthropic 模型服务'
  },
  [ModelServiceType.GOOGLE]: {
    type: ModelServiceType.GOOGLE,
    name: 'Google AI',
    defaultApiUrl: 'https://generativelanguage.googleapis.com/v1',
    description: 'Google AI 模型服务'
  },
  [ModelServiceType.AZURE]: {
    type: ModelServiceType.AZURE,
    name: 'Azure OpenAI',
    defaultApiUrl: '',
    description: 'Azure OpenAI 模型服务'
  }
}

/**
 * 适配器类型枚举
 */
export enum AdapterType {
  OPENCODE = 'opencode',
  OPENCLAW = 'openclaw',
  CLAUDE_CODE = 'claude-code'
}

/**
 * 沙箱类型枚举
 */
export enum SandboxType {
  DOCKER = 'docker',
  LOCAL_PROCESS = 'local_process',
  E2B = 'e2b'
}

/**
 * 沙箱配置接口
 */
export interface SandboxConfig {
  type: SandboxType
  name: string
  description: string
  value: string // 传给后端的值
}

/**
 * 沙箱配置对象
 */
export const SANDBOX_CONFIGS: Record<SandboxType, SandboxConfig> = {
  [SandboxType.DOCKER]: {
    type: SandboxType.DOCKER,
    name: 'Docker',
    description: '使用 Docker 容器作为沙箱环境',
    value: 'docker'
  },
  [SandboxType.LOCAL_PROCESS]: {
    type: SandboxType.LOCAL_PROCESS,
    name: '本地进程',
    description: '使用本地进程作为沙箱环境',
    value: 'local_process'
  },
  [SandboxType.E2B]: {
    type: SandboxType.E2B,
    name: 'E2B云沙箱',
    description: '使用E2B云沙箱作为运行环境',
    value: 'e2b'
  }
}

/**
 * Agent技能接口
 */
export interface AgentSkill {
  name: string
  description: string
  filePath: string
  source: string
}

/**
 * Agent接口
 */
export interface Agent {
  id: string
  name: string
  description?: string
  adapterType: AdapterType | string
  sandboxType: SandboxType | string
  status: AgentStatus | string
  sandboxId?: string | null
  workspacePath?: string
  idleTimeoutSeconds: number
  hasScheduledTasks: boolean
  defaultSessionId?: string | null
  processPort?: number | null
  skills?: AgentSkill[]
  createdAt: string
  updatedAt: string
}

/**
 * 创建Agent请求接口
 */
export interface CreateAgentRequest {
  name: string
  description?: string
  sandboxType: SandboxType | string
  adapterType: AdapterType | string
  idleTimeoutSeconds: number
  sandboxId?: string
  hasScheduledTasks?: boolean
}

/**
 * 更新Agent请求接口
 */
export interface UpdateAgentRequest {
  name?: string
  modelOverride?: Partial<ModelConfig>
  idleTimeout?: number
}

// ============================================
// 会话相关类型
// ============================================

/**
 * 会话状态枚举
 */
export enum SessionStatus {
  ACTIVE = 'active',
  CLOSED = 'closed'
}

/**
 * 会话接口
 */
export interface Session {
  id: string
  agentId: string
  status: SessionStatus
  contextInitialized: boolean
  runtimeType: string
  createdAt: string
  updatedAt: string
}

/**
 * 会话管理策略接口
 */
export interface SessionManagementStrategy {
  createSession(agentId: string): Promise<Session>
  switchSession(sessionId: string): void
  endSession(sessionId: string): Promise<void>
}

// ============================================
// 消息事件相关类型
// ============================================

/**
 * Agent事件类型枚举
 */
export enum AgentEventType {
  THINKING = 'thinking',
  MESSAGE = 'message',
  TOOL_USE = 'tool_use',
  DONE = 'done',
  ERROR = 'error'
}

/**
 * Agent事件接口
 */
export interface AgentEvent {
  type: AgentEventType
  content: string
  timestamp: Date
  name?: string
  input?: any
  toolCallId?: string
}

/**
 * WebSocket消息接口
 */
export interface WebSocketMessage {
  type: 'message' | 'create_session' | 'close_session' | 'ping'
  content?: string
  sessionId: string
}

// ============================================
// API和HTTP相关类型
// ============================================

/**
 * API响应接口
 */
export interface ApiResponse<T> {
  data: T
  message?: string
  success: boolean
}

/**
 * HTTP请求配置接口
 */
export interface RequestConfig {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  headers?: HeadersInit
  data?: any
  timeout?: number
}

// ============================================
// 设计模式相关类型
// ============================================

/**
 * 命令接口（命令模式）
 */
export interface Command {
  execute(): Promise<any>
}

// ============================================
// CVE 相关类型
// ============================================

export interface CveLabel {
  name: string
  color: string
}

export interface CveUser {
  login: string
  avatar_url: string
}

export interface CveIssue {
  id: number
  number: number
  title: string
  body: string
  state: string
  html_url: string
  created_at: string
  updated_at: string
  labels: CveLabel[]
  user: CveUser
}

export interface CveConfig {
  signer_name: string
  signer_email: string
  clone_dir: string
  branches: string
  fork_repo_url: string
  repo_url: string
  issue_url: string
}

export interface CveIssueListResponse {
  items: CveIssue[]
}

export interface CveConfigResponse extends CveConfig {
  has_gitcode_token: boolean
}

export interface CveConfigUpdateResponse {
  ok: boolean
}

// ============================================
// Skills Repo相关类型
// ============================================

/**
 * 技能仓库来源类型
 */
export type SkillRepositorySourceType = 'git' | 'local_import'

/**
 * 技能仓库信息
 */
export interface SkillRepository {
  repo_id: string
  repo_name?: string
  source_type: SkillRepositorySourceType | string
  branch?: string | null
  url?: string | null
  local_path?: string | null
}

/**
 * 技能仓库响应
 */
export interface SkillRepositoryResponse extends SkillRepository {
  skill_discover_status: string
  skill_num: number
  discovered_skills: SkillDiscoveryItem[]
  created_at?: string
  updated_at?: string
}

/**
 * 创建技能仓库请求
 */
export interface CreateSkillRepositoryRequest {
  source_type: SkillRepositorySourceType | string
  url?: string
  branch?: string
  local_path?: string
}

/**
 * 更新技能仓库请求
 */
export interface UpdateSkillRepositoryRequest {
  source_type?: SkillRepositorySourceType | string
  branch?: string
  local_path?: string
}

/**
 * 已发现技能的来源仓库信息
 */
export interface SkillDiscoverySourceRepository {
  repo_id?: string
  name?: string
  source_type?: SkillRepositorySourceType | string
  branch?: string | null
  url?: string | null
  local_path?: string | null
}

/**
 * 技能发现项
 */
export interface SkillDiscoveryItem {
  skill_id?: string
  skill_name?: string
  relative_path?: string
  metadata?: Record<string, unknown> | null
  source_repo?: SkillDiscoverySourceRepository
  skill_md_url?: string | null
}

/**
 * 技能仓库发现状态
 */
export interface SkillRepositoryDiscoveryStatus {
  repo_id: string
  repo_name: string
  discover_status: string
  skill_num?: number
}
