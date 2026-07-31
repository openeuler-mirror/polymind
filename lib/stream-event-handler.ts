import type { MutableRefObject } from 'react'
import type { Message, QuestionInfo, EventItem, QuestionAskedPayload } from './types'
import { MessageStatus } from './types'
import { generateUUID } from './utils'

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

/**
 * 清除消息上的 question 相关字段（question.replied / question.rejected 时使用）。
 * 同时过滤 events 数组中的 question.asked 事件。
 */
export function clearQuestionFields(existingEvents?: EventItem[]): Partial<Message> {
  return {
    question: null,
    questionId: null,
    ...(existingEvents ? { events: existingEvents.filter(e => e.type !== 'question.asked') } : {}),
  }
}

export function formatOutput(content: any): string {
  if (content === null || content === undefined) {
    return ''
  }
  if (typeof content === 'string') {
    return content
  }
  if (typeof content === 'object') {
    if (content.details?.content) {
      const dc = content.details.content
      return typeof dc === 'string' ? dc : JSON.stringify(dc)
    }
    if (content.text && typeof content.text === 'string') {
      return content.text
    }
    if (Array.isArray(content.content)) {
      const texts = content.content
        .filter((item: any) => item && item.type === 'text' && typeof item.text === 'string')
        .map((item: any) => item.text)
        .join('\n')
      if (texts) return texts
    }
    if (content.error && typeof content.error === 'string') return content.error
    if (content.message && typeof content.message === 'string') return content.message
    try {
      return JSON.stringify(content, null, 2)
    } catch (e) {
      return '[无法序列化的内容]'
    }
  }
  try {
    return String(content)
  } catch (e) {
    return '[无法转换的内容]'
  }
}

export function formatDisplayText(payload: any): string {
  if (payload.display_text) {
    return payload.display_text
  }
  if (payload.is_error) {
    const errContent = formatOutput(payload.content)
    return `工具调用失败：${errContent.substring(0, 100)}${errContent.length > 100 ? '...' : ''}`
  }
  const outContent = formatOutput(payload.content)
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
        updateMessage(conversationId, messageId, (m: Message) => ({
          content: (m.content || '') + eventData.payload.delta,
          events: [
            ...(m.events || []),
            {
              type: 'message.delta',
              content: eventData.payload.delta,
              timestamp: eventData.ts_ms || Date.now(),
            },
          ],
        }))
      }
      break
    case 'message.completed':
      locallyCreatedMessageIds?.current.delete(messageId)
      updateMessage(conversationId, messageId, (m: Message) => ({
        content: m.content || eventData.payload?.text || '',
        isStreaming: false,
        status: MessageStatus.COMPLETED,
      }))
      setStreaming(conversationId, false)
      break
    case 'thinking':
      if (eventData.payload?.thinking) {
        updateMessage(conversationId, messageId, (m: Message) => ({
          thinking: [...(m.thinking || []), eventData.payload.thinking],
          displayText: [
            ...(m.displayText || []),
            eventData.payload.display_text || `AI正在思考：${eventData.payload.thinking}`,
          ],
          events: [
            ...(m.events || []),
            {
              type: 'thinking',
              content:
                eventData.payload.display_text || `AI正在思考：${eventData.payload.thinking}`,
              timestamp: eventData.ts_ms || Date.now(),
            },
          ],
        }))
      }
      break
    case 'tool.call.started':
      if (eventData.payload?.tool_name) {
        const displayText =
          eventData.payload.display_text || `正在调用工具：${eventData.payload.tool_name}`
        const toolCall = {
          id: eventData.payload.tool_call_id || generateUUID(),
          name: eventData.payload.tool_name,
          status: 'running' as const,
          input: eventData.payload.arguments,
          displayText,
        }
        updateMessage(conversationId, messageId, (m: Message) => ({
          toolCalls: [...(m.toolCalls || []), toolCall],
          events: [
            ...(m.events || []),
            {
              type: 'tool.call.started',
              content: displayText,
              timestamp: eventData.ts_ms || Date.now(),
              toolCall,
            },
          ],
        }))
      }
      break
    case 'tool.call.response':
      if (eventData.payload?.name || eventData.payload?.tool_name) {
        const displayText = formatDisplayText(eventData.payload)
        const toolCall = {
          id: eventData.payload.tool_call_id || generateUUID(),
          name: eventData.payload.name || eventData.payload.tool_name,
          status: (eventData.payload.is_error ? 'error' : 'completed') as 'error' | 'completed',
          input: eventData.payload.arguments,
          output: eventData.payload.content,
          error: eventData.payload.is_error ? eventData.payload.content : undefined,
          duration: eventData.payload.duration,
          displayText,
        }
        updateMessage(conversationId, messageId, (m: Message) => ({
          toolCalls: [...(m.toolCalls || []), toolCall],
          events: [
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
    case 'usage.updated':
      if (eventData.payload) {
        updateMessage(conversationId, messageId, {
          usage: {
            inputTokens: eventData.payload.input_tokens,
            outputTokens: eventData.payload.output_tokens,
            totalCost: eventData.payload.total_cost,
          },
        })
      }
      break
    case 'stream.error':
    case 'client.error':
      console.error('Stream error:', eventData.payload || 'No payload')
      locallyCreatedMessageIds?.current.delete(messageId)
      updateMessage(conversationId, messageId, {
        isStreaming: false,
        status: MessageStatus.ERROR,
      })
      setStreaming(conversationId, false)
      break
    case 'turn.completed':
      locallyCreatedMessageIds?.current.delete(messageId)
      updateMessage(conversationId, messageId, {
        isStreaming: false,
        status: MessageStatus.COMPLETED,
      })
      setStreaming(conversationId, false)
      break
    case 'question.asked': {
      const { questions, questionId } = extractQuestions(eventData.payload)
      updateMessage(conversationId, messageId, (m: Message) => ({
        question: questions,
        questionId,
        events: [
          ...(m.events || []),
          {
            type: 'question.asked',
            content: questions?.[0]?.question || 'AI 提出了一个问题',
            timestamp: eventData.ts_ms || Date.now(),
          },
        ],
      }))
      break
    }
    case 'question.replied':
    case 'question.rejected':
      updateMessage(conversationId, messageId, (m: Message) => clearQuestionFields(m.events))
      break
  }
}
