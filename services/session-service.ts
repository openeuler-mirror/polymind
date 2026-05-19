import { httpClient } from '@/lib/http-client'
import { Session, ApiResponse, SessionManagementStrategy } from '@/lib/types'
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