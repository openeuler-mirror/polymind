import { create } from 'zustand'
import { createConnectionSlice, type ConnectionSlice } from '../connection-store'
import { createChatSlice, type ChatSlice } from '../chat-store'
import { createAgentSlice, type AgentSlice } from '../agent-store'
import { createSettingsSlice, type SettingsSlice } from '../settings-store'
import { createUISlice, type UISlice } from '../ui-store'

jest.mock('@/services/message-service', () => ({
  messageService: {
    sendMessage: jest.fn(),
    abortMessage: jest.fn(),
    reconnectStream: jest.fn(),
    disconnectAll: jest.fn(),
    replyQuestion: jest.fn(),
    rejectQuestion: jest.fn(),
  },
}))

type TestState = ChatSlice & AgentSlice & ConnectionSlice & SettingsSlice & UISlice

const useTestStore = create<TestState>()((...a) => ({
  ...createChatSlice(...a),
  ...createAgentSlice(...a),
  ...createConnectionSlice(...a),
  ...createSettingsSlice(...a),
  ...createUISlice(...a),
}))

describe('ConnectionSlice', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useTestStore.setState({
      _stoppingInProgress: false,
    })
  })

  it('should have correct initial state', () => {
    const state = useTestStore.getState()
    expect(state._stoppingInProgress).toBe(false)
  })

  it('should throw error when sendMessageToAgent called without sessionId', async () => {
    await expect(useTestStore.getState().sendMessageToAgent('agent-1', '', 'test')).rejects.toThrow(
      'No active session for agent'
    )
  })
})
