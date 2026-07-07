import { create } from 'zustand'
import { createConnectionSlice, type ConnectionSlice } from '../connection-store'
import { createChatSlice, type ChatSlice } from '../chat-store'
import { createSettingsSlice, type SettingsSlice } from '../settings-store'
import { createUISlice, type UISlice } from '../ui-store'

// Mock messageService before it gets imported by connection-store
jest.mock('@/services/message-service', () => ({
  messageService: {
    disconnect: jest.fn(),
    connectForMessages: jest.fn(),
    sendMessage: jest.fn(),
    abortMessage: jest.fn(),
    reconnectStream: jest.fn(),
    disconnectAll: jest.fn(),
  },
}))

import { messageService } from '@/services/message-service'

type TestState = ChatSlice & ConnectionSlice & SettingsSlice & UISlice

const useTestStore = create<TestState>()((...a) => ({
  ...createChatSlice(...a),
  ...createConnectionSlice(...a),
  ...createSettingsSlice(...a),
  ...createUISlice(...a),
}))

describe('ConnectionSlice', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useTestStore.setState({
      wsConnections: {},
      isConnecting: false,
      connectionError: null,
      _stoppingInProgress: false,
    })
  })

  it('should have correct initial state', () => {
    const state = useTestStore.getState()
    expect(state.wsConnections).toEqual({})
    expect(state.isConnecting).toBe(false)
    expect(state.connectionError).toBeNull()
    expect(state._stoppingInProgress).toBe(false)
  })

  it('should disconnect from agent and close websocket', () => {
    const mockClose = jest.fn()
    const mockWsClient = { close: mockClose } as any

    // Set up a mock websocket connection in the store
    useTestStore.setState({
      wsConnections: { 'agent-1': mockWsClient },
    })

    // Actually call the store's disconnectFromAgent method
    useTestStore.getState().disconnectFromAgent('agent-1')

    // Should call messageService.disconnect for the agent
    expect(messageService.disconnect).toHaveBeenCalledWith('agent-1')

    // Should close the websocket client
    expect(mockClose).toHaveBeenCalled()

    // Should remove the connection from store state
    expect(useTestStore.getState().wsConnections['agent-1']).toBeUndefined()
  })

  it('should throw error when sendMessageToAgent called without sessionId', async () => {
    await expect(useTestStore.getState().sendMessageToAgent('agent-1', '', 'test')).rejects.toThrow(
      'No active session for agent'
    )
  })
})
