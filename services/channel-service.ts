import { ApiError } from '@/lib/error-handler'
import { httpClient } from '@/lib/http-client'

/**
 * IM 渠道（Channel）服务：封装后端 /channels 全部端点。
 *
 * 字段的唯一出处是后端 `witty_service/api/channel_schemas.py`，语义见
 * `docs/im-channel-framework-design.md` 第 9 节与 `im-channel-feature-design.md` 6.x/9.x。
 * 三条必须由调用方一起守住的产品约束：
 * 1. **渠道标识符与手填表单字段只能来自 `GET /channels/catalog`**，前端不硬编码；
 * 2. 实例响应里只有 `credential_mask`，永远不回显凭据明文；
 * 3. 接入响应里没有平台临时凭据，只有二维码内容 `qr_content`。
 */

/** 渠道实例状态（后端 channel_instances.status 取值域）。 */
export type ChannelInstanceStatus =
  | 'pending'
  | 'connected'
  | 'degraded'
  | 'offline'
  | 'error'
  | 'disabled'

/**
 * 绑定 agent 的状态：`unbound`（从未绑定）与 `deleted`（绑定后被删除）对用户
 * 呈现同一句文案，其余为 agent 的实际状态值。
 */
export type ChannelAgentState = 'unbound' | 'deleted' | 'creating' | 'running' | 'paused' | 'error'

/** 投递确定性三态：结果不确定时**不重发**（后端不会重试，前端也不能暗示可以重试）。 */
export type ChannelDeliveryCertainty = 'delivered' | 'rejected' | 'uncertain'

/** 接入尝试状态。 */
export type ChannelProvisionStatus = 'waiting' | 'succeeded' | 'expired' | 'failed' | 'cancelled'

export type ConversationType = 'direct' | 'group'

export type AccessPolicyMode = 'open' | 'allowlist'

export interface ChannelCapabilities {
  can_edit_message: boolean
  max_text_length: number
  max_reply_segments: number | null
}

/** 手填凭据表单的字段描述：由服务端适配器声明驱动。 */
export interface ChannelCredentialField {
  name: string
  label: string
  secret: boolean
  required: boolean
}

export interface ChannelCatalogItem {
  channel: string
  display_name: string
  adapter_version: string
  /** 是否支持扫码接入；false 时只能走手填凭据。 */
  supports_provisioning: boolean
  credential_fields: ChannelCredentialField[]
  config_fields: string[]
  capabilities: ChannelCapabilities
}

export interface ChannelInstance {
  id: string
  channel: string
  display_name: string | null
  owner_ref: string | null
  agent_id: string | null
  agent_name: string | null
  agent_state: ChannelAgentState | string
  status: ChannelInstanceStatus | string
  /** 凭据掩码（首 4 末 4），**唯一**允许展示的凭据形式。 */
  credential_mask: string | null
  config: Record<string, unknown>
  generation: number
  connected: boolean
  created_at: string
  updated_at: string
}

export interface ProvisionAttempt {
  attempt_id: string
  channel: string
  status: ChannelProvisionStatus | string
  /** 需要编码成二维码的字符串；不含任何平台临时凭据。 */
  qr_content: string | null
  expires_at: string
  poll_interval_ms: number
  error_code: string | null
  /** 接入成功时返回新建的渠道实例。 */
  instance: ChannelInstance | null
}

export interface BeginProvisionRequest {
  channel: string
  owner_ref?: string | null
  agent_id?: string | null
}

export interface CreateChannelInstanceRequest {
  channel: string
  credentials: Record<string, string>
  owner_ref?: string | null
  agent_id?: string | null
  display_name?: string | null
}

export interface UpdateChannelInstanceRequest {
  /** 传 null 表示解绑（后端按"字段是否出现"区分未提供与置空）。 */
  agent_id?: string | null
  display_name?: string | null
}

export interface ChannelDeliveryTestRequest {
  platform_user_id: string
  conversation_type?: ConversationType
}

export interface ChannelDeliveryTestResult {
  certainty: ChannelDeliveryCertainty | string
  error_code: string | null
  platform_message_ref: string | null
}

export interface AccessPolicyEntry {
  mode: AccessPolicyMode | string
  allowlist: string[]
  allow_commands: boolean
}

export interface ChannelAccessPolicy {
  direct: AccessPolicyEntry
  group: AccessPolicyEntry
}

/** 部分更新：只提交要改的会话类型（后端按 model_fields_set 判定）。 */
export interface UpdateChannelAccessPolicyRequest {
  direct?: AccessPolicyEntry
  group?: AccessPolicyEntry
}

/** 接入尝试的终态：到达后必须停止轮询。 */
const TERMINAL_PROVISION_STATUSES: readonly string[] = [
  'succeeded',
  'expired',
  'failed',
  'cancelled',
]

export function isTerminalProvisionStatus(status: string): boolean {
  return TERMINAL_PROVISION_STATUSES.includes(status)
}

/** 后端二维码有效期已过（本地判断，避免多轮一次注定失败的轮询）。 */
export function isProvisionExpired(expiresAt: string, now: number = Date.now()): boolean {
  const expires = new Date(expiresAt).getTime()
  if (Number.isNaN(expires)) return false
  return expires <= now
}

/** 轮询间隔：后端按平台建议值节流，前端不得比它更快。 */
export function provisionPollDelayMs(pollIntervalMs: number): number {
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0) return 2000
  return Math.max(pollIntervalMs, 1000)
}

/**
 * 提取后端域错误码。
 * 后端错误响应体形如 `{ error: { code, message, details } }`，被 httpClient
 * 原样放进 `ApiError.details`。
 */
export function channelErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null
  const details = error.details as { error?: { code?: unknown } } | undefined
  const code = details?.error?.code
  return typeof code === 'string' ? code : null
}

class ChannelService {
  // ==========================================================================
  // 渠道目录
  // ==========================================================================

  /** 已注册渠道的目录：渠道标识符与手填表单字段的**唯一**出处。 */
  public async listCatalog(): Promise<ChannelCatalogItem[]> {
    const response = await httpClient.get<ChannelCatalogItem[]>('/channels/catalog')
    return Array.isArray(response) ? response : []
  }

  // ==========================================================================
  // 扫码接入
  // ==========================================================================

  /** 开始一次接入尝试：返回二维码内容与轮询间隔，**不含**平台临时凭据。 */
  public async beginProvisioning(request: BeginProvisionRequest): Promise<ProvisionAttempt> {
    return httpClient.post<ProvisionAttempt>('/channels/provision/begin', {
      channel: request.channel,
      owner_ref: request.owner_ref ?? null,
      agent_id: request.agent_id ?? null,
    })
  }

  /** 轮询一次接入状态（服务端在被轮询时去问平台，并按 poll_interval_ms 节流）。 */
  public async getProvisioning(attemptId: string): Promise<ProvisionAttempt> {
    return httpClient.get<ProvisionAttempt>(`/channels/provision/${encodeURIComponent(attemptId)}`)
  }

  /** 取消接入：服务端停止轮询并清理中间状态。 */
  public async cancelProvisioning(attemptId: string): Promise<ProvisionAttempt> {
    return httpClient.post<ProvisionAttempt>(
      `/channels/provision/${encodeURIComponent(attemptId)}/cancel`
    )
  }

  // ==========================================================================
  // 实例
  // ==========================================================================

  /** 手填凭据旁路：与扫码走完全相同的落库顺序与失败回滚。 */
  public async createInstance(request: CreateChannelInstanceRequest): Promise<ChannelInstance> {
    return httpClient.post<ChannelInstance>('/channels/instances', {
      channel: request.channel,
      credentials: request.credentials,
      owner_ref: request.owner_ref ?? null,
      agent_id: request.agent_id ?? null,
      display_name: request.display_name ?? null,
    })
  }

  public async listInstances(ownerRef?: string): Promise<ChannelInstance[]> {
    const params = new URLSearchParams()
    if (ownerRef) params.set('owner_ref', ownerRef)
    const query = params.toString()
    const response = await httpClient.get<ChannelInstance[]>(
      `/channels/instances${query ? `?${query}` : ''}`
    )
    return Array.isArray(response) ? response : []
  }

  public async getInstance(instanceId: string): Promise<ChannelInstance> {
    return httpClient.get<ChannelInstance>(`/channels/instances/${encodeURIComponent(instanceId)}`)
  }

  public async updateInstance(
    instanceId: string,
    request: UpdateChannelInstanceRequest
  ): Promise<ChannelInstance> {
    // 只透传显式给出的字段：agent_id: null 是"解绑"，不是"未提供"。
    const payload: Record<string, unknown> = {}
    if ('agent_id' in request) payload.agent_id = request.agent_id
    if ('display_name' in request) payload.display_name = request.display_name
    return httpClient.patch<ChannelInstance>(
      `/channels/instances/${encodeURIComponent(instanceId)}`,
      payload
    )
  }

  public async deleteInstance(instanceId: string): Promise<void> {
    await httpClient.delete(`/channels/instances/${encodeURIComponent(instanceId)}`)
  }

  /** 重连：网关未启动时后端返回 CHANNEL_GATEWAY_DISABLED。 */
  public async reconnectInstance(instanceId: string): Promise<ChannelInstance> {
    return httpClient.post<ChannelInstance>(
      `/channels/instances/${encodeURIComponent(instanceId)}/reconnect`
    )
  }

  /**
   * 连通性测试：向指定用户发一条固定文案，返回投递三态。
   * 不触发回合、不写会话历史。
   */
  public async testDelivery(
    instanceId: string,
    request: ChannelDeliveryTestRequest
  ): Promise<ChannelDeliveryTestResult> {
    return httpClient.post<ChannelDeliveryTestResult>(
      `/channels/instances/${encodeURIComponent(instanceId)}/test`,
      {
        platform_user_id: request.platform_user_id,
        conversation_type: request.conversation_type ?? 'direct',
      }
    )
  }

  // ==========================================================================
  // 准入策略
  // ==========================================================================

  /** 读取准入策略：缺失的行后端按默认值（放开）返回。 */
  public async getAccessPolicy(instanceId: string): Promise<ChannelAccessPolicy> {
    return httpClient.get<ChannelAccessPolicy>(
      `/channels/instances/${encodeURIComponent(instanceId)}/access-policy`
    )
  }

  /** 写入准入策略：**写入后立即生效**（服务端判定层每次从库读取）。 */
  public async updateAccessPolicy(
    instanceId: string,
    request: UpdateChannelAccessPolicyRequest
  ): Promise<ChannelAccessPolicy> {
    return httpClient.put<ChannelAccessPolicy>(
      `/channels/instances/${encodeURIComponent(instanceId)}/access-policy`,
      request
    )
  }
}

export const channelService = new ChannelService()
