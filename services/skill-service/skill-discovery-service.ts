import { DiscoverStatusItem, DiscoveredSkill, DiscoveredSkillSourceRepo } from '@/lib/types'
import { httpClient } from '@/lib/http-client'

type DiscoverSourceRepoPayload = {
  repo_id?: string
  name?: string
  source_type?: string
  branch?: string | null
  url?: string | null
  local_path?: string | null
}

type DiscoverSkillPayload = {
  skill_id: string
  skill_name: string
  relative_path?: string
  metadata?: Record<string, unknown> | null
  source_repo?: DiscoverSourceRepoPayload
  skill_md_url?: string | null
}

type DiscoverStatusPayload = {
  repo_id?: string
  repo_name?: string
  discover_status?: string
  skill_num?: number
}

class SkillDiscoveryService {
  public async listDiscoveredSkills(repoId?: string): Promise<DiscoveredSkill[]> {
    const path = repoId
      ? `/api/v1/skills/repos/discover/${repoId}`
      : '/api/v1/skills/repos/discover'
    const response = await httpClient.get<{ items?: DiscoverSkillPayload[] }>(path)
    return Array.isArray(response?.items)
      ? response.items.map((item) => this.transformDiscoveredSkill(item))
      : []
  }

  public async discoverAllSkills(): Promise<DiscoveredSkill[]> {
    const response = await httpClient.post<{ items?: DiscoverSkillPayload[] }>(
      '/api/v1/skills/repos/discover',
      {},
    )
    return Array.isArray(response?.items)
      ? response.items.map((item) => this.transformDiscoveredSkill(item))
      : []
  }

  public async discoverRepoSkills(repoId: string): Promise<DiscoveredSkill[]> {
    const response = await httpClient.post<{ items?: DiscoverSkillPayload[] }>(
      `/api/v1/skills/repos/discover/${repoId}`,
      {},
    )
    return Array.isArray(response?.items)
      ? response.items.map((item) => this.transformDiscoveredSkill(item))
      : []
  }

  public async getDiscoverStatus(): Promise<DiscoverStatusItem[]> {
    const response = await httpClient.get<{ items?: DiscoverStatusPayload[] }>(
      '/api/v1/skills/repos/discover-status',
    )
    return Array.isArray(response?.items)
      ? response.items.map((item) => this.transformDiscoverStatus(item))
      : []
  }

  private transformDiscoveredSkill(item: DiscoverSkillPayload): DiscoveredSkill {
    return {
      skillId: item.skill_id,
      skillName: item.skill_name,
      RelativePath: item.relative_path,
      metadata: item.metadata ?? null,
      sourceRepo: item.source_repo ? this.transformSourceRepo(item.source_repo) : undefined,
      skillMdUrl: item.skill_md_url ?? null,
    }
  }

  private transformSourceRepo(item: DiscoverSourceRepoPayload): DiscoveredSkillSourceRepo {
    return {
      repoId: item.repo_id || '',
      name: item.name,
      sourceType: item.source_type,
      branch: item.branch ?? null,
      url: item.url ?? null,
      localPath: item.local_path ?? null,
    }
  }

  private transformDiscoverStatus(item: DiscoverStatusPayload): DiscoverStatusItem {
    return {
      repoId: item.repo_id || '',
      repoName: item.repo_name || '',
      discoverStatus: item.discover_status || 'unknown',
      skillNum: typeof item.skill_num === 'number' ? item.skill_num : undefined,
    }
  }
}

export const skillDiscoveryService = new SkillDiscoveryService()
