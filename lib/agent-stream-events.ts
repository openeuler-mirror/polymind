import type { ChatState } from '@/lib/store'
import type { Message } from '@/lib/types'
import { generateUUID } from '@/lib/utils'
import {
  extractQuestions,
  applyQuestionAsked,
  resolveQuestion,
  applyThinkingDelta,
  applyToolCallDelta,
  applyMessageDelta,
  applyThinking,
  applyToolCallStarted,
  applyUsageUpdated,
  applyStreamError,
  QUESTION_TOOL_NAMES,
} from '@/lib/stream-event-handler'
import { formatToolOutput } from '@/lib/format-utils'

type AgentStreamStore = Pick<
  ChatState,
  'conversations' | 'addMessage' | 'updateMessage' | 'deleteMessage' | 'setStreaming'
>

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
        store.updateMessage(
          conversationId,
          nextAssistantMessageId,
          applyMessageDelta(currentMessage, eventData.payload.delta, eventData.ts_ms)
        )
      }
      break
    case 'message.completed':
    case 'turn.completed':
      const completedText =
        eventData.type === 'message.completed' ? eventData.payload?.text : undefined
      const currentText = currentMessage.content ?? ''
      store.updateMessage(conversationId, nextAssistantMessageId, {
        content:
          typeof completedText === 'string' && completedText.length > currentText.length
            ? completedText
            : currentText,
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
        store.updateMessage(
          conversationId,
          nextAssistantMessageId,
          applyThinking(
            currentMessage,
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
        store.updateMessage(
          conversationId,
          nextAssistantMessageId,
          applyThinkingDelta(currentMessage, delta, eventData.ts_ms)
        )
      }
      break
    }
    case 'tool.call.started':
      if (eventData.payload?.tool_name) {
        store.updateMessage(
          conversationId,
          nextAssistantMessageId,
          applyToolCallStarted(currentMessage, eventData.payload)
        )
      }
      break
    case 'tool.call.delta': {
      // 工具调用参数/内容流式输出：累积到对应运行中工具调用事件的 inputRaw
      const payload = eventData.payload
      const delta = payload?.delta ?? payload?.arguments_delta
      const toolCallId = payload?.tool_call_id
      if (delta && toolCallId) {
        store.updateMessage(
          conversationId,
          nextAssistantMessageId,
          applyToolCallDelta(currentMessage, delta, toolCallId)
        )
      }
      break
    }
    case 'tool.call.response':
      if (eventData.payload?.name || eventData.payload?.tool_name) {
        const existingToolCall = currentMessage.toolCalls?.find(
          item =>
            (eventData.payload.tool_call_id && item.id === eventData.payload.tool_call_id) ||
            (!eventData.payload.tool_call_id &&
              item.name === (eventData.payload.name || eventData.payload.tool_name) &&
              item.status === 'running')
        )
        const toolName = eventData.payload.name || eventData.payload.tool_name
        const toolCall = {
          id: eventData.payload.tool_call_id || existingToolCall?.id || generateUUID(),
          name: toolName,
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
        const isQuestionTool = QUESTION_TOOL_NAMES.has(toolName)
        store.updateMessage(conversationId, nextAssistantMessageId, {
          toolCalls: nextToolCalls,
          events: isQuestionTool
            ? currentMessage.events || []
            : [
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
        store.updateMessage(
          conversationId,
          nextAssistantMessageId,
          applyUsageUpdated(eventData.payload)
        )
      }
      break
    case 'question.asked': {
      const { questions, questionId } = extractQuestions(eventData.payload)
      store.updateMessage(
        conversationId,
        nextAssistantMessageId,
        applyQuestionAsked(currentMessage, questions, questionId, eventData.ts_ms)
      )
      break
    }
    case 'question.replied':
    case 'question.rejected': {
      const resolution = eventData.type === 'question.replied' ? 'replied' : 'rejected'
      const answers = eventData.payload?.answers ?? null
      store.updateMessage(
        conversationId,
        nextAssistantMessageId,
        resolveQuestion(currentMessage, resolution, answers)
      )
      break
    }
    case 'stream.error':
    case 'client.error':
      console.error('Error event:', eventData.payload || 'No payload')
      store.updateMessage(conversationId, nextAssistantMessageId, applyStreamError(currentMessage))
      store.setStreaming(conversationId, false)
      break
  }

  return nextAssistantMessageId
}
