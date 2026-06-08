import { httpClient } from '@/lib/http-client'
import { McpServerResponse, CreateMcpServerRequest, UpdateMcpServerRequest } from '@/lib/types'

class McpServerService {
  public async getServers(): Promise<McpServerResponse[]> {
    const response = await httpClient.get<McpServerResponse[]>('/mcp-servers')
    if (!response) {
      throw new Error('Invalid API response: no response received')
    }
    const serversData = Array.isArray(response) ? response : []
    return serversData
  }

  public async getServer(serverId: string): Promise<McpServerResponse> {
    const response = await httpClient.get<McpServerResponse>(`/mcp-servers/${serverId}`)
    if (!response) {
      throw new Error('Invalid API response: no response received')
    }
    return response
  }

  public async createServer(request: CreateMcpServerRequest): Promise<McpServerResponse> {
    const response = await httpClient.post<McpServerResponse>('/mcp-servers', request)
    if (!response) {
      throw new Error('Invalid API response: no response received')
    }
    return response
  }

  public async updateServer(
    serverId: string,
    request: UpdateMcpServerRequest
  ): Promise<McpServerResponse> {
    const backendRequest: Record<string, any> = {}

    if (request.mcp_server_name !== undefined) {
      backendRequest.mcp_server_name = request.mcp_server_name
    }
    if (request.mcp_server_config !== undefined) {
      backendRequest.mcp_server_config = request.mcp_server_config
    }

    const response = await httpClient.put<McpServerResponse>(
      `/mcp-servers/${serverId}`,
      backendRequest
    )
    if (!response) {
      throw new Error('Invalid API response: no response received')
    }
    return response
  }

  public async deleteServer(serverId: string): Promise<void> {
    await httpClient.delete(`/mcp-servers/${serverId}`)
  }
}

export const mcpServerService = new McpServerService()
