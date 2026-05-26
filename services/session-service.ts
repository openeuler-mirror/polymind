import { httpClient } from '@/lib/http-client'
import { Session, ApiResponse, SessionManagementStrategy,Conversation,Message} from '@/lib/types'
import { SessionStatus } from '@/lib/types'

/**
 * 会话服务类 - 负责会话的创建和管理
 */
class SessionService {
  /**
   * 创建会话
   */
  public async createSession(agentId: string): Promise<Session> {
    const response = await httpClient.post<any>(
      `/agents/${agentId}/sessions`,
      {}
    )
    // 处理不同的响应格式：可能直接返回session对象，也可能包装在data字段中
    const sessionData = response.data || response
    return this.transformSession(sessionData, agentId)
  }

  /**
   * 获取Agent的所有会话
   */
  public async getSessions(agentId: string): Promise<Session[]> {
    const response = await httpClient.get<ApiResponse<Session[]>>(
      `/agents/${agentId}/sessions`
    )
    return response.data.map(session => this.transformSession(session, agentId))
  }

  /**
   * 删除会话
   */
  public async deleteSession(agentId: string, sessionId: string): Promise<void> {
    await httpClient.delete(`/agents/${agentId}/sessions/${sessionId}`)
  }

  /**
   * 中断会话
   */
  public async abortSession(agentId: string, sessionId: string): Promise<void> {
    await httpClient.post(`/agents/${agentId}/sessions/${sessionId}/abort`)
  }

  /**
   * 获取会话列表（含摘要信息）
   */
  public async getConversations(agentId: string): Promise<any[]> {
    const response = await httpClient.get<any[]>(
      `/agents/${agentId}/conversations`
    )
    return Array.isArray(response) ? response : (response as any).data || []
  }

  /**
   * 获取完整会话（含消息和事件），默认最近 20 条消息。
   * 通过 before 参数加载更早的消息。
   */
  public async getConversation(
    agentId: string,
    sessionId: string,
    limit: number = 10,
    before?: string,
  ): Promise<any> {
    const params = new URLSearchParams({ limit: String(limit) })
    if (before) params.set('before', before)
    const response = await httpClient.get<any>(
      `/agents/${agentId}/conversations/${sessionId}?${params.toString()}`
    )
    return response.data || response
  }

  /**
   * 更新会话元数据（标题、置顶）
   */
  public async updateConversation(
    agentId: string,
    sessionId: string,
    updates: { title?: string; pinned?: boolean }
  ): Promise<void> {
    await httpClient.patch(`/agents/${agentId}/conversations/${sessionId}`, updates)
  }

  /**
   * 将 API 会话摘要转换为前端 Conversation 类型
   */
  public transformConversationSummary(summary: any, agentName?: string): Conversation {
    return {
      id: summary.id,
      title: summary.title || summary.first_message_preview || '新对话',
      messages: [],
      createdAt: new Date(summary.created_at),
      updatedAt: new Date(summary.updated_at),
      model: summary.model,
      pinned: summary.pinned,
      agentId: summary.agent_id,
      agentName,
      sessionId: summary.id,
    }
  }

  /**
   * 将 API 会话详情中的消息转换为前端 Message 类型
   */
  public transformMessage(msg: any): Message {
    return {
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: new Date(msg.timestamp || msg.created_at),
      isStreaming: msg.isStreaming ?? (msg.status === 'generating'),
      status: msg.status,
      toolCalls: msg.toolCalls || msg.tool_calls,
      thinking: msg.thinking,
      events: (msg.events || []).map((evt: any) => ({
        type: evt.type,
        content: evt.content || evt.delta || '',
        timestamp: typeof evt.timestamp === 'number'
          ? evt.timestamp
          : evt.timestamp ? new Date(evt.timestamp).getTime() : Date.now(),
        toolCall: evt.toolCall || undefined,
      })),
      usage: msg.usage,
    }
  }

  /**
   * 转换会话数据格式
   */
  private transformSession(session: any, agentId: string): Session {
    if (!session) {
      throw new Error('会话数据为空')
    }
    return {
      id: session.id,
      agentId,
      status: (session.status as SessionStatus) || SessionStatus.ACTIVE,
      contextInitialized: session.context_initialized ?? session.contextInitialized ?? true,
      runtimeType: session.runtime_type || session.runtimeType || 'openclaw',
      createdAt: session.created_at || session.createdAt,
      updatedAt: session.updated_at || session.updatedAt
    }
  }
}

// 默认会话管理策略
class DefaultSessionStrategy implements SessionManagementStrategy {
  private sessionService: SessionService

  constructor() {
    this.sessionService = new SessionService()
  }

  async createSession(agentId: string): Promise<Session> {
    return await this.sessionService.createSession(agentId)
  }

  switchSession(sessionId: string): void {
    // 实现会话切换逻辑
    console.log(`Switching to session: ${sessionId}`)
  }

  async endSession(sessionId: string): Promise<void> {
    // 实现结束会话逻辑
    console.log(`Ending session: ${sessionId}`)
  }
}

// 导出单例实例
export const sessionService = new SessionService()
export { DefaultSessionStrategy }
