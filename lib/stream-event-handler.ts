import type { MutableRefObject } from 'react'
import type { Message, QuestionInfo, QuestionAskedPayload, ToolCall, Artifact } from './types'
import { MessageStatus } from './types'
import { generateUUID } from './utils'
import { formatToolOutput } from './format-utils'
import { normalizeArtifactType, resolveArtifactType } from './artifacts'

/**
 * 从 question.asked 事件 payload 中提取所有 QuestionInfo 组成的数组。
 * 供 SSE、WS 和 agent-stream 三条路径复用。
 */
export function extractQuestions(payload: QuestionAskedPayload): {
  questions: QuestionInfo[] | null
  questionId: string | null
} {
  if (!payload?.questions || !Array.isArray(payload.questions)) {
    return { questions: null, questionId: null }
  }
  const questions: QuestionInfo[] = payload.questions.map((q: any) => ({
    question: q.question || '',
    header: q.header || '',
    options: q.options || [],
    multiple: q.multiple,
    custom: q.custom,
  }))
  return {
    questions: questions.length > 0 ? questions : null,
    questionId: payload.question_id || null,
  }
}

export const QUESTION_TOOL_NAMES: ReadonlySet<string> = new Set(['question'])

// 构造 question.asked 时的消息更新。
export function applyQuestionAsked(
  m: Message,
  questions: QuestionInfo[] | null,
  questionId: string | null,
  timestamp?: number
): Partial<Message> {
  const events = m.events || []

  const existingAskIdx = events.findIndex(
    e => e.type === 'question.asked' && questionId && e.payload?.question_id === questionId
  )
  if (existingAskIdx >= 0) {
    const resolved = events
      .slice(existingAskIdx + 1)
      .some(e => e.type === 'question.replied' || e.type === 'question.rejected')
    if (resolved) return {}
  }

  return {
    question: questions,
    questionId,
    questionStatus: 'pending',
    questionAnswers: null,
    events: [
      // 仅去掉同 question_id 的旧 asked 事件去重，保留历史轮次的提问痕迹
      ...events.filter(
        e => !(e.type === 'question.asked' && questionId && e.payload?.question_id === questionId)
      ),
      {
        type: 'question.asked',
        content: questions?.[0]?.question || 'AI 提出了一个问题',
        timestamp: timestamp || Date.now(),
        payload: { questions, question_id: questionId },
      },
    ],
  }
}

// 构造 question.replied / question.rejected 时的消息更新。
export function resolveQuestion(
  m: Message,
  resolution: 'replied' | 'rejected',
  answers?: string[][] | null
): Partial<Message> {
  const events = m.events || []
  const lastAskedIdx = events.reduce((idx, e, i) => (e.type === 'question.asked' ? i : idx), -1)
  const alreadyResolved = events
    .slice(lastAskedIdx + 1)
    .some(e => e.type === 'question.replied' || e.type === 'question.rejected')

  const nextAnswers =
    resolution === 'replied' ? (answers ?? m.questionAnswers ?? null) : m.questionAnswers

  return {
    questionStatus: resolution,
    questionAnswers: nextAnswers,
    events: alreadyResolved
      ? events
      : [
          ...events,
          {
            type: resolution === 'replied' ? 'question.replied' : 'question.rejected',
            content: resolution === 'replied' ? '已回答提问' : '已跳过提问',
            timestamp: Date.now(),
            payload: {
              question_id: m.questionId ?? undefined,
              ...(nextAnswers ? { answers: nextAnswers } : {}),
            },
          },
        ],
  }
}

// 累积 thinking.delta 到消息的 events 中，实现流式思考展示。
export function applyThinkingDelta(
  m: Message,
  delta: string,
  timestamp?: number
): Partial<Message> {
  const events = [...(m.events || [])]
  const last = events[events.length - 1]
  if (last && last.type === 'thinking' && last.payload?.streaming) {
    events[events.length - 1] = {
      ...last,
      content: (last.content || '') + delta,
      timestamp: timestamp || last.timestamp || Date.now(),
    }
  } else {
    events.push({
      type: 'thinking',
      content: delta,
      timestamp: timestamp || Date.now(),
      payload: { streaming: true },
    })
  }
  return { events }
}

// 累积 tool.call.delta 到消息的 events 和 toolCalls 中，实现工具调用参数流式展示。
export function applyToolCallDelta(
  m: Message,
  delta: string,
  toolCallId: string
): Partial<Message> {
  const events = [...(m.events || [])]
  let idx = -1
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === 'tool.call.started' && events[i].toolCall?.id === toolCallId) {
      idx = i
      break
    }
  }
  if (idx < 0) return {}
  const target = events[idx]
  const tc = target.toolCall
  if (!tc) return {}
  events[idx] = {
    ...target,
    toolCall: {
      ...tc,
      inputRaw: (tc.inputRaw || '') + delta,
    },
  }
  return {
    events,
    toolCalls: (m.toolCalls || []).map(tc =>
      tc.id === toolCallId ? { ...tc, inputRaw: (tc.inputRaw || '') + delta } : tc
    ),
  }
}

/**
 * 共享事件数据转换函数 — 供 handleStreamEvent 和 handleAgentStreamEvent 复用。
 * 每个函数接收当前 Message 和事件 payload，返回 Partial<Message>。
 */

// 累积消息正文增量。
export function applyMessageDelta(m: Message, delta: string, timestamp?: number): Partial<Message> {
  return {
    content: (m.content || '') + delta,
    events: [
      ...(m.events || []),
      { type: 'message.delta' as const, content: delta, timestamp: timestamp || Date.now() },
    ],
  }
}

// thinking 事件：累积思考到 thinking/displayText 数组并管理 thinking 事件的流式标记。
export function applyThinking(
  m: Message,
  thinking: string,
  displayTextOverride?: string,
  timestamp?: number
): Partial<Message> {
  const displayText = displayTextOverride || `AI正在思考：${thinking}`
  const events = [...(m.events || [])]
  const last = events[events.length - 1]
  // 思考内容已通过 thinking.delta 流式输出：仅标记流式结束，避免重复展示
  if (last && last.type === 'thinking' && last.payload?.streaming) {
    events[events.length - 1] = {
      ...last,
      payload: { ...last.payload, streaming: false },
    }
    return {
      thinking: [...(m.thinking || []), thinking],
      displayText: [...(m.displayText || []), displayText],
      events,
    }
  }
  return {
    thinking: [...(m.thinking || []), thinking],
    displayText: [...(m.displayText || []), displayText],
    events: [
      ...events,
      {
        type: 'thinking',
        content: displayText,
        timestamp: timestamp || Date.now(),
      },
    ],
  }
}

// tool.call.started：构建工具调用并追加到 toolCalls/events。
export function applyToolCallStarted(
  m: Message,
  payload: {
    tool_name: string
    tool_call_id?: string
    arguments?: Record<string, unknown>
    display_text?: string
    ts_ms?: number
  }
): Partial<Message> {
  const displayText = payload.display_text || `正在调用工具：${payload.tool_name}`
  const toolCall: ToolCall = {
    id: payload.tool_call_id || generateUUID(),
    name: payload.tool_name,
    status: 'running',
    input: payload.arguments,
    displayText,
  }
  const isQuestionTool = QUESTION_TOOL_NAMES.has(payload.tool_name)
  return {
    toolCalls: [...(m.toolCalls || []), toolCall],
    events: isQuestionTool
      ? m.events || []
      : [
          ...(m.events || []),
          {
            type: 'tool.call.started',
            content: displayText,
            timestamp: payload.ts_ms || Date.now(),
            toolCall,
          },
        ],
  }
}

// usage.updated：构建 usage 更新对象。
export function applyUsageUpdated(payload: {
  input_tokens?: number
  output_tokens?: number
  total_cost?: number
}): Pick<Message, 'usage'> {
  return {
    usage: {
      inputTokens: payload.input_tokens,
      outputTokens: payload.output_tokens,
      totalCost: payload.total_cost,
    },
  }
}

// 按 id 去重合并产物到 message.artifacts（started 建初态，completed 写终态）。
function upsertArtifact(m: Message, patch: Artifact): Partial<Message> {
  const artifacts = m.artifacts || []
  const idx = artifacts.findIndex(a => a.id === patch.id)
  const next =
    idx >= 0 ? artifacts.map((a, i) => (i === idx ? { ...a, ...patch } : a)) : [...artifacts, patch]
  return { artifacts: next }
}

// artifact.started：产物开始生成（建 creating 初态）。
export function applyArtifactStarted(
  m: Message,
  payload: {
    id?: string
    name?: string
    type?: string
    version?: number
    relative_path?: string
    size?: number
    mime?: string
  },
  timestamp?: number
): Partial<Message> {
  const id = payload.id || generateUUID()
  const name = payload.name || id
  const artifact: Artifact = {
    id,
    name,
    type: normalizeArtifactType(payload.type) || resolveArtifactType(name),
    status: 'creating',
    version: payload.version ?? 1,
    relativePath: payload.relative_path || '',
    size: payload.size,
    mime: payload.mime,
  }
  return {
    ...upsertArtifact(m, artifact),
    events: [
      ...(m.events || []),
      {
        type: 'artifact.started',
        content: `开始生成产物：${name}`,
        timestamp: timestamp || Date.now(),
        payload,
      },
    ],
  }
}

// artifact.delta：流式增量累积到对应产物的内联 content。
export function applyArtifactDelta(
  m: Message,
  delta: string,
  artifactId: string,
  timestamp?: number
): Partial<Message> {
  if (!(m.artifacts || []).some(a => a.id === artifactId)) return {}
  const events = [...(m.events || [])]
  let idx = -1
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === 'artifact.delta' && events[i].payload?.id === artifactId) {
      idx = i
      break
    }
  }
  if (idx >= 0) {
    const target = events[idx]
    events[idx] = {
      ...target,
      content: (target.content || '') + delta,
      timestamp: timestamp || target.timestamp || Date.now(),
    }
  } else {
    events.push({
      type: 'artifact.delta',
      content: delta,
      timestamp: timestamp || Date.now(),
      payload: { id: artifactId, delta },
    })
  }
  return {
    artifacts: (m.artifacts || []).map(a =>
      a.id === artifactId ? { ...a, content: (a.content || '') + delta } : a
    ),
    events,
  }
}

// artifact.completed：产物生成结束（写终态，超限/二进制仅带相对路径）。
export function applyArtifactCompleted(
  m: Message,
  payload: {
    id?: string
    name?: string
    type?: string
    status?: string
    version?: number
    relative_path?: string
    size?: number
    mime?: string
    content?: string
  },
  timestamp?: number
): Partial<Message> {
  const id = payload.id
  if (!id) return {}
  const existing = (m.artifacts || []).find(a => a.id === id)
  const name = payload.name || existing?.name || id
  const artifact: Artifact = {
    id,
    name,
    type: normalizeArtifactType(payload.type) || existing?.type || resolveArtifactType(name),
    status: payload.status === 'error' ? 'error' : 'ready',
    version: payload.version ?? existing?.version ?? 1,
    relativePath: payload.relative_path || existing?.relativePath || '',
    size: payload.size ?? existing?.size,
    mime: payload.mime || existing?.mime,
    ...(payload.content !== undefined ? { content: payload.content } : {}),
  }
  return {
    ...upsertArtifact(m, artifact),
    events: [
      ...(m.events || []),
      {
        type: 'artifact.completed',
        content: `产物已生成：${artifact.name}`,
        timestamp: timestamp || Date.now(),
        payload,
      },
    ],
  }
}

// 判断事件是否为流式增量类事件（完成时需从 events 中滤除，避免尾部再展示一遍冗余内容）。
export function isStreamDeltaEvent(e: { type: string }): boolean {
  return e.type === 'message.delta' || e.type === 'artifact.delta'
}

// 两个 stream handler（handleStreamEvent / handleAgentStreamEvent）共用的 updateMessage 回调签名。
export type UpdateMessageFn = (
  conversationId: string,
  messageId: string,
  updates: Partial<Message> | ((m: Message) => Partial<Message>)
) => void

// artifact.* 事件统一分发：把 started/delta/completed 三类的「提取 payload → 调 apply*」逻辑收拢到一处，
// 避免 handleStreamEvent 与 handleAgentStreamEvent 各写一份重复的分发 switch。
export function handleArtifactEvent(
  eventData: any,
  updateMessage: UpdateMessageFn,
  conversationId: string,
  messageId: string
): void {
  const payload = eventData.payload
  switch (eventData.type) {
    case 'artifact.started':
      if (payload?.id || payload?.name) {
        updateMessage(conversationId, messageId, (m: Message) =>
          applyArtifactStarted(m, payload, eventData.ts_ms)
        )
      }
      break
    case 'artifact.delta': {
      const delta = payload?.delta
      const artifactId = payload?.id
      if (delta && artifactId) {
        updateMessage(conversationId, messageId, (m: Message) =>
          applyArtifactDelta(m, delta, artifactId, eventData.ts_ms)
        )
      }
      break
    }
    case 'artifact.completed':
      if (payload?.id) {
        updateMessage(conversationId, messageId, (m: Message) =>
          applyArtifactCompleted(m, payload, eventData.ts_ms)
        )
      }
      break
  }
}

// stream.error / client.error：标记消息为错误状态并滤除 delta 事件。
export function applyStreamError(m: Message): Partial<Message> {
  return {
    isStreaming: false,
    status: MessageStatus.ERROR,
    events: (m.events || []).filter(e => !isStreamDeltaEvent(e)),
  }
}

export function formatDisplayText(payload: any): string {
  if (payload.display_text) {
    return payload.display_text
  }
  if (payload.is_error) {
    const errContent = formatToolOutput(payload.content)
    return `工具调用失败：${errContent.substring(0, 100)}${errContent.length > 100 ? '...' : ''}`
  }
  const outContent = formatToolOutput(payload.content)
  return `${outContent.substring(0, 100)}${outContent.length > 100 ? '...' : ''}`
}

export function handleStreamEvent(
  eventData: any,
  conversationId: string,
  messageId: string,
  updateMessage: (
    cId: string,
    mId: string,
    updates: Partial<Message> | ((m: Message) => Partial<Message>)
  ) => void,
  setStreaming: (cId: string | null, streaming: boolean) => void,
  locallyCreatedMessageIds?: MutableRefObject<Set<string>>
) {
  switch (eventData.type) {
    case 'message.delta':
      if (eventData.payload?.delta) {
        updateMessage(conversationId, messageId, (m: Message) =>
          applyMessageDelta(m, eventData.payload.delta, eventData.ts_ms)
        )
      }
      break
    case 'message.completed':
      locallyCreatedMessageIds?.current.delete(messageId)
      updateMessage(conversationId, messageId, (m: Message) => ({
        content: m.content || eventData.payload?.text || '',
        isStreaming: false,
        status: MessageStatus.COMPLETED,
        events: (m.events || []).filter(e => !isStreamDeltaEvent(e)),
      }))
      setStreaming(conversationId, false)
      break
    case 'thinking':
      if (eventData.payload?.thinking) {
        updateMessage(conversationId, messageId, (m: Message) =>
          applyThinking(
            m,
            eventData.payload.thinking,
            eventData.payload.display_text,
            eventData.ts_ms
          )
        )
      }
      break
    case 'thinking.delta': {
      const delta = eventData.payload?.delta ?? eventData.payload?.thinking
      if (delta) {
        updateMessage(conversationId, messageId, (m: Message) =>
          applyThinkingDelta(m, delta, eventData.ts_ms)
        )
      }
      break
    }
    case 'tool.call.started':
      if (eventData.payload?.tool_name) {
        updateMessage(conversationId, messageId, (m: Message) =>
          applyToolCallStarted(m, eventData.payload)
        )
      }
      break
    case 'tool.call.delta': {
      // 工具调用参数/内容流式输出：累积到对应运行中工具调用事件的 inputRaw
      const payload = eventData.payload
      const delta = payload?.delta ?? payload?.arguments_delta
      const toolCallId = payload?.tool_call_id
      if (delta && toolCallId) {
        updateMessage(conversationId, messageId, (m: Message) =>
          applyToolCallDelta(m, delta, toolCallId)
        )
      }
      break
    }
    case 'tool.call.response':
      if (eventData.payload?.name || eventData.payload?.tool_name) {
        const displayText = formatDisplayText(eventData.payload)
        const toolName = eventData.payload.name || eventData.payload.tool_name
        const toolCall = {
          id: eventData.payload.tool_call_id || generateUUID(),
          name: toolName,
          status: (eventData.payload.is_error ? 'error' : 'completed') as 'error' | 'completed',
          input: eventData.payload.arguments,
          output: eventData.payload.content,
          error: eventData.payload.is_error ? eventData.payload.content : undefined,
          duration: eventData.payload.duration,
          displayText,
        }
        const isQuestionTool = QUESTION_TOOL_NAMES.has(toolName)
        updateMessage(conversationId, messageId, (m: Message) => ({
          toolCalls: [...(m.toolCalls || []), toolCall],
          events: isQuestionTool
            ? m.events || []
            : [
                ...(m.events || []),
                {
                  type: 'tool.call.response',
                  content: displayText,
                  timestamp: eventData.ts_ms || Date.now(),
                  toolCall,
                },
              ],
        }))
      }
      break
    case 'artifact.started':
    case 'artifact.delta':
    case 'artifact.completed':
      handleArtifactEvent(eventData, updateMessage, conversationId, messageId)
      break
    case 'usage.updated':
      if (eventData.payload) {
        updateMessage(conversationId, messageId, applyUsageUpdated(eventData.payload))
      }
      break
    case 'stream.error':
    case 'client.error':
      console.error('Stream error:', eventData.payload || 'No payload')
      locallyCreatedMessageIds?.current.delete(messageId)
      updateMessage(conversationId, messageId, (m: Message) => applyStreamError(m))
      setStreaming(conversationId, false)
      break
    case 'turn.completed':
      locallyCreatedMessageIds?.current.delete(messageId)
      updateMessage(conversationId, messageId, (m: Message) => ({
        isStreaming: false,
        status: MessageStatus.COMPLETED,
        events: (m.events || []).filter(e => !isStreamDeltaEvent(e)),
      }))
      setStreaming(conversationId, false)
      break
    case 'question.asked': {
      const { questions, questionId } = extractQuestions(eventData.payload)
      updateMessage(conversationId, messageId, (m: Message) =>
        applyQuestionAsked(m, questions, questionId, eventData.ts_ms)
      )
      break
    }
    case 'question.replied':
    case 'question.rejected': {
      const resolution = eventData.type === 'question.replied' ? 'replied' : 'rejected'
      const answers = eventData.payload?.answers ?? null
      updateMessage(conversationId, messageId, (m: Message) =>
        resolveQuestion(m, resolution, answers)
      )
      break
    }
  }
}
