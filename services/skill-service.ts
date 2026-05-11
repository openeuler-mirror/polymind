import { httpClient } from '@/lib/http-client'
import {
  CreateSkillRepositoryRequest,
  SkillRepository,
  SkillRepositoryDiscoveryStatus,
  SkillRepositoryResponse,
  SkillDiscoveryItem,
  SkillDiscoverySourceRepository,
  UpdateSkillRepositoryRequest,
} from '@/lib/types'

// API schemas
interface SkillDiscoverySourceRepositorySchema {
  repo_id?: string
  name?: string
  source_type?: string
  branch?: string | null
  url?: string | null
  local_path?: string | null
}

interface SkillDiscoveryItemSchema {
  skill_id?: string
  skill_name?: string
  relative_path?: string | null
  metadata?: Record<string, unknown> | null
  source_repo?: SkillDiscoverySourceRepositorySchema
  skill_md_url?: string | null
}

interface SkillRepositorySchema {
  repo_id?: string
  repo_name?: string
  source_type?: string
  branch?: string | null
  url?: string | null
  local_path?: string | null
  skill_discover_status?: string
  skill_num?: number
  discovered_skills?: SkillDiscoveryItemSchema[]
  created_at?: string
  updated_at?: string
}

function toSkillDiscoverySourceRepository(
  item: SkillDiscoverySourceRepositorySchema,
): SkillDiscoverySourceRepository {
  return {
    repoId: item.repo_id || '',
    name: item.name,
    sourceType: item.source_type,
    branch: item.branch ?? null,
    url: item.url ?? null,
    localPath: item.local_path ?? null,
  }
}

function toSkillDiscoveryItem(item: SkillDiscoveryItemSchema): SkillDiscoveryItem {
  return {
    skillId: item.skill_id || '',
    skillName: item.skill_name || '',
    relativePath: item.relative_path ?? undefined,
    metadata: item.metadata ?? null,
    sourceRepo: item.source_repo ? toSkillDiscoverySourceRepository(item.source_repo) : undefined,
    skillMdUrl: item.skill_md_url ?? null,
  }
}

function extractDiscoveredSkills(
  response: SkillRepositorySchema | SkillRepositorySchema[],
): SkillDiscoveryItem[] {
  const repositories = Array.isArray(response) ? response : [response]
  return repositories.flatMap((repository) =>
    Array.isArray(repository.discovered_skills)
      ? repository.discovered_skills.map((item) => toSkillDiscoveryItem(item))
      : [],
  )
}

function toSkillRepository(repository: SkillRepositorySchema): SkillRepository {
  return {
    repoId: repository.repo_id || '',
    name: repository.repo_name,
    sourceType: repository.source_type || 'git',
    branch: repository.branch ?? undefined,
    url: repository.url ?? undefined,
    localPath: repository.local_path ?? undefined,
  }
}

function toSkillRepositoryResponse(repository: SkillRepositorySchema): SkillRepositoryResponse {
  return {
    ...toSkillRepository(repository),
    skillDiscoverStatus: repository.skill_discover_status || 'unknown',
    skillNum: typeof repository.skill_num === 'number' ? repository.skill_num : 0,
    discoveredSkills: extractDiscoveredSkills(repository),
    createdAt: repository.created_at,
    updatedAt: repository.updated_at,
  }
}

function toSkillRepositoryDiscoveryStatus(
  repository: SkillRepositoryResponse,
): SkillRepositoryDiscoveryStatus {
  return {
    repoId: repository.repoId,
    repoName: repository.name || '',
    discoverStatus: repository.skillDiscoverStatus,
    skillNum: repository.skillNum,
  }
}

class SkillService {
  public async listRepositoryResponses(): Promise<SkillRepositoryResponse[]> {
    const response = await this.fetchRepositorySchemas()
    return response.map((item) => toSkillRepositoryResponse(item))
  }

  public async createRepo(request: CreateSkillRepositoryRequest): Promise<SkillRepository> {
    const payload = this.toCreatePayload(request)
    const response = await httpClient.post<SkillRepositorySchema>('/api/v1/skills/repos', payload)
    return toSkillRepository(response)
  }

  public async updateRepo(
    repoId: string,
    request: UpdateSkillRepositoryRequest,
    fallbackRepo?: Partial<SkillRepository>,
  ): Promise<SkillRepository> {
    const payload = this.toUpdatePayload(request)
    const response = await httpClient.patch<SkillRepositorySchema>(
      `/api/v1/skills/repos/${repoId}`,
      payload,
    )

    return toSkillRepository({
      repo_id: repoId,
      repo_name: fallbackRepo?.name,
      source_type: fallbackRepo?.sourceType,
      url: fallbackRepo?.url,
      branch: fallbackRepo?.branch,
      local_path: fallbackRepo?.localPath,
      ...response,
    })
  }

  public async deleteRepo(repoId: string): Promise<void> {
    await httpClient.delete(`/api/v1/skills/repos/${repoId}`)
  }

  public async discoverRepoSkills(repoId: string): Promise<SkillDiscoveryItem[]> {
    const response = await httpClient.post<SkillRepositorySchema>(
      `/api/v1/skills/discover/${repoId}`,
      {},
    )
    return extractDiscoveredSkills(response)
  }

  public getDiscoveredSkillsFromRepositories(
    repositories: SkillRepositoryResponse[],
  ): SkillDiscoveryItem[] {
    return repositories.flatMap((repository) => repository.discoveredSkills)
  }

  public getDiscoverStatusesFromRepositories(
    repositories: SkillRepositoryResponse[],
  ): SkillRepositoryDiscoveryStatus[] {
    return repositories.map((repository) => toSkillRepositoryDiscoveryStatus(repository))
  }

  private async fetchRepositorySchemas(): Promise<SkillRepositorySchema[]> {
    const response = await httpClient.get<SkillRepositorySchema[]>('/api/v1/skills/repos')
    return Array.isArray(response) ? response : []
  }

  private toCreatePayload(request: CreateSkillRepositoryRequest) {
    if (request.sourceType === 'git') {
      return {
        source_type: 'git',
        url: request.url,
        ...(request.branch ? { branch: request.branch } : {}),
      }
    }

    return {
      source_type: 'local_import',
      local_path: request.localPath,
    }
  }

  private toUpdatePayload(request: UpdateSkillRepositoryRequest) {
    return {
      ...(request.branch !== undefined ? { branch: request.branch } : {}),
      ...(request.localPath !== undefined ? { local_path: request.localPath } : {}),
    }
  }
}

export const skillService = new SkillService()
