import type { ChatState } from '@/lib/store'
import type { Message } from '@/lib/types'
import { MessageStatus } from '@/lib/types'
import { generateUUID } from '@/lib/utils'

type AgentStreamStore = Pick<
  ChatState,
  'conversations' | 'addMessage' | 'updateMessage' | 'deleteMessage' | 'setStreaming'
>

function formatToolOutput(content: any): string {
  if (content === null || content === undefined) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const texts = content
      .filter((item: any) => item && item.type === 'text' && typeof item.text === 'string')
      .map((item: any) => item.text)
      .join('\n')
    if (texts) return texts
    try {
      return JSON.stringify(content, null, 2)
    } catch {
      return '[无法序列化的内容]'
    }
  }
  if (typeof content === 'object') {
    if (content.details?.content) {
      const detailsContent = content.details.content
      return typeof detailsContent === 'string' ? detailsContent : JSON.stringify(detailsContent)
    }
    if (content.text && typeof content.text === 'string') return content.text
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
    } catch {
      return '[无法序列化的内容]'
    }
  }
  try {
    return String(content)
  } catch {
    return '[无法转换的内容]'
  }
}

function formatToolDisplayText(payload: any): string {
  if (payload.display_text) return payload.display_text
  if (payload.is_error) {
    const errorContent = formatToolOutput(payload.content)
    return `工具调用失败：${errorContent.substring(0, 100)}${errorContent.length > 100 ? '...' : ''}`
  }
  const outputContent = formatToolOutput(payload.content)
  return `${outputContent.substring(0, 100)}${outputContent.length > 100 ? '...' : ''}`
}

export function handleAgentStreamEvent({
  store,
  conversationId,
  thinkingMessageId,
  assistantMessageId,
  eventData,
  skipReconnect = false,
}: {
  store: AgentStreamStore
  conversationId: string
  thinkingMessageId: string
  assistantMessageId: string | null
  eventData: any
  skipReconnect?: boolean
}): string | null {
  let nextAssistantMessageId = assistantMessageId

  if (!nextAssistantMessageId) {
    store.deleteMessage(conversationId, thinkingMessageId)
    nextAssistantMessageId = generateUUID()
    const assistantMessage: Message = {
      id: nextAssistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
      skipReconnect,
      toolCalls: [],
      events: [],
    }
    store.addMessage(conversationId, assistantMessage)
  }

  if (!nextAssistantMessageId) {
    return nextAssistantMessageId
  }

  const currentMessage = store.conversations
    .find(c => c.id === conversationId)
    ?.messages.find(m => m.id === nextAssistantMessageId)

  if (!currentMessage) {
    return nextAssistantMessageId
  }

  switch (eventData.type) {
    case 'message.delta':
      if (eventData.payload?.delta) {
        store.updateMessage(conversationId, nextAssistantMessageId, {
          content: (currentMessage.content || '') + eventData.payload.delta,
          events: [
            ...(currentMessage.events || []),
            {
              type: 'message.delta',
              content: eventData.payload.delta,
              timestamp: eventData.ts_ms || Date.now(),
            },
          ],
        })
      }
      break
    case 'message.completed':
    case 'turn.completed':
      store.updateMessage(conversationId, nextAssistantMessageId, {
        content:
          eventData.type === 'message.completed'
            ? (eventData.payload?.text ?? currentMessage.content ?? '')
            : (currentMessage.content ?? ''),
        isStreaming: false,
        toolCalls: currentMessage.toolCalls?.map(toolCall =>
          toolCall.status === 'running'
            ? {
                ...toolCall,
                status: 'completed' as const,
                displayText: toolCall.displayText || '工具调用已结束',
              }
            : toolCall
        ),
        events: (currentMessage.events || [])
          .filter(e => e.type !== 'message.delta')
          .map(event =>
            event.toolCall?.status === 'running'
              ? {
                  ...event,
                  toolCall: {
                    ...event.toolCall,
                    status: 'completed' as const,
                    displayText: event.toolCall.displayText || '工具调用已结束',
                  },
                }
              : event
          ),
      })
      store.setStreaming(conversationId, false)
      break
    case 'thinking':
      if (eventData.payload?.thinking) {
        const thinkingText = eventData.payload.thinking
        const displayText =
          eventData.payload.display_text || `AI正在思考：${eventData.payload.thinking}`
        store.updateMessage(conversationId, nextAssistantMessageId, {
          thinking: [...(currentMessage.thinking || []), thinkingText],
          displayText: [...(currentMessage.displayText || []), displayText],
          events: [
            ...(currentMessage.events || []),
            {
              type: 'thinking',
              content: displayText,
              timestamp: eventData.ts_ms || Date.now(),
            },
          ],
        })
      }
      break
    case 'tool.call.started':
      if (eventData.payload?.tool_name) {
        const toolCall = {
          id: eventData.payload.tool_call_id || generateUUID(),
          name: eventData.payload.tool_name,
          status: 'running' as const,
          input: eventData.payload.arguments,
          displayText:
            eventData.payload.display_text || `正在调用工具：${eventData.payload.tool_name}`,
        }
        store.updateMessage(conversationId, nextAssistantMessageId, {
          toolCalls: [...(currentMessage.toolCalls || []), toolCall],
          events: [
            ...(currentMessage.events || []),
            {
              type: 'tool.call.started',
              content:
                eventData.payload.display_text || `正在调用工具：${eventData.payload.tool_name}`,
              timestamp: eventData.ts_ms || Date.now(),
              toolCall,
            },
          ],
        })
      }
      break
    case 'tool.call.response':
      if (eventData.payload?.name || eventData.payload?.tool_name) {
        const existingToolCall = currentMessage.toolCalls?.find(
          item =>
            (eventData.payload.tool_call_id && item.id === eventData.payload.tool_call_id) ||
            (!eventData.payload.tool_call_id &&
              item.name === (eventData.payload.name || eventData.payload.tool_name) &&
              item.status === 'running')
        )
        const toolCall = {
          id: eventData.payload.tool_call_id || existingToolCall?.id || generateUUID(),
          name: eventData.payload.name || eventData.payload.tool_name,
          status: eventData.payload.is_error ? ('error' as const) : ('completed' as const),
          input: eventData.payload.arguments || existingToolCall?.input,
          output: eventData.payload.content,
          error: eventData.payload.is_error ? eventData.payload.content : undefined,
          duration: eventData.payload.duration,
          displayText: formatToolDisplayText(eventData.payload),
        }
        const nextToolCalls = existingToolCall
          ? (currentMessage.toolCalls || []).map(item =>
              item.id === existingToolCall.id ? { ...item, ...toolCall } : item
            )
          : [...(currentMessage.toolCalls || []), toolCall]
        store.updateMessage(conversationId, nextAssistantMessageId, {
          toolCalls: nextToolCalls,
          events: [
            ...(currentMessage.events || []),
            {
              type: 'tool.call.response',
              content: formatToolDisplayText(eventData.payload),
              timestamp: eventData.ts_ms || Date.now(),
              toolCall,
            },
          ],
        })
      }
      break
    case 'usage.updated':
      if (eventData.payload) {
        store.updateMessage(conversationId, nextAssistantMessageId, {
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
      console.error('Error event:', eventData.payload || 'No payload')
      store.updateMessage(conversationId, nextAssistantMessageId, {
        isStreaming: false,
        status: MessageStatus.ERROR,
        // 清除 delta 事件，消息已终止，使用 message.content 作为权威数据源
        events: (currentMessage.events || []).filter(e => e.type !== 'message.delta'),
      })
      store.setStreaming(conversationId, false)
      break
  }

  return nextAssistantMessageId
}
