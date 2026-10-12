import type { StreamErrorPayload } from '@/lib/types'

/**
 * 后端 StreamErrorCode 全集（witty_agent_server/runtimes/stream_errors.py）。
 * i18n 文案按该词表 keyed；表外的未知码一律走 default 兜底。
 */
const STREAM_ERROR_CODES = new Set([
  'UPSTREAM_AUTH',
  'UPSTREAM_RATE_LIMIT',
  'UPSTREAM_QUOTA_EXCEEDED',
  'UPSTREAM_REQUEST',
  'UPSTREAM_SERVER',
  'UPSTREAM_TIMEOUT',
  'TRANSPORT_CLOSED',
  'TRANSPORT_ERROR',
  'RUNTIME_PROTOCOL_ERROR',
  'RUNTIME_LIFECYCLE_ERROR',
  'INTERNAL_ERROR',
])

/** code → i18n 文案 key；未知/缺失码归 'default'（同后端 render_error 的兜底语义）。 */
export function resolveStreamErrorCopyKey(code: string | undefined): string {
  return code && STREAM_ERROR_CODES.has(code) ? code : 'default'
}

/**
 * 宽松解析 ``stream.error`` / ``client.error`` 事件 payload 为统一错误对象。
 *
 * - 对象且 ``code`` 为字符串：按后端契约规范化（契约见 witty_agent_server
 *   runtimes/stream_errors.py）；
 * - 历史字符串 payload：兜底为 INTERNAL_ERROR，原串作根因 message；
 * - 其余（空 / 畸形）：返回 null，UI 只显示标题行。
 */
export function parseStreamErrorPayload(raw: unknown): StreamErrorPayload | null {
  if (typeof raw === 'string') {
    const message = raw.trim()
    return message ? { code: 'INTERNAL_ERROR', message } : null
  }
  if (typeof raw !== 'object' || raw === null) {
    return null
  }
  const payload = raw as Record<string, unknown>
  if (typeof payload.code !== 'string' || !payload.code) {
    return null
  }
  const error: StreamErrorPayload = {
    code: payload.code,
    message: typeof payload.message === 'string' ? payload.message : '',
  }
  if (typeof payload.source === 'string' && payload.source) {
    error.source = payload.source
  }
  if (typeof payload.retryable === 'boolean') {
    error.retryable = payload.retryable
  }
  if (typeof payload.detail === 'object' && payload.detail !== null) {
    error.detail = payload.detail as Record<string, unknown>
  }
  return error
}
