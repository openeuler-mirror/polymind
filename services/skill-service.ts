import { httpClient } from '@/lib/http-client'
import {
  CreateSkillRepositoryRequest,
  SkillRepository,
  SkillRepositoryDiscoveryStatus,
  SkillRepositoryResponse,
  SkillDiscoveryItem,
  UpdateSkillRepositoryRequest,
} from '@/lib/types'

function toSkillRepositoryDiscoveryStatus(
  repository: SkillRepositoryResponse,
): SkillRepositoryDiscoveryStatus {
  return {
    repo_id: repository.repo_id,
    repo_name: repository.repo_name || '',
    discover_status: repository.skill_discover_status,
    skill_num: repository.skill_num,
  }
}

class SkillService {
  public async listRepositoryResponses(): Promise<SkillRepositoryResponse[]> {
    const response = await this.fetchRepositorySchemas()
    return Array.isArray(response) ? response : []
  }

  public async createRepo(request: CreateSkillRepositoryRequest): Promise<SkillRepository> {
    return httpClient.post<SkillRepository>('/api/v1/skills/repos', request)
  }

  public async updateRepo(
    repoId: string,
    request: UpdateSkillRepositoryRequest,
    fallbackRepo?: Partial<SkillRepository>,
  ): Promise<SkillRepository> {
    const response = await httpClient.patch<SkillRepository>(
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

  public async discoverRepoSkills(repoId: string): Promise<SkillDiscoveryItem[]> {
    const response = await httpClient.post<SkillRepositoryResponse>(
      `/api/v1/skills/discover/${repoId}`,
      {},
    )
    return Array.isArray(response.discovered_skills) ? response.discovered_skills : []
  }

  public getDiscoveredSkillsFromRepositories(
    repositories: SkillRepositoryResponse[],
  ): SkillDiscoveryItem[] {
    return repositories.flatMap((repository) =>
      Array.isArray(repository.discovered_skills) ? repository.discovered_skills : [],
    )
  }

  public getDiscoverStatusesFromRepositories(
    repositories: SkillRepositoryResponse[],
  ): SkillRepositoryDiscoveryStatus[] {
    return repositories.map((repository) => toSkillRepositoryDiscoveryStatus(repository))
  }

  private async fetchRepositorySchemas(): Promise<SkillRepositoryResponse[]> {
    return httpClient.get<SkillRepositoryResponse[]>('/api/v1/skills/repos')
  }

  private getAgentSkillApiBasePath(agentId: string) {
    return `/api/v1/agents/${encodeURIComponent(agentId)}/skills`
  }
}

export const skillService = new SkillService()
