import { httpClient } from '@/lib/http-client'
import { ApiError } from '@/lib/error-handler'
import { MessageStatus } from '@/lib/types'

export type ScheduleType = 'cron' | 'interval'

export type ScheduledTaskRunStatus = 'running' | 'succeeded' | 'failed' | 'skipped'

/** 拉取任务列表时每个任务附带的最大 recent_runs 数量，侧栏与任务页共用。 */
export const SCHEDULED_RUNS_PER_TASK = 10

/** 将执行状态映射为会话消息状态，侧栏与执行记录共用单一映射源。 */
export function runStatusToMessageStatus(status: ScheduledTaskRunStatus): MessageStatus {
  switch (status) {
    case 'running':
      return MessageStatus.GENERATING
    case 'succeeded':
      return MessageStatus.COMPLETED
    case 'failed':
      return MessageStatus.ERROR
    case 'skipped':
      return MessageStatus.INTERRUPTED
    default:
      return MessageStatus.COMPLETED
  }
}

export interface ScheduledTask {
  id: string
  name: string
  schedule_type: ScheduleType
  cron_expr: string | null
  interval_seconds: number | null
  timezone: string
  content: string
  agent_id: string
  workspace_folder: string | null
  enabled: boolean
  created_at: string
  updated_at: string
  /** 列表接口传入 include_runs=N 时返回每个任务最近 N 条执行记录；否则为空列表。 */
  recent_runs: ScheduledTaskRun[]
}

export interface ScheduledTaskRun {
  id: string
  task_id: string
  session_id: string | null
  status: ScheduledTaskRunStatus
  error: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

/** 跨任务聚合分页返回的执行记录：附带所属任务信息，供执行记录页直接展示。 */
export interface ScheduledTaskRunWithTask extends ScheduledTaskRun {
  task_name: string
  agent_id: string
}

export interface ScheduledTaskRunsPage {
  items: ScheduledTaskRunWithTask[]
  total: number
  limit: number
  offset: number
}

export interface CreateScheduledTaskRequest {
  name: string
  schedule_type: ScheduleType
  cron_expr?: string | null
  interval_seconds?: number | null
  timezone?: string
  content: string
  agent_id: string
  workspace_folder?: string | null
  enabled?: boolean
}

export interface UpdateScheduledTaskRequest {
  name?: string
  schedule_type?: ScheduleType
  cron_expr?: string | null
  interval_seconds?: number | null
  timezone?: string
  content?: string
  workspace_folder?: string | null
}

class ScheduledTaskService {
  public async listTasks(agentId?: string, includeRuns?: number): Promise<ScheduledTask[]> {
    const params = new URLSearchParams()
    if (agentId) params.set('agent_id', agentId)
    if (includeRuns !== undefined) {
      params.set('include_runs', String(includeRuns))
    }
    const query = params.toString()
    const response = await httpClient.get<ScheduledTask[]>(
      `/scheduled-tasks${query ? `?${query}` : ''}`
    )
    return Array.isArray(response) ? response : []
  }

  public async getTask(taskId: string): Promise<ScheduledTask> {
    return httpClient.get<ScheduledTask>(`/scheduled-tasks/${encodeURIComponent(taskId)}`)
  }

  public async createTask(request: CreateScheduledTaskRequest): Promise<ScheduledTask> {
    return httpClient.post<ScheduledTask>('/scheduled-tasks', request)
  }

  public async updateTask(
    taskId: string,
    request: UpdateScheduledTaskRequest
  ): Promise<ScheduledTask> {
    return httpClient.patch<ScheduledTask>(
      `/scheduled-tasks/${encodeURIComponent(taskId)}`,
      request
    )
  }

  public async deleteTask(taskId: string): Promise<void> {
    await httpClient.delete(`/scheduled-tasks/${encodeURIComponent(taskId)}`)
  }

  public async enableTask(taskId: string): Promise<ScheduledTask> {
    return httpClient.post<ScheduledTask>(`/scheduled-tasks/${encodeURIComponent(taskId)}/enable`)
  }

  public async disableTask(taskId: string): Promise<ScheduledTask> {
    return httpClient.post<ScheduledTask>(`/scheduled-tasks/${encodeURIComponent(taskId)}/disable`)
  }

  public async runTask(taskId: string, sessionId?: string): Promise<ScheduledTaskRun> {
    return httpClient.post<ScheduledTaskRun>(
      `/scheduled-tasks/${encodeURIComponent(taskId)}/run`,
      sessionId ? { session_id: sessionId } : undefined
    )
  }

  public async listTaskRuns(taskId: string, limit = 100): Promise<ScheduledTaskRun[]> {
    const response = await httpClient.get<ScheduledTaskRun[]>(
      `/scheduled-tasks/${encodeURIComponent(taskId)}/runs?limit=${limit}`
    )
    return Array.isArray(response) ? response : []
  }

  /**
   * 跨任务聚合分页查询全部执行记录（含 task_name/agent_id），
   * 避免执行记录页按任务逐个请求造成 N+1。
   */
  public async listRunsPage(
    params: { limit?: number; offset?: number; agentId?: string } = {}
  ): Promise<ScheduledTaskRunsPage> {
    const search = new URLSearchParams()
    if (params.limit !== undefined) search.set('limit', String(params.limit))
    if (params.offset !== undefined) search.set('offset', String(params.offset))
    if (params.agentId) search.set('agent_id', params.agentId)
    const query = search.toString()
    const response = await httpClient.get<ScheduledTaskRunsPage>(
      `/scheduled-tasks/runs${query ? `?${query}` : ''}`
    )
    return {
      items: Array.isArray(response?.items) ? response.items : [],
      total: typeof response?.total === 'number' ? response.total : 0,
      limit: typeof response?.limit === 'number' ? response.limit : (params.limit ?? 20),
      offset: typeof response?.offset === 'number' ? response.offset : (params.offset ?? 0),
    }
  }

  /**
   * 按 runId 精确查询单条执行记录。
   * 后端返回 404/TASK_RUN_NOT_FOUND（run 不存在或不属于该任务）时返回 null。
   */
  public async getTaskRun(taskId: string, runId: string): Promise<ScheduledTaskRun | null> {
    try {
      return await httpClient.get<ScheduledTaskRun>(
        `/scheduled-tasks/${encodeURIComponent(taskId)}/runs/${encodeURIComponent(runId)}`
      )
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.statusCode === 404 ||
          (error.details as { code?: string })?.code === 'TASK_RUN_NOT_FOUND')
      ) {
        return null
      }
      throw error
    }
  }
}

export const scheduledTaskService = new ScheduledTaskService()
