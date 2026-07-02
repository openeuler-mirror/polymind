import type { StateCreator } from 'zustand'
import type { Session, EventItem } from '../types'
import { SessionStatus } from '../types'
import type { WebSocketClient } from '@/lib/websocket-client'
import { messageService } from '@/services/message-service'
import { sessionService } from '@/services/session-service'
import { generateUUID } from '../utils'
import { appConfig } from '@/app/config'
import type { StoreState } from './index'

export interface ConnectionSlice {
  wsConnections: Record<string, WebSocketClient>
  isConnecting: boolean
  connectionError: string | null
  _stoppingInProgress: boolean
  connectToAgent: (agentId: string) => Promise<void>
  disconnectFromAgent: (agentId: string) => void
  sendMessageToAgent: (
    agentId: string,
    sessionId: string,
    content: string,
    onEvent?: (event: EventItem) => void
  ) => Promise<any[]>
  createNewSession: (agentId: string) => Promise<Session>
}

// 辅助函数：查找当前流式 assistant 消息
function getStreamingAssistant(get: () => StoreState) {
  const cid = get().currentConversationId
  if (!cid) return null
  const conversation = get().conversations.find(c => c.id === cid)
  if (!conversation) return null
  const message = conversation.messages.find(m => m.role === 'assistant' && m.isStreaming)
  if (!message) return null
  return { cid, message }
}

// 辅助函数：WebSocket 事件处理器
function createEventHandler(get: () => StoreState) {
  // 捕获创建时的会话 ID，避免错误事件到达时 currentConversationId 已变更
  const conversationId = get().currentConversationId
  return (event: EventItem) => {
    console.log(`[WS] type: ${event.type}`)

    switch (event.type) {
      case 'message.delta': {
        if (event.payload?.delta) {
          const found = getStreamingAssistant(get)
          if (found) {
            get().updateMessage(found.cid, found.message.id, {
              content: (found.message.content || '') + event.payload.delta,
            })
          }
        }
        break
      }
      case 'message.completed': {
        if (event.payload?.text) {
          const found = getStreamingAssistant(get)
          if (found) {
            get().updateMessage(found.cid, found.message.id, {
              content: event.payload.text,
              isStreaming: false,
            })
            get().setStreaming(found.cid, false)
          }
        }
        break
      }
      case 'tool.call.started': {
        if (event.payload?.tool_name) {
          const found = getStreamingAssistant(get)
          if (found) {
            const toolCall = {
              id: event.payload.tool_call_id || generateUUID(),
              name: event.payload.tool_name,
              status: 'running' as const,
              input: event.payload.arguments,
            }
            get().updateMessage(found.cid, found.message.id, {
              toolCalls: [...(found.message.toolCalls || []), toolCall],
            })
          }
        }
        break
      }
      case 'tool.call.response': {
        const payload = event.payload
        if (payload?.tool_call_id) {
          const found = getStreamingAssistant(get)
          if (found && found.message.toolCalls) {
            const updatedToolCalls = found.message.toolCalls.map(toolCall => {
              if (toolCall.id === payload.tool_call_id) {
                return {
                  ...toolCall,
                  status: 'completed' as const,
                  output: payload.content,
                  error: payload.is_error ? payload.content : undefined,
                  duration: payload.duration,
                }
              }
              return toolCall
            })
            get().updateMessage(found.cid, found.message.id, {
              toolCalls: updatedToolCalls,
            })
          }
        }
        break
      }
      case 'usage.updated':
        console.log('Usage updated:', event.payload)
        break
      case 'stream.error':
      case 'client.error': {
        console.error('Error event:', event.payload)
        get().setStreaming(conversationId, false)
        break
      }
      default:
        console.log('Unknown event type:', event.type)
    }
  }
}

export const createConnectionSlice: StateCreator<StoreState, [], [], ConnectionSlice> = (
  set,
  get
) => ({
  wsConnections: {},
  isConnecting: false,
  connectionError: null,
  _stoppingInProgress: false,

  createNewSession: async (agentId: string) => {
    let session: Session

    if (appConfig.app.useMockData) {
      const now = new Date().toISOString()
      session = {
        id: generateUUID(),
        agentId,
        status: SessionStatus.ACTIVE,
        contextInitialized: true,
        runtimeType: 'openclaw',
        createdAt: now,
        updatedAt: now,
      }
    } else {
      session = await sessionService.createSession(agentId)
    }

    return session
  },

  connectToAgent: async (agentId: string) => {
    set({ isConnecting: true, connectionError: null })

    try {
      const currentConvId = get().currentConversationId
      const currentConv = currentConvId
        ? get().conversations.find(c => c.id === currentConvId)
        : null
      let sessionId: string

      if (currentConv?.sessionId) {
        sessionId = currentConv.sessionId
      } else {
        const session = await get().createNewSession(agentId)
        sessionId = session.id
      }

      const wsClient = messageService.connectForMessages(
        agentId,
        sessionId,
        createEventHandler(get),
        error => {
          set({
            connectionError: String(error?.message ?? error),
            isConnecting: false,
          })
          get().setStreaming(currentConvId, false)
        }
      )

      set(state => {
        const wsConnections = { ...state.wsConnections }
        wsConnections[agentId] = wsClient
        return { wsConnections, isConnecting: false }
      })
    } catch (error: any) {
      set({
        isConnecting: false,
        connectionError: String(error?.message ?? error),
      })
    }
  },

  disconnectFromAgent: (agentId: string) => {
    messageService.disconnect(agentId)
    set(state => {
      const wsConnections = { ...state.wsConnections }
      if (wsConnections[agentId]) {
        const wsClient = wsConnections[agentId]
        wsClient.close()
        delete wsConnections[agentId]
      }
      return { wsConnections }
    })
  },

  sendMessageToAgent: async (
    agentId: string,
    sessionId: string,
    content: string,
    onEvent?: (event: EventItem) => void
  ) => {
    if (!sessionId) {
      throw new Error('No active session for agent')
    }

    if (!get().wsConnections[agentId]) {
      throw new Error(`WebSocket connection not established for agent "${agentId}". `)
    }

    try {
      const events = await messageService.sendMessage(agentId, sessionId, content, onEvent)
      return events
    } catch (error) {
      console.error('Error sending message:', error)
      throw error
    }
  },
})
