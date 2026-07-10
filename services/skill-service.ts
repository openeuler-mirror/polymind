import { httpClient } from '@/lib/http-client'
import { appConfig } from '@/app/config/index'
import {
  AgentSkillResponse,
  InstallAgentSkillRequest,
  InstallAgentSkillResponse,
  SkillRepositoryRequest,
  SkillRepositoryResponse,
  SkillResponse,
  WittyHubSearchResponse,
  UninstallAgentSkillRequest,
  WittyHubSkillListResponse,
  WittyHubSkillResponse,
  WittyHubStatsResponse,
} from '@/lib/types'

export const WITTYHUB_REPO_ID = '__wittyhub__'

class SkillService {
  public async listRepositoryResponses(): Promise<SkillRepositoryResponse[]> {
    const response = await this.fetchRepositorySchemas()
    return Array.isArray(response) ? response : []
  }

  public async createRepo(request: SkillRepositoryRequest): Promise<SkillRepositoryResponse> {
    return httpClient.post<SkillRepositoryResponse>('/skills/repos', request)
  }

  public async uploadRepoArchive(file: File): Promise<SkillRepositoryResponse> {
    const formData = new FormData()
    formData.append('file', file)
    return httpClient.post<SkillRepositoryResponse>('/skills/repos/upload', formData)
  }

  public async updateRepo(
    repoId: string,
    request: SkillRepositoryRequest,
    fallbackRepo?: Partial<SkillRepositoryResponse>
  ): Promise<SkillRepositoryResponse> {
    const response = await httpClient.patch<SkillRepositoryResponse>(
      `/skills/repos/${repoId}`,
      request
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
    await httpClient.delete(`/skills/repos/${repoId}`)
  }

  public async discoverRepoSkills(repoId: string): Promise<void> {
    await httpClient.post(`/skills/discover/${repoId}`, {})
  }

  public async listAllSkills(): Promise<SkillResponse[]> {
    const response = await httpClient.get<SkillResponse[]>('/skills/skills')
    return Array.isArray(response) ? response : []
  }

  public async listWittyHubSkillsPage(
    skip: number,
    limit: number
  ): Promise<{ skills: SkillResponse[]; total: number; skip: number; limit: number }> {
    const baseUrl = appConfig.marketplace.wittyhubApiUrl.replace(/\/+$/, '')
    const payload = await this.fetchWittyHubSkillPage(baseUrl, skip, limit)
    const skills = Array.isArray(payload.skills) ? payload.skills : []

    return {
      skills: skills.map(skill => this.adaptWittyHubSkill(skill)),
      total: payload.total,
      skip: payload.skip,
      limit: payload.limit,
    }
  }

  public async searchWittyHubSkillsPage(
    query: string,
    skip: number,
    limit: number
  ): Promise<{ skills: SkillResponse[]; total: number; skip: number; limit: number }> {
    const baseUrl = appConfig.marketplace.wittyhubApiUrl.replace(/\/+$/, '')
    const payload = await this.fetchWittyHubSearchPage(baseUrl, query, skip, limit)
    const skills = Array.isArray(payload.results) ? payload.results : []

    return {
      skills: skills.map(skill => this.adaptWittyHubSkill(skill)),
      total: payload.total,
      skip: payload.skip,
      limit: payload.limit,
    }
  }

  public async getWittyHubStats(): Promise<WittyHubStatsResponse> {
    const baseUrl = appConfig.marketplace.wittyhubApiUrl.replace(/\/+$/, '')
    const response = await fetch(`${baseUrl}/api/v1/index/stats`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to load wittyhub stats: ${response.status} ${response.statusText}`)
    }

    return (await response.json()) as WittyHubStatsResponse
  }

  private async fetchRepositorySchemas(): Promise<SkillRepositoryResponse[]> {
    return httpClient.get<SkillRepositoryResponse[]>('/skills/repos')
  }

  public async installSkill(
    agentId: string,
    request: InstallAgentSkillRequest
  ): Promise<InstallAgentSkillResponse> {
    return httpClient.post<InstallAgentSkillResponse>(
      `${this.getAgentSkillApiBasePath(agentId)}/`,
      request
    )
  }

  public async listInstalledSkills(agentId: string): Promise<AgentSkillResponse[]> {
    const response = await httpClient.get<AgentSkillResponse[]>(
      `${this.getAgentSkillApiBasePath(agentId)}/installed`
    )
    return Array.isArray(response) ? response : []
  }

  public async syncInstalledSkills(agentId: string): Promise<AgentSkillResponse[]> {
    const response = await httpClient.post<AgentSkillResponse[]>(
      `${this.getAgentSkillApiBasePath(agentId)}/installed/sync`,
      {}
    )
    return Array.isArray(response) ? response : []
  }

  public async uninstallSkill(
    agentId: string,
    request: UninstallAgentSkillRequest
  ): Promise<AgentSkillResponse> {
    return httpClient.post<AgentSkillResponse>(
      `${this.getAgentSkillApiBasePath(agentId)}/uninstall`,
      request
    )
  }

  private getAgentSkillApiBasePath(agentId: string) {
    return `/agents/${encodeURIComponent(agentId)}/skills`
  }

  private async fetchWittyHubSkillPage(
    baseUrl: string,
    skip: number,
    limit: number
  ): Promise<WittyHubSkillListResponse> {
    const response = await fetch(`${baseUrl}/api/v1/skills/?skip=${skip}&limit=${limit}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to load wittyhub skills: ${response.status} ${response.statusText}`)
    }

    return (await response.json()) as WittyHubSkillListResponse
  }

  private async fetchWittyHubSearchPage(
    baseUrl: string,
    query: string,
    skip: number,
    limit: number
  ): Promise<WittyHubSearchResponse> {
    const params = new URLSearchParams({
      q: query,
      skip: String(skip),
      limit: String(limit),
    })
    const response = await fetch(`${baseUrl}/api/v1/index/search?${params.toString()}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to search wittyhub skills: ${response.status} ${response.statusText}`)
    }

    return (await response.json()) as WittyHubSearchResponse
  }

  private adaptWittyHubSkill(skill: WittyHubSkillResponse): SkillResponse {
    return {
      skill_id: skill.skill_id,
      repo_id: WITTYHUB_REPO_ID,
      skill_name: skill.name || skill.skill_id,
      relative_path: skill.skill_id,
      metadata: {
        description: skill.description,
        author: skill.author,
        category: skill.category,
        version: skill.version,
        source: skill.source,
        source_url: skill.source_url,
        security_score: skill.security_score,
        download_count: skill.download_count,
        rating: skill.rating,
        wittyhub_id: skill.id,
        last_indexed_at: skill.last_indexed_at,
        ...(skill.metadata ?? {}),
      },
      skill_source: skill.source_url,
      skill_md_url: skill.source_url,
    }
  }
}

export const skillService = new SkillService()
