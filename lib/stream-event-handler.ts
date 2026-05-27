import type { MutableRefObject } from 'react'
import type { Message } from './types'
import { generateUUID } from './utils'

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
  return `工具调用结果：${outContent.substring(0, 100)}${outContent.length > 100 ? '...' : ''}`
}

export function handleStreamEvent(
  eventData: any,
  conversationId: string,
  messageId: string,
  updateMessage: (cId: string, mId: string, updates: Partial<Message> | ((m: Message) => Partial<Message>)) => void,
  setStreaming: (cId: string | null, streaming: boolean) => void,
  locallyCreatedMessageIds?: MutableRefObject<Set<string>>,
) {
  switch (eventData.type) {
    case 'message.delta':
      if (eventData.payload?.delta) {
        updateMessage(conversationId, messageId, (m: Message) => ({
          content: (m.content || '') + eventData.payload.delta,
          events: [...(m.events || []), {
            type: 'message.delta',
            content: eventData.payload.delta,
            timestamp: eventData.ts_ms || Date.now(),
          }],
        }))
      }
      break
    case 'message.completed':
      locallyCreatedMessageIds?.current.delete(messageId)
      updateMessage(conversationId, messageId, {
        content: eventData.payload?.text || '',
        isStreaming: false,
      })
      setStreaming(conversationId, false)
      break
    case 'thinking':
      if (eventData.payload?.thinking) {
        updateMessage(conversationId, messageId, (m: Message) => ({
          thinking: [...(m.thinking || []), eventData.payload.thinking],
          displayText: [...(m.displayText || []), eventData.payload.display_text || `AI正在思考：${eventData.payload.thinking}`],
          events: [...(m.events || []), {
            type: 'thinking',
            content: eventData.payload.display_text || `AI正在思考：${eventData.payload.thinking}`,
            timestamp: eventData.ts_ms || Date.now(),
          }],
        }))
      }
      break
    case 'tool.call.started':
      if (eventData.payload?.tool_name) {
        const displayText = eventData.payload.display_text || `正在调用工具：${eventData.payload.tool_name}`
        const toolCall = {
          id: eventData.payload.tool_call_id || generateUUID(),
          name: eventData.payload.tool_name,
          status: 'running' as const,
          input: eventData.payload.arguments,
          displayText,
        }
        updateMessage(conversationId, messageId, (m: Message) => ({
          toolCalls: [...(m.toolCalls || []), toolCall],
          events: [...(m.events || []), {
            type: 'tool.call.started',
            content: displayText,
            timestamp: eventData.ts_ms || Date.now(),
            toolCall,
          }],
        }))
      }
      break
    case 'tool.call.response':
      if (eventData.payload?.name) {
        const displayText = formatDisplayText(eventData.payload)
        const toolCall = {
          id: eventData.payload.tool_call_id || generateUUID(),
          name: eventData.payload.name,
          status: (eventData.payload.is_error ? 'error' : 'completed') as 'error' | 'completed',
          input: eventData.payload.arguments,
          output: eventData.payload.content,
          error: eventData.payload.is_error ? eventData.payload.content : undefined,
          duration: eventData.payload.duration,
          displayText,
        }
        updateMessage(conversationId, messageId, (m: Message) => ({
          toolCalls: [...(m.toolCalls || []), toolCall],
          events: [...(m.events || []), {
            type: 'tool.call.response',
            content: displayText,
            timestamp: eventData.ts_ms || Date.now(),
            toolCall,
          }],
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
      setStreaming(conversationId, false)
      break
    case 'turn.completed':
      locallyCreatedMessageIds?.current.delete(messageId)
      updateMessage(conversationId, messageId, { isStreaming: false })
      setStreaming(conversationId, false)
      break
  }
}
