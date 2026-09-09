import type { EventItem, ToolCall } from './types'

/**
 * 消息事件时间线上的渲染分组。
 * - thinking-group：连续的 thinking 事件合并为一段思考
 * - delta-group：连续的 message.delta 合并为一段正文
 * - 其余事件（工具调用/提问等）原样透传，用于定位时间线顺序
 */
export interface MessageEventGroup {
  /** 分组类型：thinking-group / delta-group，或原样透传的事件类型 */
  type: string
  /** thinking-group / delta-group 承载的事件列表 */
  events?: EventItem[]
  content?: string
  timestamp?: number
  payload?: Record<string, any>
  toolCall?: ToolCall
}

/** 过程模块分组：折叠态下会被收进「已完成」的分组类型。 */
export function isProcessGroup(group: MessageEventGroup): boolean {
  return (
    group.type === 'thinking-group' ||
    group.type === 'tool.call.started' ||
    group.type === 'tool.call.response' ||
    group.type === 'question.asked' ||
    group.type === 'question.replied' ||
    group.type === 'question.rejected'
  )
}

/** 工具调用参数是否「有内容」：空字符串 / null / 空对象都视为没有。 */
function hasToolInput(input: unknown): boolean {
  if (!input) return false
  if (typeof input === 'object') return Object.keys(input as object).length > 0
  return true
}

/**
 * 同一 toolCall id 的 started / response 合并：
 * 后到的事件补齐字段，但不覆盖已有的 input（response 通常不带 input）。
 */
function mergeToolCall(
  existing: ToolCall | undefined,
  incoming: ToolCall | undefined
): ToolCall | undefined {
  if (!existing) return incoming
  if (!incoming) return existing
  const merged: ToolCall = { ...existing, ...incoming }
  if (!hasToolInput(incoming.input) && hasToolInput(existing.input)) {
    merged.input = existing.input
  }
  return merged
}

/**
 * 增量分组累加器：把「已消费的事件前缀 + 分组结果」一起缓存。
 * 流式期间事件只会在尾部追加，命中前缀时只需处理新增事件（O(1) 摊还），
 * 避免每个 delta 都对整条时间线做一次 O(n) 重建（O(n²)）。
 */
interface GroupAccumulator {
  /** 本次分组对应的事件数组（引用比较即可判定是否复用） */
  source: EventItem[]
  /** 已产出的分组；最后一个可能是仍可被续写的「开放」分组 */
  groups: MessageEventGroup[]
  /** 开放分组在 groups 中的下标；-1 表示没有开放分组 */
  openIndex: number
  /** 下一个待消费的事件下标 */
  consumed: number
  /** toolCallId → groups 下标，用于 started/response 的去重合并 */
  toolCallIndex: Map<string, number>
}

function createAccumulator(source: EventItem[]): GroupAccumulator {
  return { source, groups: [], openIndex: -1, consumed: 0, toolCallIndex: new Map() }
}

function isToolCallEvent(event: EventItem): boolean {
  return event.type === 'tool.call.started' || event.type === 'tool.call.response'
}

function consumeEvent(acc: GroupAccumulator, event: EventItem): void {
  if (event.type === 'thinking' || event.type === 'message.delta') {
    const groupType = event.type === 'thinking' ? 'thinking-group' : 'delta-group'
    const open = acc.openIndex >= 0 ? acc.groups[acc.openIndex] : undefined
    if (open?.type === groupType) {
      // 续写当前段：换新数组，让下游能感知内容变化
      open.events = [...(open.events ?? []), event]
      return
    }
    acc.groups.push({ type: groupType, events: [event] })
    acc.openIndex = acc.groups.length - 1
    return
  }

  // 其它事件会打断思考/正文分段
  acc.openIndex = -1

  if (isToolCallEvent(event) && event.toolCall?.id) {
    const toolCallId = event.toolCall.id
    const existingIndex = acc.toolCallIndex.get(toolCallId)
    if (existingIndex !== undefined) {
      // 保留首次出现的位置，用后到事件的字段补齐（与原实现语义一致）
      const existing = acc.groups[existingIndex]
      acc.groups[existingIndex] = {
        ...event,
        toolCall: mergeToolCall(existing.toolCall, event.toolCall),
      }
      return
    }
    acc.toolCallIndex.set(toolCallId, acc.groups.length)
  }

  acc.groups.push(event)
}

/** 从零构建分组（无缓存，便于测试与一次性场景）。 */
export function buildMessageEventGroups(events: EventItem[]): MessageEventGroup[] {
  const acc = createAccumulator(events)
  for (const event of events) {
    consumeEvent(acc, event)
  }
  acc.consumed = events.length
  return acc.groups
}

/** 事件数组是否为「在已分组前缀之后追加」：首元素同一引用、旧末元素仍在原位、长度增加。 */
function canExtend(prev: EventItem[], next: EventItem[]): boolean {
  if (next.length <= prev.length) return false
  if (prev.length === 0) return true
  return next[0] === prev[0] && next[prev.length - 1] === prev[prev.length - 1]
}

/** 分组缓存上限：超出后按插入顺序淘汰最早的消息，避免长会话无限增长。 */
const MAX_CACHED_MESSAGES = 200
const groupCache = new Map<string, GroupAccumulator>()

/**
 * 取某条消息的事件分组（带缓存）。
 * 事件数组引用不变时直接复用；只在尾部追加时增量处理；其余情况整体重建。
 */
export function getMessageEventGroups(messageId: string, events: EventItem[]): MessageEventGroup[] {
  const cached = groupCache.get(messageId)
  if (cached?.source === events) {
    return cached.groups
  }

  const acc = cached && canExtend(cached.source, events) ? cached : createAccumulator(events)
  for (let i = acc.consumed; i < events.length; i++) {
    consumeEvent(acc, events[i])
  }
  acc.consumed = events.length
  acc.source = events

  groupCache.set(messageId, acc)
  if (groupCache.size > MAX_CACHED_MESSAGES) {
    const oldest = groupCache.keys().next().value
    if (oldest !== undefined) groupCache.delete(oldest)
  }
  return acc.groups
}

/** 仅供测试：清空分组缓存。 */
export function clearMessageEventGroupsCache(): void {
  groupCache.clear()
}
