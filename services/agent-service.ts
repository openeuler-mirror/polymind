import { httpClient } from '@/lib/http-client'
import {
  Agent,
  CreateAgentRequest,
  UpdateAgentRequest,
  ApiResponse
} from '@/lib/types'
import { AgentStatus, AdapterType } from '@/lib/types'

/**
 * Agent服务类 - 负责Agent的创建、管理和操作
 */
class AgentService {
  /**
   * 创建Agent
   */
  public async createAgent(request: CreateAgentRequest): Promise<Agent> {
    const response = await httpClient.post<ApiResponse<Agent>>('/api/v1/agents', request)
    if (!response || !response.data) {
      throw new Error('Invalid API response: missing data field')
    }
    return this.transformAgent(response.data)
  }

  /**
   * 获取所有Agent
   */
  public async getAgents(): Promise<Agent[]> {
    const response = await httpClient.get<ApiResponse<Agent[]>>('/api/v1/agents')
    if (!response || !response.data) {
      throw new Error('Invalid API response: missing data field')
    }
    return response.data.map(agent => this.transformAgent(agent))
  }

  /**
   * 获取特定Agent
   */
  public async getAgent(agentId: string): Promise<Agent> {
    const response = await httpClient.get<ApiResponse<Agent>>(`/api/v1/agents/${agentId}`)
    if (!response || !response.data) {
      throw new Error('Invalid API response: missing data field')
    }
    return this.transformAgent(response.data)
  }

  /**
   * 更新Agent
   */
  public async updateAgent(agentId: string, request: UpdateAgentRequest): Promise<Agent> {
    const response = await httpClient.patch<ApiResponse<Agent>>(`/api/v1/agents/${agentId}`, request)
    if (!response || !response.data) {
      throw new Error('Invalid API response: missing data field')
    }
    return this.transformAgent(response.data)
  }

  /**
   * 删除Agent
   */
  public async deleteAgent(agentId: string): Promise<void> {
    await httpClient.delete(`/api/v1/agents/${agentId}`)
  }

  /**
   * 暂停Agent
   */
  public async pauseAgent(agentId: string): Promise<{ agent?: Agent; error?: string }> {
    try {
      const response = await httpClient.post<ApiResponse<Agent>>(`/api/v1/agents/${agentId}/pause`)
      if (!response) {
        return { error: 'Invalid API response' }
      }
      if (response.success) {
        if (response.data) {
          // 如果有data字段，转换并返回
          const agent = this.transformAgent(response.data)
          // 确保状态为paused
          agent.status = AgentStatus.PAUSED
          return { agent }
        } else {
          // 如果没有data字段，重新获取Agent信息
          const agent = await this.getAgent(agentId)
          // 确保状态为paused
          agent.status = AgentStatus.PAUSED
          return { agent }
        }
      }
      // 如果success为false，返回错误信息
      return { error: '暂停失败，请稍后重试' }
    } catch (err) {
      return { error: '暂停失败，请稍后重试' }
    }
  }

  /**
   * 恢复Agent
   */
  public async resumeAgent(agentId: string): Promise<{ agent?: Agent; error?: string }> {
    try {
      const response = await httpClient.post<ApiResponse<Agent>>(`/api/v1/agents/${agentId}/resume`)
      console.log('Resume agent response:', response)
      if (!response) {
        console.log('No response received')
        return { error: 'Invalid API response' }
      }
      console.log('Response success:', response.success)
      if (response.success) {
        if (response.data) {
          // 如果有data字段，转换并返回
          const agent = this.transformAgent(response.data)
          // 确保状态为running
          agent.status = AgentStatus.RUNNING
          return { agent }
        } else {
          // 如果没有data字段，重新获取Agent信息
          const agent = await this.getAgent(agentId)
          // 确保状态为running
          agent.status = AgentStatus.RUNNING
          return { agent }
        }
      }
      // 如果success为false，返回错误信息
      console.log('Success is false, returning error')
      return { error: '启动失败，请稍后重试' }
    } catch (err) {
      console.error('Error in resumeAgent:', err)
      return { error: '启动失败，请稍后重试' }
    }
  }

  /**
   * 转换Agent数据格式
   */
  private transformAgent(agent: any): Agent {
    if (!agent || typeof agent !== 'object') {
      throw new Error('Agent data is invalid')
    }
    return {
      ...agent,
      createdAt: agent.created_at ? new Date(agent.created_at) : new Date(),
      updatedAt: agent.updated_at ? new Date(agent.updated_at) : new Date(),
      adapterType: agent.adapter_type as AdapterType,
      status: agent.status as AgentStatus
    }
  }
}



// Agent工厂类
class AgentFactory {
  public static createAgent(config: CreateAgentRequest): Agent {
    // 这里可以根据配置创建不同类型的Agent实例
    // 当前主要用于类型转换和验证
    return {
      id: crypto.randomUUID(),
      name: config.name,
      adapterType: config.adapterType,
      status: AgentStatus.CREATING,
      sandboxId: '',
      defaultSessionId: '',
      hasScheduledTasks: false,
      idleTimeout: config.idleTimeout || 300,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }
}

// 导出单例实例
export const agentService = new AgentService()
export { AgentFactory }