import { httpClient } from '@/lib/http-client'
import {
  AgentSkillResponse,
  InstallAgentSkillRequest,
  InstallAgentSkillResponse,
  UninstallAgentSkillRequest,
  SkillRepositoryRequest,
  SkillRepositoryResponse,
  SkillResponse,
} from '@/lib/types'

class SkillService {
  public async listRepositoryResponses(): Promise<SkillRepositoryResponse[]> {
    const response = await this.fetchRepositorySchemas()
    return Array.isArray(response) ? response : []
  }

  public async createRepo(request: SkillRepositoryRequest): Promise<SkillRepositoryResponse> {
    return httpClient.post<SkillRepositoryResponse>('/api/v1/skills/repos', request)
  }

  public async updateRepo(
    repoId: string,
    request: SkillRepositoryRequest,
    fallbackRepo?: Partial<SkillRepositoryResponse>,
  ): Promise<SkillRepositoryResponse> {
    const response = await httpClient.patch<SkillRepositoryResponse>(
      `/api/v1/skills/repos/${repoId}`,
      request,
    )

    return {
      ...response,
      repo_id: response.repo_id ?? repoId,
      repo_name: response.repo_name ?? fallbackRepo?.repo_name,
      source_type: response.source_type ?? fallbackRepo?.source_type ?? 'git',
      url: response.url ?? fallbackRepo?.url ?? null,
      branch: response.branch ?? fallbackRepo?.branch ?? null,
      local_path: response.local_path ?? fallbackRepo?.local_path ?? null,
    }
  }

  public async deleteRepo(repoId: string): Promise<void> {
    await httpClient.delete(`/api/v1/skills/repos/${repoId}`)
  }

  public async discoverRepoSkills(repoId: string): Promise<void> {
    await httpClient.post(`/api/v1/skills/discover/${repoId}`, {})
  }

  public async listAllSkills(): Promise<SkillResponse[]> {
    const response = await httpClient.get<SkillResponse[]>('/api/v1/skills/skills')
    return Array.isArray(response) ? response : []
  }

  private async fetchRepositorySchemas(): Promise<SkillRepositoryResponse[]> {
    return httpClient.get<SkillRepositoryResponse[]>('/api/v1/skills/repos')
  }

  public async installSkill(
    agentId: string,
    request: InstallAgentSkillRequest,
  ): Promise<InstallAgentSkillResponse> {
    return httpClient.post<InstallAgentSkillResponse>(
      `${this.getAgentSkillApiBasePath(agentId)}/`,
      request,
    )
  }

  public async listInstalledSkills(agentId: string): Promise<AgentSkillResponse[]> {
    const response = await httpClient.get<AgentSkillResponse[]>(
      `${this.getAgentSkillApiBasePath(agentId)}/installed`,
    )
    return Array.isArray(response) ? response : []
  }

  public async syncInstalledSkills(agentId: string): Promise<AgentSkillResponse[]> {
    const response = await httpClient.post<AgentSkillResponse[]>(
      `${this.getAgentSkillApiBasePath(agentId)}/installed/sync`,
      {},
    )
    return Array.isArray(response) ? response : []
  }

  public async uninstallSkill(
    agentId: string,
    request: UninstallAgentSkillRequest,
  ): Promise<AgentSkillResponse> {
    return httpClient.post<AgentSkillResponse>(
      `${this.getAgentSkillApiBasePath(agentId)}/uninstall`,
      request,
    )
  }

  private getAgentSkillApiBasePath(agentId: string) {
    return `/api/v1/agents/${encodeURIComponent(agentId)}/skills`
  }
}

export const skillService = new SkillService()
