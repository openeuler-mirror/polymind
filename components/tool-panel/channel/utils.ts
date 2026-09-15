import { format } from 'date-fns'

import { extractApiErrorMessage } from '@/lib/error-handler'
import {
  channelErrorCode,
  type ChannelCatalogItem,
  type ChannelInstance,
  type ChannelInstanceStatus,
} from '@/services/channel-service'

/** i18n 的 t 函数最小签名（只用到 key 与 defaultValue）。 */
type Translate = (key: string, options?: { defaultValue?: string }) => string

/**
 * 后端域错误 -> 用户可见文案。
 *
 * 已知错误码走 channel 命名空间的 `errors.*` 翻译（后端 message 是英文、面向排障，
 * 不适合直接给用户），未知错误码回退到后端 message，最后回退到调用方给的通用文案。
 * **绝不吞掉 error_code**：未知码时后端原文里通常就带着它。
 */
export function channelErrorMessage(
  translate: Translate,
  error: unknown,
  fallback: string
): string {
  const code = channelErrorCode(error)
  if (code) {
    const key = `errors.${code}`
    const translated = translate(key, { defaultValue: '' })
    // i18next 在缺键时可能回显 key 本身，因此要显式排除
    if (translated && translated !== key) return translated
  }
  return extractApiErrorMessage(error, fallback)
}

/** 渠道展示名：catalog 缺失（渠道未注册）时回退到渠道标识符本身。 */
export function channelDisplayName(channel: string, catalog: ChannelCatalogItem[]): string {
  return catalog.find(item => item.channel === channel)?.display_name ?? channel
}

/** 实例展示名：优先调用方设置的 display_name，其次渠道展示名。 */
export function instanceDisplayName(
  instance: ChannelInstance,
  catalog: ChannelCatalogItem[]
): string {
  const name = instance.display_name?.trim()
  if (name) return name
  return channelDisplayName(instance.channel, catalog)
}

export type InstanceStatusTone = 'ok' | 'warn' | 'error' | 'muted'

/**
 * 状态到展示语气的映射：决定徽标配色。
 * connected 之外的状态都值得让运维看一眼，因此不区分"待连接"与"离线"的颜色。
 */
export function instanceStatusTone(status: ChannelInstanceStatus | string): InstanceStatusTone {
  switch (status) {
    case 'connected':
      return 'ok'
    case 'pending':
      return 'muted'
    case 'degraded':
      return 'warn'
    case 'offline':
      return 'error'
    case 'error':
      return 'error'
    case 'disabled':
      return 'muted'
    default:
      return 'muted'
  }
}

/** 徽标配色类：与仓库既有的浅色徽标写法保持一致。 */
export const STATUS_TONE_CLASSES: Record<InstanceStatusTone, string> = {
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warn: 'border-amber-200 bg-amber-50 text-amber-700',
  error: 'border-rose-200 bg-rose-50 text-rose-700',
  muted: 'border-border bg-muted text-muted-foreground',
}

const KNOWN_AGENT_STATES = ['unbound', 'deleted', 'creating', 'running', 'paused', 'error']

/**
 * agent 状态的 i18n key 后缀：`unbound`（从未绑定）与 `deleted`（绑定后被删除）
 * 必须能区分——两者对用户文案相同，但运维需要看得出来。
 */
export function agentStateKey(agentState: string): string {
  return KNOWN_AGENT_STATES.includes(agentState) ? agentState : 'error'
}

/**
 * 后端时间字段是 SQLite 中的 UTC naive 时间，序列化后**不带时区后缀**。
 * `new Date('2026-09-13T04:07:55')` 会被 JS 当成本地时间，导致二维码倒计时
 * 整整差一个时区；这里统一按 UTC 解析。
 */
export function parseUtcDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
  const date = new Date(hasZone ? value : `${value}Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

/** 把后端时间格式化为本地时间字符串；缺失/非法时返回占位符。 */
export function formatChannelDateTime(value: string | null | undefined): string {
  const date = parseUtcDate(value)
  if (!date) return '--'
  return format(date, 'yyyy-MM-dd HH:mm')
}

/** 把后端时间格式化为本地时刻（HH:mm:ss），用于二维码有效期提示。 */
export function formatChannelTime(value: string | null | undefined): string {
  const date = parseUtcDate(value)
  if (!date) return '--'
  return format(date, 'HH:mm:ss')
}

/** 剩余时长（毫秒），已过期或时间非法时返回 0。 */
export function remainingMs(
  expiresAt: string | null | undefined,
  now: number = Date.now()
): number {
  const date = parseUtcDate(expiresAt)
  if (!date) return 0
  return Math.max(0, date.getTime() - now)
}

/** 把毫秒格式化为 mm:ss（超过一小时按 hh:mm:ss）。 */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
  return `${pad(minutes)}:${pad(seconds)}`
}

/** 白名单文本（每行一个）-> 去重后的数组。 */
export function parseAllowlist(text: string): string[] {
  const seen = new Set<string>()
  const entries: string[] = []
  for (const chunk of text.split(/[\n,，;；]/)) {
    const value = chunk.trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    entries.push(value)
  }
  return entries
}

/** 白名单数组 -> 文本（每行一个）。 */
export function formatAllowlist(entries: string[]): string {
  return entries.join('\n')
}

/** 两个白名单是否等价（顺序不同视为相同）。 */
export function isSameAllowlist(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  const rightSet = new Set(right)
  return left.every(entry => rightSet.has(entry))
}

/** 非密配置的展示列表：把未知类型安全地转成字符串。 */
export function configEntries(config: Record<string, unknown>): Array<[string, string]> {
  return Object.entries(config ?? {}).map(([key, value]) => [
    key,
    typeof value === 'string' ? value : JSON.stringify(value),
  ])
}
