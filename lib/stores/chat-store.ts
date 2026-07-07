import type { StateCreator } from 'zustand'
import type { Conversation, Message } from '../types'
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

const noop = () => {}
const asyncNoop = async () => {}

// Stub
export const createChatSlice: StateCreator<StoreState, [], [], ChatSlice> = () => ({
  conversations: [],
  currentConversationId: null,
  createConversation: async () => '',
  createLocalConversation: () => '',
  assignSessionToConversation: noop,
  startNewTask: noop,
  deleteConversation: asyncNoop,
  setCurrentConversation: noop,
  addMessage: noop,
  updateMessage: noop,
  deleteMessage: noop,
  setStreaming: noop,
  stopStreaming: noop,
  updateConversationTitle: noop,
  togglePinConversation: noop,
  fetchConversations: asyncNoop,
  refreshConversation: asyncNoop,
  loadMoreMessages: asyncNoop,
})
