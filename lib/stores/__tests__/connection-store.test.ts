import { create } from 'zustand'
import { createConnectionSlice, type ConnectionSlice } from '../connection-store'
import { createChatSlice, type ChatSlice } from '../chat-store'
import { createAgentSlice, type AgentSlice } from '../agent-store'
import { createSettingsSlice, type SettingsSlice } from '../settings-store'
import { createUISlice, type UISlice } from '../ui-store'
import { messageService } from '@/services/message-service'

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

  describe('replyQuestion', () => {
    const args: [string, string, string, string[][]] = [
      'agent-1',
      'session-1',
      'req-1',
      [['answer1']],
    ]

    it('should call messageService.replyQuestion with correct arguments', async () => {
      ;(messageService.replyQuestion as jest.Mock).mockResolvedValue(undefined)

      await useTestStore.getState().replyQuestion(...args)

      expect(messageService.replyQuestion).toHaveBeenCalledWith(...args)
    })

    it('should re-throw with console.error on failure', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      const error = new Error('Reply failed')
      ;(messageService.replyQuestion as jest.Mock).mockRejectedValue(error)

      await expect(useTestStore.getState().replyQuestion(...args)).rejects.toThrow('Reply failed')
      expect(consoleSpy).toHaveBeenCalledWith('Error replying to question:', error)

      consoleSpy.mockRestore()
    })
  })

  describe('rejectQuestion', () => {
    const args: [string, string, string] = ['agent-1', 'session-1', 'req-1']

    it('should call messageService.rejectQuestion with correct arguments', async () => {
      ;(messageService.rejectQuestion as jest.Mock).mockResolvedValue(undefined)

      await useTestStore.getState().rejectQuestion(...args)

      expect(messageService.rejectQuestion).toHaveBeenCalledWith(...args)
    })

    it('should re-throw with console.error on failure', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      const error = new Error('Reject failed')
      ;(messageService.rejectQuestion as jest.Mock).mockRejectedValue(error)

      await expect(useTestStore.getState().rejectQuestion(...args)).rejects.toThrow('Reject failed')
      expect(consoleSpy).toHaveBeenCalledWith('Error rejecting question:', error)

      consoleSpy.mockRestore()
    })
  })
})
