import { httpClient } from '@/lib/http-client'
import {
  Agent,
  CreateAgentRequest,
  UpdateAgentRequest,
  ApiResponse,
  CreateAgentHubRequest,
} from '@/lib/types'
import { AgentStatus, AdapterType } from '@/lib/types'
import { generateUUID } from '@/lib/utils'

class AgentService {
  public async createAgent(request: CreateAgentRequest): Promise<Agent> {
    const backendRequest: Record<string, any> = {
      name: request.name,
      description: request.description || '',
      adapter_type: request.adapterType,
      sandbox_type: request.sandboxType,
      idle_timeout_seconds: request.idleTimeoutSeconds,
      sandbox_id: request.sandboxId,
      has_scheduled_tasks: request.hasScheduledTasks,
    }

    if (request.modelId) {
      backendRequest.model_id = request.modelId
    }
    if (request.mcpServerName) {
      backendRequest.mcp_server_name = request.mcpServerName
    }
    if (request.mcpServerConfig) {
      backendRequest.mcp_server_config = request.mcpServerConfig
    }

    console.log('创建智能体请求:', backendRequest)

    const response = await httpClient.post<Agent>('/agents', backendRequest)

    console.log('创建智能体响应:', response)

    if (!response) {
      throw new Error('Invalid API response: no response received')
    }
    return this.transformAgent(response)
  }

  public async getAgents(): Promise<Agent[]> {
    const response = await httpClient.get<Agent[]>('/agents')
    if (!response) {
      throw new Error('Invalid API response: no response received')
    }
    const agentsData = Array.isArray(response) ? response : []
    console.log('原始智能体数据:', agentsData)
    const transformedAgents = agentsData.map(agent => this.transformAgent(agent))
    console.log('转换后的智能体数据:', transformedAgents)
    return transformedAgents
  }

  /** Fetch agents together with their conversation summaries in one request. */
  public async getAgentsWithConversations(): Promise<any[]> {
    const response = await httpClient.get<any[]>('/agents?include_conversations=true')
    if (!response) {
      throw new Error('Invalid API response: no response received')
    }
    return Array.isArray(response) ? response : []
  }

  public async getAgent(agentId: string): Promise<Agent> {
    const response = await httpClient.get<ApiResponse<Agent>>(`/agents/${agentId}`)
    if (!response || !response.data) {
      throw new Error('Invalid API response: missing data field')
    }
    return this.transformAgent(response.data)
  }

  public async updateAgent(agentId: string, request: UpdateAgentRequest): Promise<Agent> {
    const response = await httpClient.patch<ApiResponse<Agent>>(`/agents/${agentId}`, request)
    if (!response || !response.data) {
      throw new Error('Invalid API response: missing data field')
    }
    return this.transformAgent(response.data)
  }

  public async deleteAgent(agentId: string): Promise<void> {
    await httpClient.delete(`/agents/${agentId}`)
  }

  public async importAgentFromHub(request: CreateAgentHubRequest): Promise<Agent> {
    const backendRequest: Record<string, any> = {
      git_url: request.git_url,
      sandbox_type: request.sandbox_type,
      adapter_type: request.adapter_type,
    }

    if (request.branch) {
      backendRequest.branch = request.branch
    }
    if (request.idle_timeout_seconds) {
      backendRequest.idle_timeout_seconds = request.idle_timeout_seconds
    }
    if (request.model_id) {
      backendRequest.model_id = request.model_id
    }

    console.log('从AgentHub导入智能体请求:', backendRequest)

    try {
      const response = await httpClient.post<Agent>('/agents/agenthub', backendRequest)

      console.log('从AgentHub导入智能体响应:', response)
      console.log('响应类型:', typeof response)
      console.log('响应是否为空:', response === null || response === undefined)

      if (!response) {
        throw new Error('Invalid API response: no response received')
      }
      return this.transformAgent(response)
    } catch (err) {
      console.error('从AgentHub导入智能体失败:', err)
      console.error('错误详情:', err instanceof Error ? err.stack : err)
      throw err
    }
  }

  public async pauseAgent(agentId: string): Promise<{ agent?: Agent; error?: string }> {
    try {
      const response = await httpClient.post<ApiResponse<Agent>>(`/agents/${agentId}/pause`)
      if (!response) {
        return { error: 'Invalid API response' }
      }
      if (response.success) {
        if (response.data) {
          const agent = this.transformAgent(response.data)
          agent.status = AgentStatus.PAUSED
          return { agent }
        } else {
          const agent = await this.getAgent(agentId)
          agent.status = AgentStatus.PAUSED
          return { agent }
        }
      }
      return { error: '暂停失败，请稍后重试' }
    } catch (err) {
      return { error: '暂停失败，请稍后重试' }
    }
  }

  public async resumeAgent(agentId: string): Promise<{ agent?: Agent; error?: string }> {
    try {
      const response = await httpClient.post<ApiResponse<Agent>>(`/agents/${agentId}/resume`)
      console.log('Resume agent response:', response)
      if (!response) {
        console.log('No response received')
        return { error: 'Invalid API response' }
      }
      console.log('Response success:', response.success)
      if (response.success) {
        if (response.data) {
          const agent = this.transformAgent(response.data)
          agent.status = AgentStatus.RUNNING
          return { agent }
        } else {
          const agent = await this.getAgent(agentId)
          agent.status = AgentStatus.RUNNING
          return { agent }
        }
      }
      console.log('Success is false, returning error')
      return { error: '启动失败，请稍后重试' }
    } catch (err) {
      console.error('Error in resumeAgent:', err)
      return { error: '启动失败，请稍后重试' }
    }
  }

  public transformAgent(agent: any): Agent {
    if (!agent || typeof agent !== 'object') {
      throw new Error('Agent data is invalid')
    }

    const status = agent.status?.toUpperCase() as AgentStatus

    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      adapterType: agent.adapter_type || agent.adapterType,
      sandboxType: agent.sandbox_type || agent.sandboxType,
      status: status,
      sandboxId: agent.sandbox_id || agent.sandboxId,
      workspacePath: agent.workspace_path || agent.workspacePath,
      idleTimeoutSeconds: agent.idle_timeout_seconds ?? agent.idleTimeoutSeconds ?? 300,
      hasScheduledTasks: agent.has_scheduled_tasks ?? agent.hasScheduledTasks ?? false,
      defaultSessionId: agent.default_session_id || agent.defaultSessionId,
      processPort: agent.process_port || agent.processPort,
      skills: agent.skills || [],
      mcpServerList: agent.mcp_server_list || [],
      createdAt: agent.created_at || agent.createdAt,
      updatedAt: agent.updated_at || agent.updatedAt,
    }
  }

  public async enableMcpServer(agentId: string, serverId: string): Promise<any> {
    const response = await httpClient.post<any>(`/agents/${agentId}/mcp-servers/${serverId}/enable`)
    if (!response) {
      throw new Error('Invalid API response: no response received')
    }
    return response
  }

  public async disableMcpServer(agentId: string, serverId: string): Promise<any> {
    const response = await httpClient.post<any>(
      `/agents/${agentId}/mcp-servers/${serverId}/disable`
    )
    if (!response) {
      throw new Error('Invalid API response: no response received')
    }
    return response
  }
}

class AgentFactory {
  public static createAgent(config: CreateAgentRequest): Agent {
    const now = new Date().toISOString()
    return {
      id: generateUUID(),
      name: config.name,
      description: config.description,
      adapterType: config.adapterType,
      sandboxType: config.sandboxType,
      status: AgentStatus.RUNNING,
      sandboxId: config.sandboxId,
      idleTimeoutSeconds: config.idleTimeoutSeconds || 300,
      hasScheduledTasks: config.hasScheduledTasks ?? false,
      defaultSessionId: undefined,
      processPort: undefined,
      skills: [],
      createdAt: now,
      updatedAt: now,
    }
  }
}

export const agentService = new AgentService()
export { AgentFactory }
