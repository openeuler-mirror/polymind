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
    const response = await httpClient.post<ApiResponse<Session>>(
      `/api/v1/agents/${agentId}/sessions`,
      {}
    )
    return this.transformSession(response.data, agentId)
  }

  /**
   * 获取Agent的所有会话
   */
  public async getSessions(agentId: string): Promise<Session[]> {
    const response = await httpClient.get<ApiResponse<Session[]>>(
      `/api/v1/agents/${agentId}/sessions`
    )
    return response.data.map(session => this.transformSession(session, agentId))
  }

  /**
   * 删除会话
   */
  public async deleteSession(agentId: string, sessionId: string): Promise<void> {
    await httpClient.delete(`/api/v1/agents/${agentId}/sessions/${sessionId}`)
  }

  /**
   * 转换会话数据格式
   */
  private transformSession(session: any, agentId: string): Session {
    return {
      ...session,
      agentId,
      createdAt: new Date(session.created_at),
      status: session.status as SessionStatus
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