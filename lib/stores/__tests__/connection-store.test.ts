import { create } from 'zustand'
import { createConnectionSlice, type ConnectionSlice } from '../connection-store'
import { createChatSlice, type ChatSlice } from '../chat-store'
import { createAgentSlice, type AgentSlice } from '../agent-store'
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

  it('should disconnect from agent and clean up store state', () => {
    const mockWsClient = { close: jest.fn() } as any

    // Set up a mock websocket connection in the store
    useTestStore.setState({
      wsConnections: { 'agent-1': mockWsClient },
    })

    // Actually call the store's disconnectFromAgent method
    useTestStore.getState().disconnectFromAgent('agent-1')

    // Should delegate close to messageService (which handles wsClient.close internally)
    expect(messageService.disconnect).toHaveBeenCalledWith('agent-1')

    // Should remove the connection from store state
    expect(useTestStore.getState().wsConnections['agent-1']).toBeUndefined()
  })

  it('should throw error when sendMessageToAgent called without sessionId', async () => {
    await expect(useTestStore.getState().sendMessageToAgent('agent-1', '', 'test')).rejects.toThrow(
      'No active session for agent'
    )
  })
})
