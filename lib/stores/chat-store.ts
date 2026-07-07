import type { StateCreator } from 'zustand'
import type { Conversation, Message } from '../types'
import { MessageStatus } from '../types'
import { generateUUID } from '../utils'
import { cacheDelete, CACHE_KEYS } from '../cache'
import { appConfig } from '@/app/config'
import { sessionService } from '@/services/session-service'
import { messageService } from '@/services/message-service'
import { syncUrlParams, getUrlParam } from './utils'
import type { StoreState } from './index'

export interface ChatSlice {
  conversations: Conversation[]
  currentConversationId: string | null
  createConversation: (agentId?: string, agentName?: string) => Promise<string>
  createLocalConversation: (agentId: string, agentName?: string) => string
  assignSessionToConversation: (convId: string, sessionId: string) => void
  startNewTask: (agentId: string) => void
  deleteConversation: (id: string) => Promise<void>
  setCurrentConversation: (id: string) => void
  addMessage: (conversationId: string, message: Message) => void
  updateMessage: (
    conversationId: string,
    messageId: string,
    updates: Partial<Message> | ((message: Message) => Partial<Message>)
  ) => void
  deleteMessage: (conversationId: string, messageId: string) => void
  setStreaming: (conversationId: string | null, streaming: boolean) => void
  stopStreaming: () => void
  updateConversationTitle: (id: string, title: string) => void
  togglePinConversation: (id: string) => void
  fetchConversations: (agentId: string) => Promise<void>
  refreshConversation: (agentId: string, sessionId: string) => Promise<void>
  loadMoreMessages: (agentId: string, sessionId: string, before: string) => Promise<void>
}

/**
 * Chat slice — conversation & message management.
 *
 * Dependencies (must exist in the composed StoreState):
 * - AgentSlice:      provides `agents`, `currentAgentId`
 * - ConnectionSlice: provides `createNewSession`, `_stoppingInProgress`
 */
export const createChatSlice: StateCreator<StoreState, [], [], ChatSlice> = (set, get) => ({
  conversations: [],
  currentConversationId: null,

  createConversation: async (agentId, agentName) => {
    let sessionId: string | undefined
    if (agentId) {
      try {
        const session = await get().createNewSession(agentId)
        sessionId = session.id
      } catch (error) {
        console.error('Failed to create session:', error)
      }
    }

    const id = generateUUID()
    const newConversation: Conversation = {
      id,
      title: '新对话',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      agentId,
      agentName,
      sessionId,
      isStreaming: false,
    }
    cacheDelete(CACHE_KEYS.CONVERSATIONS_WITH_NAMES)
    syncUrlParams(agentId, sessionId)
    set(state => ({
      conversations: [newConversation, ...state.conversations],
      currentConversationId: id,
      ...(agentId ? { currentAgentId: agentId } : {}),
    }))
    return id
  },

  deleteConversation: async id => {
    const state = get()
    const conversation = state.conversations.find(c => c.id === id)

    if (conversation?.sessionId && conversation?.agentId) {
      try {
        if (!appConfig.app.useMockData) {
          await sessionService.deleteSession(conversation.agentId, conversation.sessionId)
        }
      } catch (error) {
        console.error('Failed to delete session:', error)
      }
    }

    cacheDelete(CACHE_KEYS.CONVERSATIONS_WITH_NAMES)

    // Compute URL sync params before set() so the reducer stays pure
    const prevState = get()
    const filtered = prevState.conversations.filter(c => c.id !== id)
    const newCurrentId =
      prevState.currentConversationId === id
        ? filtered[0]?.id || null
        : prevState.currentConversationId

    if (prevState.currentConversationId === id) {
      if (newCurrentId) {
        const newConv = filtered.find(c => c.id === newCurrentId)
        if (newConv) {
          syncUrlParams(newConv.agentId, newConv.sessionId)
        }
      } else {
        syncUrlParams(prevState.currentAgentId || undefined)
      }
    }

    set({
      conversations: filtered,
      currentConversationId: newCurrentId,
    })
  },

  deleteMessage: (conversationId, messageId) => {
    set(state => ({
      conversations: state.conversations.map(c =>
        c.id === conversationId
          ? {
              ...c,
              messages: c.messages.filter(m => m.id !== messageId),
            }
          : c
      ),
    }))
  },

  setCurrentConversation: id => {
    const conversation = get().conversations.find(c => c.id === id)
    if (conversation) {
      syncUrlParams(conversation.agentId, conversation.sessionId)
    }
    set({
      currentConversationId: id,
      ...(conversation?.agentId ? { currentAgentId: conversation.agentId } : {}),
    })
  },

  addMessage: (conversationId, message) => {
    const state = get()
    const conv = state.conversations.find(c => c.id === conversationId)
    if (!conv) return

    const isFirstMessage = conv.messages.length === 0 && message.role === 'user'
    const newTitle = isFirstMessage
      ? message.content.slice(0, 30) + (message.content.length > 30 ? '...' : '')
      : conv.title

    set(state => {
      const idx = state.conversations.findIndex(c => c.id === conversationId)
      if (idx === -1) return state
      const conv = state.conversations[idx]
      const updated = {
        ...conv,
        messages: [...conv.messages, message],
        updatedAt: new Date(),
        title: newTitle,
      }
      const next = [...state.conversations]
      next.splice(idx, 1)
      next.unshift(updated)
      return { conversations: next }
    })
  },

  updateMessage: (conversationId, messageId, updates) => {
    set(state => ({
      conversations: state.conversations.map(c =>
        c.id === conversationId
          ? {
              ...c,
              messages: c.messages.map(m =>
                m.id === messageId
                  ? { ...m, ...(typeof updates === 'function' ? updates(m) : updates) }
                  : m
              ),
            }
          : c
      ),
    }))
  },

  setStreaming: (conversationId, streaming) => {
    // conversationId may be null in error paths (connection-store.ts,
    // stream-event-handler.ts) where the current conversation has already
    // been cleared — silently no-op in those cases.
    if (!conversationId) return
    set(state => ({
      conversations: state.conversations.map(conv =>
        conv.id === conversationId ? { ...conv, isStreaming: streaming } : conv
      ),
    }))
  },

  stopStreaming: () => {
    const state = get()
    // Re-entrancy guard
    if (state._stoppingInProgress) return

    const conversationId = state.currentConversationId
    if (!conversationId) return

    const conversation = state.conversations.find(conv => conv.id === conversationId)
    const agentId = conversation?.agentId || state.currentAgentId
    if (agentId) {
      set({ _stoppingInProgress: true })
      messageService.abortMessage(agentId, conversation?.sessionId)
    }

    set(state => ({
      _stoppingInProgress: false,
      conversations: state.conversations.map(conv =>
        conv.id === conversationId
          ? {
              ...conv,
              isStreaming: false,
              messages: conv.messages.map(message =>
                message.role === 'assistant' &&
                (message.isStreaming ||
                  message.toolCalls?.some(toolCall => toolCall.status === 'running'))
                  ? {
                      ...message,
                      isStreaming: false,
                      status: MessageStatus.INTERRUPTED,
                      toolCalls: message.toolCalls?.map(toolCall =>
                        toolCall.status === 'running'
                          ? {
                              ...toolCall,
                              status: 'error' as const,
                              error: toolCall.error || '已停止生成',
                            }
                          : toolCall
                      ),
                      events: message.events?.map(event =>
                        event.toolCall?.status === 'running'
                          ? {
                              ...event,
                              toolCall: {
                                ...event.toolCall,
                                status: 'error' as const,
                                error: event.toolCall.error || '已停止生成',
                              },
                            }
                          : event
                      ),
                    }
                  : message
              ),
            }
          : conv
      ),
    }))
  },

  updateConversationTitle: (id, title) => {
    cacheDelete(CACHE_KEYS.CONVERSATIONS_WITH_NAMES)
    set(state => {
      const idx = state.conversations.findIndex(c => c.id === id)
      if (idx === -1) return state
      const updated = { ...state.conversations[idx], title, updatedAt: new Date() }
      const next = [...state.conversations]
      next.splice(idx, 1)
      next.unshift(updated)
      return { conversations: next }
    })
    const conv = get().conversations.find(c => c.id === id)
    if (conv?.agentId && conv?.sessionId) {
      sessionService
        .updateConversation(conv.agentId, conv.sessionId, { title })
        .catch(err => console.error('Failed to persist title:', err))
    }
  },

  togglePinConversation: id => {
    cacheDelete(CACHE_KEYS.CONVERSATIONS_WITH_NAMES)
    set(state => {
      const conv = state.conversations.find(c => c.id === id)
      const newPinned = !conv?.pinned
      if (conv?.agentId && conv?.sessionId) {
        sessionService
          .updateConversation(conv.agentId, conv.sessionId, { pinned: newPinned })
          .catch(err => console.error('Failed to persist pin:', err))
      }
      return {
        conversations: state.conversations.map(c =>
          c.id === id ? { ...c, pinned: newPinned } : c
        ),
      }
    })
  },

  fetchConversations: async agentId => {
    try {
      const summaries = await sessionService.getConversations(agentId)
      const agent = get().agents.find(a => a.id === agentId)
      const conversations = summaries.map((s: any) =>
        sessionService.transformConversationSummary(s, agent?.name)
      )
      set(state => {
        const existingIds = new Set(state.conversations.map(c => c.id))
        const existingSessionIds = new Set(
          state.conversations.map(c => c.sessionId).filter(Boolean)
        )
        const newConversations = conversations.filter(
          (c: Conversation) => !existingIds.has(c.id) && !existingSessionIds.has(c.sessionId)
        )
        return {
          conversations: [...newConversations, ...state.conversations],
        }
      })
    } catch (error) {
      console.error('Failed to fetch conversations:', error)
    }
  },

  refreshConversation: async (agentId, sessionId) => {
    try {
      const detail = await sessionService.getConversation(agentId, sessionId)
      const messages = (detail.messages || []).map((msg: any) =>
        sessionService.transformMessage(msg)
      )
      set(state => {
        const existing = state.conversations.find(c => c.sessionId === sessionId)
        if (existing) {
          return {
            conversations: state.conversations.map(c =>
              c.sessionId === sessionId
                ? {
                    ...c,
                    messages,
                    hasMore: detail.has_more ?? false,
                    updatedAt: new Date(detail.updated_at),
                  }
                : c
            ),
            currentConversationId: existing.id,
            currentAgentId: agentId,
          }
        }
        const placeholder: Conversation = {
          id: generateUUID(),
          title: detail.title || '新对话',
          messages,
          createdAt: new Date(detail.created_at),
          updatedAt: new Date(detail.updated_at),
          pinned: detail.pinned,
          agentId,
          sessionId,
          hasMore: detail.has_more ?? false,
        }
        return {
          conversations: [placeholder, ...state.conversations],
          currentConversationId: placeholder.id,
          currentAgentId: agentId,
        }
      })
    } catch (error) {
      console.error('Failed to refresh conversation:', error)
      const currentSessionId = getUrlParam('session')
      syncUrlParams(agentId, currentSessionId || undefined)
    }
  },

  loadMoreMessages: async (agentId, sessionId, before) => {
    try {
      const detail = await sessionService.getConversation(agentId, sessionId, 20, before)
      const olderMessages = (detail.messages || []).map((msg: any) =>
        sessionService.transformMessage(msg)
      )
      set(state => {
        const existing = state.conversations.find(c => c.sessionId === sessionId)
        if (!existing) return state
        const existingIds = new Set(existing.messages.map((m: Message) => m.id))
        const newMessages = olderMessages.filter((m: Message) => !existingIds.has(m.id))
        return {
          conversations: state.conversations.map(c =>
            c.sessionId === sessionId
              ? {
                  ...c,
                  messages: [...newMessages, ...c.messages],
                  hasMore: detail.has_more ?? false,
                }
              : c
          ),
        }
      })
    } catch (error) {
      console.error('Failed to load more messages:', error)
    }
  },

  createLocalConversation: (agentId, agentName) => {
    const id = generateUUID()
    syncUrlParams(agentId)
    set(state => ({
      conversations: [
        {
          id,
          title: '新对话',
          messages: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          agentId,
          agentName,
          isStreaming: false,
        },
        ...state.conversations,
      ],
      currentConversationId: id,
    }))
    return id
  },

  assignSessionToConversation: (convId, sessionId) => {
    const conv = get().conversations.find(c => c.id === convId)
    if (!conv) return
    syncUrlParams(conv.agentId, sessionId)
    set(state => ({
      conversations: state.conversations.map(c => (c.id === convId ? { ...c, sessionId } : c)),
    }))
  },

  startNewTask: agentId => {
    set({ currentConversationId: null, currentAgentId: agentId })
    syncUrlParams(agentId)
  },
})
