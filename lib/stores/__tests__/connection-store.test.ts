import { create } from 'zustand'
import { createStoreShape, type StoreState } from '../store-shape'
import { messageService } from '@/services/message-service'

jest.mock('@/services/message-service', () => ({
  messageService: {
    sendMessage: jest.fn(),
    regenerateMessage: jest.fn(),
    abortMessage: jest.fn(),
    reconnectStream: jest.fn(),
    disconnectAll: jest.fn(),
    replyQuestion: jest.fn(),
    rejectQuestion: jest.fn(),
  },
}))

const useTestStore = create<StoreState>()(createStoreShape)

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
  describe('regenerateAnswer', () => {
    const args: [string, string] = ['agent-1', 'session-1']

    it('should throw error when called without sessionId', async () => {
      await expect(useTestStore.getState().regenerateAnswer('agent-1', '')).rejects.toThrow(
        'No active session for agent'
      )
      expect(messageService.regenerateMessage).not.toHaveBeenCalled()
    })

    it('should call messageService.regenerateMessage with correct arguments', async () => {
      ;(messageService.regenerateMessage as jest.Mock).mockResolvedValue([])

      await useTestStore.getState().regenerateAnswer(...args)

      expect(messageService.regenerateMessage).toHaveBeenCalledWith(
        'agent-1',
        'session-1',
        undefined
      )
    })

    it('should re-throw with console.error on failure', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      const error = new Error('Regenerate failed')
      ;(messageService.regenerateMessage as jest.Mock).mockRejectedValue(error)

      await expect(useTestStore.getState().regenerateAnswer(...args)).rejects.toThrow(
        'Regenerate failed'
      )
      expect(consoleSpy).toHaveBeenCalledWith('Error regenerating answer:', error)

      consoleSpy.mockRestore()
    })
  })
})
