// ============================================
// 聊天相关类型
// ============================================

/**
 * 消息接口
 */
export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  isStreaming?: boolean
  toolCalls?: ToolCall[]
  attachments?: Attachment[]
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
 * 模型配置接口
 */
export interface ModelConfig {
  id: string
  name: string
  provider: string
  contextLength: number
  capabilities: ('text' | 'vision' | 'code' | 'tools')[]
}

// ============================================
// Agent相关类型
// ============================================

/**
 * Agent状态枚举
 */
export enum AgentStatus {
  CREATING = 'CREATING',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  STOPPED = 'STOPPED',
  ERROR = 'ERROR'
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
 * Agent接口
 */
export interface Agent {
  id: string
  name: string
  adapterType: AdapterType
  status: AgentStatus
  sandboxId: string
  defaultSessionId: string
  hasScheduledTasks: boolean
  idleTimeout: number
  createdAt: Date
  updatedAt: Date
}

/**
 * 创建Agent请求接口
 */
export interface CreateAgentRequest {
  name: string
  adapterType: AdapterType
  template: Record<string, any>
  modelOverride?: Partial<ModelConfig>
  sandboxConfig?: {
    type?: string
    timeout?: number
  }
  idleTimeout?: number
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
  ACTIVE = 'ACTIVE',
  STOPPED = 'STOPPED'
}

/**
 * 会话接口
 */
export interface Session {
  id: string
  agentId: string
  status: SessionStatus
  createdAt: Date
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
