jest.mock('@/services/session-service', () => ({
  sessionService: {
    createSession: jest.fn(),
    deleteSession: jest.fn().mockResolvedValue(undefined),
    getConversations: jest.fn(),
    getConversation: jest.fn(),
    updateConversation: jest.fn().mockResolvedValue(undefined),
    transformConversationSummary: jest.fn(),
    transformMessage: jest.fn(),
  },
}))

jest.mock('@/services/message-service', () => ({
  messageService: {
    abortMessage: jest.fn(),
  },
}))

jest.mock('../../cache', () => {
  const actual = jest.requireActual('../../cache')
  return {
    ...actual,
    cacheDelete: jest.fn(),
    cacheSetAll: jest.fn(),
    cacheGetAll: jest.fn(),
  }
})

jest.mock('@/app/config', () => ({
  appConfig: {
    app: {
      useMockData: false,
    },
  },
}))

import { create } from 'zustand'
import { createChatSlice, type ChatSlice } from '../chat-store'
import { createAgentSlice, type AgentSlice } from '../agent-store'
import { createConnectionSlice, type ConnectionSlice } from '../connection-store'
import { createSettingsSlice, type SettingsSlice } from '../settings-store'
import { createUISlice, type UISlice } from '../ui-store'
import { MessageStatus, SessionStatus } from '../../types'
import { sessionService } from '@/services/session-service'
import { messageService } from '@/services/message-service'
import { CACHE_KEYS, cacheDelete } from '../../cache'

type TestState = ChatSlice & AgentSlice & ConnectionSlice & SettingsSlice & UISlice

const useTestStore = create<TestState>()((...a) => ({
  ...createChatSlice(...a),
  ...createAgentSlice(...a),
  ...createConnectionSlice(...a),
  ...createSettingsSlice(...a),
  ...createUISlice(...a),
}))

function seedConversation(overrides: Record<string, any> = {}) {
  const conv = {
    id: 'conv-1',
    title: 'Test Conversation',
    messages: [] as any[],
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    agentId: 'agent-1',
    agentName: 'Test Agent',
    sessionId: 'session-1',
    isStreaming: false,
    ...overrides,
  }
  useTestStore.setState({ conversations: [conv] })
  return conv
}

function makeConversation(id: string, scheduledTaskId?: string) {
  return {
    id,
    title: 'Test Conversation',
    messages: [] as any[],
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    agentId: 'agent-1',
    sessionId: `session-${id}`,
    isStreaming: false,
    ...(scheduledTaskId ? { scheduledTaskId } : {}),
  }
}

describe('ChatSlice', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Provide a minimal browser-like window so syncUrlParams doesn't throw
    ;(global as any).window = {
      location: { search: '', pathname: '/' },
      history: { replaceState: jest.fn() },
    }
    useTestStore.setState({
      conversations: [],
      currentConversationId: null,
      currentAgentId: null,
      _stoppingInProgress: false,
    })
  })

  afterEach(() => {
    delete (global as any).window
  })

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = useTestStore.getState()
      expect(state.conversations).toEqual([])
      expect(state.currentConversationId).toBeNull()
    })
  })

  describe('createLocalConversation', () => {
    it('should create a local conversation and set it as current', () => {
      const id = useTestStore.getState().createLocalConversation('agent-1', 'My Agent')

      expect(id).toBeTruthy()
      const state = useTestStore.getState()
      expect(state.conversations.length).toBe(1)
      expect(state.conversations[0].agentId).toBe('agent-1')
      expect(state.conversations[0].agentName).toBe('My Agent')
      expect(state.conversations[0].title).toBe('新对话')
      expect(state.conversations[0].isStreaming).toBe(false)
      expect(state.currentConversationId).toBe(id)
    })

    it('should attach an existing session when provided', () => {
      const id = useTestStore.getState().createLocalConversation('agent-1', 'My Agent', 'sess-1')

      const state = useTestStore.getState()
      expect(state.conversations[0].id).toBe(id)
      expect(state.conversations[0].sessionId).toBe('sess-1')
      expect(state.currentConversationId).toBe(id)
    })

    it('should prepend new conversation to existing ones', () => {
      seedConversation({ id: 'old-conv' })
      useTestStore.getState().createLocalConversation('agent-2')

      const state = useTestStore.getState()
      expect(state.conversations.length).toBe(2)
      expect(state.conversations[0].agentId).toBe('agent-2')
    })
  })

  describe('markConversationScheduled', () => {
    it('should attach the scheduled task id to the conversation', () => {
      const id = useTestStore.getState().createLocalConversation('agent-1', 'My Agent')

      useTestStore.getState().markConversationScheduled(id, 'task-1')

      expect(useTestStore.getState().conversations[0].scheduledTaskId).toBe('task-1')
    })

    it('should be a noop for unknown conversation', () => {
      seedConversation()
      useTestStore.getState().markConversationScheduled('missing', 'task-1')

      expect(useTestStore.getState().conversations[0].scheduledTaskId).toBeUndefined()
    })
  })

  describe('purgeConversationsByScheduledTask', () => {
    beforeEach(() => {
      const { cacheDelete } = require('../../cache') as { cacheDelete: jest.Mock }
      cacheDelete.mockClear()
    })

    it('should remove all conversations belonging to the task', () => {
      useTestStore.setState({
        conversations: [
          makeConversation('sched-1', 'task-1'),
          makeConversation('sched-2', 'task-1'),
          makeConversation('regular-1'),
        ],
      })

      useTestStore.getState().purgeConversationsByScheduledTask('task-1')

      const conversations = useTestStore.getState().conversations
      expect(conversations.map(c => c.id)).toEqual(['regular-1'])
    })

    it('should invalidate the conversations cache', () => {
      const { cacheDelete } = require('../../cache') as { cacheDelete: jest.Mock }
      useTestStore.setState({
        conversations: [makeConversation('sched-1', 'task-1')],
      })

      useTestStore.getState().purgeConversationsByScheduledTask('task-1')

      expect(cacheDelete).toHaveBeenCalledWith('conv_names')
    })

    it('should fall back to the next conversation when purging the current one', () => {
      useTestStore.setState({
        conversations: [makeConversation('sched-1', 'task-1'), makeConversation('regular-1')],
        currentConversationId: 'sched-1',
        currentAgentId: 'agent-1',
      })

      useTestStore.getState().purgeConversationsByScheduledTask('task-1')

      const state = useTestStore.getState()
      expect(state.currentConversationId).toBe('regular-1')
      expect(state.conversations.map(c => c.id)).toEqual(['regular-1'])
    })

    it('should be a noop when no conversation matches', () => {
      useTestStore.setState({
        conversations: [makeConversation('regular-1')],
        currentConversationId: 'regular-1',
      })

      useTestStore.getState().purgeConversationsByScheduledTask('task-1')

      expect(useTestStore.getState().currentConversationId).toBe('regular-1')
    })
  })

  describe('createConversation', () => {
    it('should create a conversation without agentId', async () => {
      const id = await useTestStore.getState().createConversation()

      expect(id).toBeTruthy()
      const state = useTestStore.getState()
      expect(state.conversations.length).toBe(1)
      expect(state.conversations[0].agentId).toBeUndefined()
      expect(state.currentConversationId).toBe(id)
    })

    it('should create a conversation with agentId and call createNewSession', async () => {
      const mockSession = { id: 'new-session', agentId: 'agent-1', status: SessionStatus.ACTIVE }
      ;(sessionService.createSession as jest.Mock).mockResolvedValue(mockSession)

      const id = await useTestStore.getState().createConversation('agent-1', 'My Agent')

      const state = useTestStore.getState()
      expect(state.conversations[0].sessionId).toBe('new-session')
      expect(state.conversations[0].agentId).toBe('agent-1')
      expect(state.currentAgentId).toBe('agent-1')
    })

    it('should still create conversation if session creation fails', async () => {
      ;(sessionService.createSession as jest.Mock).mockRejectedValue(new Error('Failed'))

      const id = await useTestStore.getState().createConversation('agent-1', 'My Agent')

      const state = useTestStore.getState()
      expect(state.conversations.length).toBe(1)
      expect(state.conversations[0].sessionId).toBeUndefined()
    })
  })

  describe('setCurrentConversation', () => {
    it('should set currentConversationId and switch currentAgentId', () => {
      seedConversation({ agentId: 'agent-1' })

      useTestStore.getState().setCurrentConversation('conv-1')

      const state = useTestStore.getState()
      expect(state.currentConversationId).toBe('conv-1')
      expect(state.currentAgentId).toBe('agent-1')
    })

    it('should not change currentAgentId if conversation has no agentId', () => {
      seedConversation({ agentId: undefined })

      useTestStore.setState({ currentAgentId: 'existing-agent' })
      useTestStore.getState().setCurrentConversation('conv-1')

      const state = useTestStore.getState()
      expect(state.currentConversationId).toBe('conv-1')
      expect(state.currentAgentId).toBe('existing-agent')
    })
  })

  describe('deleteConversation', () => {
    it('should remove a conversation', async () => {
      seedConversation()

      await useTestStore.getState().deleteConversation('conv-1')

      expect(useTestStore.getState().conversations.length).toBe(0)
    })

    it('should clear currentConversationId if deleting current', async () => {
      seedConversation()
      useTestStore.setState({ currentConversationId: 'conv-1' })

      await useTestStore.getState().deleteConversation('conv-1')

      expect(useTestStore.getState().currentConversationId).toBeNull()
    })

    it('should fallback to next conversation if deleting current', async () => {
      useTestStore.setState({
        conversations: [
          {
            id: 'conv-1',
            title: 'First',
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            agentId: 'agent-1',
          },
          {
            id: 'conv-2',
            title: 'Second',
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        currentConversationId: 'conv-1',
      })

      await useTestStore.getState().deleteConversation('conv-1')

      expect(useTestStore.getState().currentConversationId).toBe('conv-2')
    })

    it('should call sessionService.deleteSession for conversations with sessionId', async () => {
      seedConversation({ sessionId: 'sess-1', agentId: 'agent-1' })

      await useTestStore.getState().deleteConversation('conv-1')

      expect(sessionService.deleteSession).toHaveBeenCalledWith('agent-1', 'sess-1')
    })

    it('should keep local conversation and return false when deleteSession fails', async () => {
      seedConversation({ sessionId: 'sess-1', agentId: 'agent-1' })
      useTestStore.setState({ currentConversationId: 'conv-1' })
      ;(sessionService.deleteSession as jest.Mock).mockRejectedValue(new Error('Network error'))

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      const deleted = await useTestStore.getState().deleteConversation('conv-1')

      // 确认式删除：后端失败时本地条目保留，等待用户重试
      expect(deleted).toBe(false)
      expect(useTestStore.getState().conversations.length).toBe(1)
      expect(useTestStore.getState().currentConversationId).toBe('conv-1')

      // Error is logged without crashing
      expect(consoleSpy).toHaveBeenCalledWith('Failed to delete session:', expect.any(Error))

      consoleSpy.mockRestore()
    })

    it('should return true and remove local conversation when deleteSession succeeds', async () => {
      seedConversation({ sessionId: 'sess-1', agentId: 'agent-1' })
      ;(sessionService.deleteSession as jest.Mock).mockResolvedValue(undefined)

      const deleted = await useTestStore.getState().deleteConversation('conv-1')

      expect(deleted).toBe(true)
      expect(useTestStore.getState().conversations.length).toBe(0)
    })
  })

  describe('addMessage', () => {
    it('should add a message to a conversation', () => {
      seedConversation()

      const msg = {
        id: 'msg-1',
        role: 'user' as const,
        content: 'Hello world',
        timestamp: new Date(),
      }
      useTestStore.getState().addMessage('conv-1', msg)

      const conv = useTestStore.getState().conversations[0]
      expect(conv.messages.length).toBe(1)
      expect(conv.messages[0].content).toBe('Hello world')
    })

    it('should auto-title from first user message', () => {
      seedConversation({ title: '新对话', messages: [] })

      const msg = {
        id: 'msg-1',
        role: 'user' as const,
        content: 'This is a very long message that should be truncated',
        timestamp: new Date(),
      }
      useTestStore.getState().addMessage('conv-1', msg)

      const conv = useTestStore.getState().conversations[0]
      expect(conv.title).toBe('This is a very long message th...')
    })

    it('should not rename if not first user message', () => {
      const existingMsg = {
        id: 'existing',
        role: 'user' as const,
        content: 'First',
        timestamp: new Date(),
      }
      seedConversation({ title: 'Existing Title', messages: [existingMsg] })

      const msg = {
        id: 'msg-2',
        role: 'user' as const,
        content: 'Second message',
        timestamp: new Date(),
      }
      useTestStore.getState().addMessage('conv-1', msg)

      const conv = useTestStore.getState().conversations[0]
      expect(conv.title).toBe('Existing Title')
    })

    it('should move updated conversation to top', () => {
      useTestStore.setState({
        conversations: [
          {
            id: 'conv-new',
            title: 'New',
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'conv-old',
            title: 'Old',
            messages: [],
            createdAt: new Date('2020-01-01'),
            updatedAt: new Date('2020-01-01'),
          },
        ],
      })

      const msg = {
        id: 'msg-1',
        role: 'user' as const,
        content: 'Hello',
        timestamp: new Date(),
      }
      useTestStore.getState().addMessage('conv-old', msg)

      const state = useTestStore.getState()
      expect(state.conversations[0].id).toBe('conv-old')
    })

    it('should be a noop for unknown conversation', () => {
      seedConversation()

      const msg = {
        id: 'msg-1',
        role: 'user' as const,
        content: 'Hello',
        timestamp: new Date(),
      }
      useTestStore.getState().addMessage('nonexistent', msg)

      // State should be unchanged
      expect(useTestStore.getState().conversations[0].messages.length).toBe(0)
    })
  })

  describe('updateMessage', () => {
    it('should update a message with partial data', () => {
      const msg = { id: 'msg-1', role: 'assistant' as const, content: 'old', timestamp: new Date() }
      seedConversation({ messages: [msg] })

      useTestStore.getState().updateMessage('conv-1', 'msg-1', { content: 'new' })

      const conv = useTestStore.getState().conversations[0]
      expect(conv.messages[0].content).toBe('new')
    })

    it('should update a message with function updater', () => {
      const msg = {
        id: 'msg-1',
        role: 'assistant' as const,
        content: 'old',
        isStreaming: true,
        timestamp: new Date(),
      }
      seedConversation({ messages: [msg] })

      useTestStore.getState().updateMessage('conv-1', 'msg-1', m => ({
        content: m.content + '!',
        isStreaming: false,
      }))

      const conv = useTestStore.getState().conversations[0]
      expect(conv.messages[0].content).toBe('old!')
      expect(conv.messages[0].isStreaming).toBe(false)
    })

    it('should sync conversation status when message status changes', () => {
      const msg = {
        id: 'msg-1',
        role: 'assistant' as const,
        content: '',
        isStreaming: true,
        status: MessageStatus.GENERATING,
        timestamp: new Date(),
      }
      seedConversation({ messages: [msg], isStreaming: true })

      useTestStore
        .getState()
        .updateMessage('conv-1', 'msg-1', { isStreaming: false, status: MessageStatus.COMPLETED })

      const conv = useTestStore.getState().conversations[0]
      expect(conv.messages[0].status).toBe(MessageStatus.COMPLETED)
      expect(conv.lastMessageStatus).toBe(MessageStatus.COMPLETED)
      expect(conv.updatedAt.getTime()).toBeGreaterThan(new Date('2025-01-01').getTime())
    })
  })

  describe('deleteMessage', () => {
    it('should delete a message from a conversation', () => {
      const msg1 = { id: 'msg-1', role: 'user' as const, content: 'Hello', timestamp: new Date() }
      const msg2 = { id: 'msg-2', role: 'assistant' as const, content: 'Hi', timestamp: new Date() }
      seedConversation({ messages: [msg1, msg2] })

      useTestStore.getState().deleteMessage('conv-1', 'msg-1')

      const conv = useTestStore.getState().conversations[0]
      expect(conv.messages.length).toBe(1)
      expect(conv.messages[0].id).toBe('msg-2')
    })
  })

  describe('setStreaming', () => {
    it('should set isStreaming on a conversation', () => {
      seedConversation({ isStreaming: false })

      useTestStore.getState().setStreaming('conv-1', true)

      expect(useTestStore.getState().conversations[0].isStreaming).toBe(true)
    })

    it('should be a noop for null conversationId', () => {
      seedConversation()

      useTestStore.getState().setStreaming(null, true)

      expect(useTestStore.getState().conversations[0].isStreaming).toBe(false)
    })
  })

  describe('stopStreaming', () => {
    it('should be a noop if no current conversation', () => {
      useTestStore.getState().stopStreaming()
      expect(messageService.abortMessage).not.toHaveBeenCalled()
    })

    it('should be a noop if already stopping', () => {
      seedConversation()
      useTestStore.setState({ currentConversationId: 'conv-1', _stoppingInProgress: true })

      useTestStore.getState().stopStreaming()

      expect(messageService.abortMessage).not.toHaveBeenCalled()
    })

    it('should call abortMessage and mark streaming messages as interrupted', () => {
      const assistantMsg = {
        id: 'msg-1',
        role: 'assistant' as const,
        content: 'streaming...',
        isStreaming: true,
        timestamp: new Date(),
      }
      seedConversation({ messages: [assistantMsg], agentId: 'agent-1', sessionId: 'sess-1' })
      useTestStore.setState({ currentConversationId: 'conv-1', currentAgentId: 'agent-1' })

      useTestStore.getState().stopStreaming()

      expect(messageService.abortMessage).toHaveBeenCalledWith('agent-1', 'sess-1')

      const conv = useTestStore.getState().conversations[0]
      expect(conv.isStreaming).toBe(false)
      expect(conv.messages[0].isStreaming).toBe(false)
      expect(conv.messages[0].status).toBe(MessageStatus.INTERRUPTED)
    })

    it('should interrupt running tool calls', () => {
      const assistantMsg = {
        id: 'msg-1',
        role: 'assistant' as const,
        content: 'working...',
        timestamp: new Date(),
        toolCalls: [
          { id: 'tc-1', name: 'search', status: 'running' as const },
          { id: 'tc-2', name: 'read', status: 'completed' as const },
        ],
      }
      seedConversation({ messages: [assistantMsg], agentId: 'agent-1' })
      useTestStore.setState({ currentConversationId: 'conv-1' })

      useTestStore.getState().stopStreaming()

      const conv = useTestStore.getState().conversations[0]
      const tc1 = conv.messages[0].toolCalls?.find((t: any) => t.id === 'tc-1')
      const tc2 = conv.messages[0].toolCalls?.find((t: any) => t.id === 'tc-2')
      expect(tc1?.status).toBe('error')
      expect(tc2?.status).toBe('completed')
    })
  })

  describe('updateConversationTitle', () => {
    it('should update the title and move conversation to top', () => {
      useTestStore.setState({
        conversations: [
          {
            id: 'conv-new',
            title: 'New',
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'conv-old',
            title: 'Old',
            messages: [],
            createdAt: new Date('2020-01-01'),
            updatedAt: new Date('2020-01-01'),
          },
        ],
      })

      useTestStore.getState().updateConversationTitle('conv-old', 'Updated Title')

      const state = useTestStore.getState()
      expect(state.conversations[0].id).toBe('conv-old')
      expect(state.conversations[0].title).toBe('Updated Title')
    })

    it('should persist title update to backend', () => {
      seedConversation({ agentId: 'agent-1', sessionId: 'sess-1' })

      useTestStore.getState().updateConversationTitle('conv-1', 'New Title')

      expect(sessionService.updateConversation).toHaveBeenCalledWith('agent-1', 'sess-1', {
        title: 'New Title',
      })
    })

    it('should be a noop for unknown id', () => {
      seedConversation()

      useTestStore.getState().updateConversationTitle('nonexistent', 'Title')

      // No error thrown, state unchanged
      expect(useTestStore.getState().conversations[0].title).toBe('Test Conversation')
    })
  })

  describe('togglePinConversation', () => {
    it('should toggle pinned state', () => {
      seedConversation({ pinned: false })

      useTestStore.getState().togglePinConversation('conv-1')

      expect(useTestStore.getState().conversations[0].pinned).toBe(true)

      useTestStore.getState().togglePinConversation('conv-1')

      expect(useTestStore.getState().conversations[0].pinned).toBe(false)
    })

    it('should persist pin to backend', () => {
      seedConversation({ agentId: 'agent-1', sessionId: 'sess-1', pinned: false })

      useTestStore.getState().togglePinConversation('conv-1')

      expect(sessionService.updateConversation).toHaveBeenCalledWith('agent-1', 'sess-1', {
        pinned: true,
      })
    })

    it('should handle undefined pinned as false', () => {
      seedConversation({ pinned: undefined })

      useTestStore.getState().togglePinConversation('conv-1')

      expect(useTestStore.getState().conversations[0].pinned).toBe(true)
    })
  })

  describe('fetchConversations', () => {
    it('should fetch and merge conversations', async () => {
      const summaries = [
        {
          id: 'sess-new',
          title: 'New Conv',
          agent_id: 'agent-1',
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
        },
      ]
      ;(sessionService.getConversations as jest.Mock).mockResolvedValue(summaries)
      ;(sessionService.transformConversationSummary as jest.Mock).mockReturnValue({
        id: 'conv-new',
        title: 'New Conv',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        sessionId: 'sess-new',
        agentId: 'agent-1',
      })

      useTestStore.setState({
        agents: [
          {
            id: 'agent-1',
            name: 'Agent 1',
            adapterType: 'opencode',
            sandboxType: 'docker',
            status: 'running',
            idleTimeoutSeconds: 300,
            createdAt: '2025-01-01',
            updatedAt: '2025-01-01',
          },
        ] as any,
        conversations: [
          {
            id: 'conv-existing',
            title: 'Existing',
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            sessionId: 'sess-existing',
          },
        ],
      })

      await useTestStore.getState().fetchConversations('agent-1')

      const state = useTestStore.getState()
      expect(state.conversations.length).toBe(2)
    })

    it('should deduplicate by id and sessionId', async () => {
      seedConversation({ sessionId: 'sess-1' })
      const summaries = [
        {
          id: 'sess-1',
          title: 'Duplicate',
          agent_id: 'agent-1',
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
        },
      ]
      ;(sessionService.getConversations as jest.Mock).mockResolvedValue(summaries)
      ;(sessionService.transformConversationSummary as jest.Mock).mockReturnValue({
        id: 'sess-1',
        title: 'Duplicate',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        sessionId: 'sess-1',
      })

      await useTestStore.getState().fetchConversations('agent-1')

      expect(useTestStore.getState().conversations.length).toBe(1)
    })

    it('should handle errors gracefully', async () => {
      ;(sessionService.getConversations as jest.Mock).mockRejectedValue(new Error('Network error'))

      await useTestStore.getState().fetchConversations('agent-1')

      // State unchanged, no crash
      expect(useTestStore.getState().conversations.length).toBe(0)
    })
  })

  describe('refreshConversation', () => {
    it('should update existing conversation messages', async () => {
      seedConversation({ sessionId: 'sess-1' })
      const detail = {
        messages: [{ id: 'msg-1', role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
        has_more: true,
        updated_at: '2025-06-01T00:00:00Z',
      }
      ;(sessionService.getConversation as jest.Mock).mockResolvedValue(detail)
      ;(sessionService.transformMessage as jest.Mock).mockReturnValue({
        id: 'msg-1',
        role: 'user',
        content: 'Hi',
        timestamp: new Date(),
      })

      await useTestStore.getState().refreshConversation('agent-1', 'sess-1')

      const state = useTestStore.getState()
      expect(state.conversations[0].messages.length).toBe(1)
      expect(state.conversations[0].hasMore).toBe(true)
      expect(state.currentConversationId).toBe('conv-1')
      expect(state.currentAgentId).toBe('agent-1')
    })

    it('should create a placeholder conversation if not existing', async () => {
      const detail = {
        title: 'Remote Conversation',
        messages: [],
        has_more: false,
        created_at: '2025-06-01T00:00:00Z',
        updated_at: '2025-06-01T00:00:00Z',
        pinned: true,
      }
      ;(sessionService.getConversation as jest.Mock).mockResolvedValue(detail)
      ;(sessionService.transformMessage as jest.Mock).mockReturnValue(null)

      await useTestStore.getState().refreshConversation('agent-1', 'sess-remote')

      const state = useTestStore.getState()
      expect(state.conversations.length).toBe(1)
      expect(state.conversations[0].sessionId).toBe('sess-remote')
      expect(state.conversations[0].pinned).toBe(true)
      expect(state.currentConversationId).toBe(state.conversations[0].id)
    })

    it('should handle errors gracefully', async () => {
      ;(sessionService.getConversation as jest.Mock).mockRejectedValue(new Error('Network error'))

      await useTestStore.getState().refreshConversation('agent-1', 'sess-1')

      // No crash
      expect(useTestStore.getState().conversations.length).toBe(0)
    })

    it('should keep streaming when backend has not persisted messages yet', async () => {
      seedConversation({ sessionId: 'sess-1', title: '旧标题' })
      useTestStore.setState({ currentConversationId: 'conv-1', currentAgentId: 'agent-1' })
      useTestStore.setState(state => ({
        conversations: state.conversations.map(c =>
          c.id === 'conv-1' ? { ...c, isStreaming: true } : c
        ),
      }))
      const detail = {
        title: '新标题',
        messages: [],
        has_more: false,
        updated_at: '2025-06-01T00:00:00Z',
      }
      ;(sessionService.getConversation as jest.Mock).mockResolvedValue(detail)
      ;(sessionService.transformMessage as jest.Mock).mockReturnValue(null)

      await useTestStore.getState().refreshConversation('agent-1', 'sess-1')

      const state = useTestStore.getState()
      expect(state.conversations[0].title).toBe('新标题')
      expect(state.conversations[0].messages).toHaveLength(0)
      expect(state.conversations[0].isStreaming).toBe(true)
      expect(state.currentConversationId).toBe('conv-1')
      expect(state.currentAgentId).toBe('agent-1')
    })

    it('should attach scheduled task meta to the placeholder conversation', async () => {
      const detail = {
        title: '每日报告',
        messages: [],
        has_more: false,
        created_at: '2025-06-01T00:00:00Z',
        updated_at: '2025-06-01T00:00:00Z',
      }
      ;(sessionService.getConversation as jest.Mock).mockResolvedValue(detail)
      ;(sessionService.transformMessage as jest.Mock).mockReturnValue(null)

      await useTestStore.getState().refreshConversation('agent-1', 'sess-remote', {
        scheduledTaskId: 'task-1',
        lastMessageStatus: MessageStatus.COMPLETED,
      })

      const conv = useTestStore.getState().conversations[0]
      expect(conv.scheduledTaskId).toBe('task-1')
      expect(conv.lastMessageStatus).toBe(MessageStatus.COMPLETED)
      // 定时任务会话的本地占位须带“定时”徽标，避免点击摘要后侧栏徽标消失。
      expect(conv.agentName).toBe('定时')
    })

    it('should not attach agentName to non-scheduled placeholder conversations', async () => {
      const detail = {
        title: '普通对话',
        messages: [],
        has_more: false,
        created_at: '2025-06-01T00:00:00Z',
        updated_at: '2025-06-01T00:00:00Z',
      }
      ;(sessionService.getConversation as jest.Mock).mockResolvedValue(detail)
      ;(sessionService.transformMessage as jest.Mock).mockReturnValue(null)

      await useTestStore.getState().refreshConversation('agent-1', 'sess-remote')

      const conv = useTestStore.getState().conversations[0]
      expect(conv.scheduledTaskId).toBeUndefined()
      expect(conv.agentName).toBeUndefined()
    })

    it('should update messages without switching current conversation when activate is false', async () => {
      seedConversation({ sessionId: 'sess-1', title: '旧标题' })
      useTestStore.setState({ currentConversationId: 'other-conv', currentAgentId: 'agent-other' })
      const detail = {
        title: '新标题',
        messages: [{ id: 'msg-1' }],
        has_more: false,
        updated_at: '2025-06-01T00:00:00Z',
      }
      ;(sessionService.getConversation as jest.Mock).mockResolvedValue(detail)
      ;(sessionService.transformMessage as jest.Mock).mockReturnValue({
        id: 'msg-1',
        role: 'assistant',
        content: 'hi',
        timestamp: new Date(),
      })

      await useTestStore.getState().refreshConversation('agent-1', 'sess-1', { activate: false })

      const state = useTestStore.getState()
      expect(state.conversations.find(c => c.sessionId === 'sess-1')?.messages).toHaveLength(1)
      expect(state.currentConversationId).toBe('other-conv')
      expect(state.currentAgentId).toBe('agent-other')
    })

    it('should not create a placeholder for background backfill when the conversation is missing', async () => {
      useTestStore.setState({ currentConversationId: 'other-conv', currentAgentId: 'agent-other' })
      const detail = {
        title: '远程会话',
        messages: [],
        has_more: false,
        created_at: '2025-06-01T00:00:00Z',
        updated_at: '2025-06-01T00:00:00Z',
      }
      ;(sessionService.getConversation as jest.Mock).mockResolvedValue(detail)
      ;(sessionService.transformMessage as jest.Mock).mockReturnValue(null)

      await useTestStore
        .getState()
        .refreshConversation('agent-1', 'sess-remote', { activate: false })

      // 后台回填时本地已无该会话（如刚随任务删除被清理），不得新建占位会话。
      const state = useTestStore.getState()
      expect(state.conversations.some(c => c.sessionId === 'sess-remote')).toBe(false)
      expect(state.currentConversationId).toBe('other-conv')
      expect(state.currentAgentId).toBe('agent-other')
    })
  })

  describe('loadMoreMessages', () => {
    it('should prepend older messages and deduplicate', async () => {
      const existingMsg = {
        id: 'msg-2',
        role: 'assistant' as const,
        content: 'latest',
        timestamp: new Date(),
      }
      seedConversation({ sessionId: 'sess-1', messages: [existingMsg] })

      const detail = {
        messages: [
          { id: 'msg-1', role: 'user', content: [{ type: 'text', text: 'older' }] },
          { id: 'msg-2', role: 'assistant', content: [{ type: 'text', text: 'latest' }] },
        ],
        has_more: false,
      }
      ;(sessionService.getConversation as jest.Mock).mockResolvedValue(detail)
      ;(sessionService.transformMessage as jest.Mock).mockImplementation((msg: any) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content?.[0]?.text || '',
        timestamp: new Date(),
      }))

      await useTestStore.getState().loadMoreMessages('agent-1', 'sess-1', 'before-ts')

      const conv = useTestStore.getState().conversations[0]
      expect(conv.messages.length).toBe(2)
      expect(conv.messages[0].id).toBe('msg-1')
      expect(conv.hasMore).toBe(false)
    })

    it('should not modify store if session is not in store', async () => {
      // The API call is made first, but state remains unchanged if session is unknown
      ;(sessionService.getConversation as jest.Mock).mockResolvedValue({
        messages: [],
        has_more: false,
      })

      await useTestStore.getState().loadMoreMessages('agent-1', 'unknown-session', 'before')

      expect(sessionService.getConversation).toHaveBeenCalledWith(
        'agent-1',
        'unknown-session',
        20,
        'before'
      )
      expect(useTestStore.getState().conversations.length).toBe(0)
    })

    it('should handle errors gracefully', async () => {
      seedConversation({ sessionId: 'sess-1' })
      ;(sessionService.getConversation as jest.Mock).mockRejectedValue(new Error('Network error'))

      await useTestStore.getState().loadMoreMessages('agent-1', 'sess-1', 'before')

      // No crash
      expect(useTestStore.getState().conversations[0].messages.length).toBe(0)
    })
  })

  describe('assignSessionToConversation', () => {
    it('should assign a sessionId to an existing conversation', () => {
      seedConversation({ sessionId: undefined })

      useTestStore.getState().assignSessionToConversation('conv-1', 'new-session')

      expect(useTestStore.getState().conversations[0].sessionId).toBe('new-session')
    })

    it('should be a noop for unknown conversation', () => {
      useTestStore.getState().assignSessionToConversation('nonexistent', 'sess')

      // No error
    })
  })

  describe('startNewTask', () => {
    it('should clear currentConversationId and set currentAgentId', () => {
      useTestStore.setState({ currentConversationId: 'conv-1', currentAgentId: 'old-agent' })

      useTestStore.getState().startNewTask('new-agent')

      const state = useTestStore.getState()
      expect(state.currentConversationId).toBeNull()
      expect(state.currentAgentId).toBe('new-agent')
    })
  })
})
