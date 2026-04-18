import { httpClient } from '@/lib/http-client'
import {
  CreateSkillRepoRequest,
  SkillRepo,
  UpdateSkillRepoRequest,
} from '@/lib/types'

type SkillRepoApiPayload = {
  repo_id?: string
  name?: string
  source_type?: string
  branch?: string
  url?: string
  local_path?: string
}

/**
 * Skills repo服务类 - 负责 repo 源管理相关接口
 */
class SkillRepoService {
  /**
   * 获取 repo 源列表
   */
  public async listRepos(): Promise<SkillRepo[]> {
    const response = await httpClient.get<{ items?: SkillRepoApiPayload[] }>(
      '/api/v1/skills/repos',
    )
    const items = Array.isArray(response?.items) ? response.items : []
    return items.map((item) => this.transformRepo(item))
  }

  /**
   * 创建 repo 源
   */
  public async createRepo(request: CreateSkillRepoRequest): Promise<SkillRepo> {
    const payload = this.transformCreateRequest(request)
    const response = await httpClient.post<SkillRepoApiPayload | { item?: SkillRepoApiPayload }>(
      '/api/v1/skills/repos',
      payload,
    )
    const repo = this.extractRepoPayload(response)

    return this.transformRepo({
      ...payload,
      ...repo,
      repo_id: repo?.repo_id,
      source_type: repo?.source_type || payload.source_type,
    })
  }

  /**
   * 更新 repo 源
   */
  public async updateRepo(
    repoId: string,
    request: UpdateSkillRepoRequest,
    fallbackRepo?: Partial<SkillRepo>,
  ): Promise<SkillRepo> {
    const payload = this.transformUpdateRequest(request)
    const response = await httpClient.patch<SkillRepoApiPayload | { item?: SkillRepoApiPayload }>(
      `/api/v1/skills/repos/${repoId}`,
      payload,
    )
    const repo = this.extractRepoPayload(response)

    return this.transformRepo({
      repo_id: repoId,
      source_type: fallbackRepo?.sourceType,
      url: fallbackRepo?.url,
      branch: fallbackRepo?.branch,
      local_path: fallbackRepo?.localPath,
      name: fallbackRepo?.name,
      ...payload,
      ...repo,
    })
  }

  /**
   * 删除 repo 源
   */
  public async deleteRepo(repoId: string): Promise<void> {
    await httpClient.delete(`/api/v1/skills/repos/${repoId}`)
  }

  private transformCreateRequest(request: CreateSkillRepoRequest) {
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

  private transformUpdateRequest(request: UpdateSkillRepoRequest) {
    return {
      ...(request.branch !== undefined ? { branch: request.branch } : {}),
      ...(request.localPath !== undefined ? { local_path: request.localPath } : {}),
    }
  }

  private extractRepoPayload(
    response: SkillRepoApiPayload | { item?: SkillRepoApiPayload },
  ): SkillRepoApiPayload {
    if ('item' in response) {
      return response.item || {}
    }
    return response as SkillRepoApiPayload
  }

  private transformRepo(repo: SkillRepoApiPayload): SkillRepo {
    return {
      repoId: repo.repo_id || '',
      name: repo.name,
      sourceType: repo.source_type || 'git',
      branch: repo.branch,
      url: repo.url,
      localPath: repo.local_path,
    }
  }
}

export const skillRepoService = new SkillRepoService()
