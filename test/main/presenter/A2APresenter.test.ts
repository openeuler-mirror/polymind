import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'
import { A2APresenter } from '../../../src/main/presenter/A2APresenter/index'
import { ServerManager } from '../../../src/main/presenter/A2APresenter/serverManager'
import { A2AClientAction } from '../../../src/main/presenter/A2APresenter/A2AClientAction'
import type {
  IConfigPresenter,
  AgentCardData,
  A2AClientData,
  A2AerrorResponse,
  A2AMessageSendParams,
  A2AServerResponse
} from '../../../src/shared/presenter'

// Mock dependencies
vi.mock('../../../src/main/presenter/A2APresenter/serverManager')
vi.mock('../../../src/main/presenter/A2APresenter/A2AClientAction')
vi.mock('@a2a-js/sdk/client', () => ({
  A2AClient: vi.fn()
}))

// Mock global fetch
global.fetch = vi.fn()

describe('A2APresenter', () => {
  let a2aPresenter: A2APresenter
  let mockConfigPresenter: IConfigPresenter
  let mockServerManager: ServerManager
  let mockA2AClientAction: A2AClientAction

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock config presenter
    mockConfigPresenter = {
      exportAgents: vi.fn().mockResolvedValue({
        agents: [
          {
            id: '1',
            name: 'Test Agent',
            a2aURL: 'https://example.com',
            provider: 'Test Provider'
          }
        ]
      }),
      importAgentFromA2AData: vi.fn().mockResolvedValue(undefined)
    } as unknown as IConfigPresenter

    // Mock ServerManager instance
    mockServerManager = {
      getA2AClient: vi.fn(),
      isA2AServerRunning: vi.fn(),
      addA2AServer: vi.fn(),
      fetchAgentCard: vi.fn(),
      removeA2AServer: vi.fn()
    } as unknown as ServerManager

    // Mock A2AClientAction instance
    mockA2AClientAction = {
      getAgentCard: vi.fn(),
      isConnected: vi.fn(),
      sendMessage: vi.fn(),
      sendStreamingMessage: vi.fn()
    } as unknown as A2AClientAction

    // Mock ServerManager constructor
    vi.mocked(ServerManager).mockImplementation(() => mockServerManager)

    a2aPresenter = new A2APresenter(mockConfigPresenter)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should create an instance with ServerManager', () => {
      expect(ServerManager).toHaveBeenCalledWith(mockConfigPresenter)
      expect(a2aPresenter).toBeInstanceOf(A2APresenter)
    })
  })

  describe('getA2AClient', () => {
    it('should return client data when server is running', async () => {
      const mockAgentCard = {
        name: 'Test Agent',
        description: 'Test Description',
        url: 'https://example.com',
        capabilities: { streaming: true },
        skills: [
          { name: 'skill1', description: 'description1' },
          { name: 'skill2', description: 'description2' }
        ],
        version: '1.0.0',
        provider: { organization: 'Test Org', url: 'https://example.org' },
        iconUrl: 'https://example.com/icon.png'
      }

      vi.mocked(mockServerManager.getA2AClient).mockResolvedValue(mockA2AClientAction)
      vi.mocked(mockA2AClientAction.getAgentCard).mockResolvedValue(mockAgentCard)
      vi.mocked(mockServerManager.isA2AServerRunning).mockResolvedValue(true)

      const result = await a2aPresenter.getA2AClient('https://example.com')

      expect(result).toEqual({
        isRunning: true,
        agentCard: {
          name: 'Test Agent',
          description: 'Test Description',
          url: 'https://example.com',
          streamingSupported: true,
          skills: [
            { name: 'skill1', description: 'description1' },
            { name: 'skill2', description: 'description2' }
          ],
          version: '1.0.0',
          provider: {
            organization: 'Test Org',
            url: 'https://example.org'
          },
          iconUrl: 'https://example.com/icon.png'
        }
      })
    })

    it('should return undefined when client is not found', async () => {
      vi.mocked(mockServerManager.getA2AClient).mockResolvedValue(undefined)

      const result = await a2aPresenter.getA2AClient('https://example.com')

      expect(result).toBeUndefined()
    })

    it('should handle missing skills gracefully', async () => {
      const mockAgentCard = {
        name: 'Test Agent',
        description: 'Test Description',
        url: 'https://example.com',
        capabilities: { streaming: false },
        skills: [],
        version: '1.0.0',
        provider: { organization: 'Test Org' },
        iconUrl: 'https://example.com/icon.png'
      }

      vi.mocked(mockServerManager.getA2AClient).mockResolvedValue(mockA2AClientAction)
      vi.mocked(mockA2AClientAction.getAgentCard).mockResolvedValue(mockAgentCard)
      vi.mocked(mockServerManager.isA2AServerRunning).mockResolvedValue(true)

      const result = await a2aPresenter.getA2AClient('https://example.com')

      expect(result?.agentCard.streamingSupported).toBe(false)
      expect(result?.agentCard.skills).toEqual([])
      expect(result?.agentCard.provider.organization).toBe('Test Org')
    })
  })

  describe('addA2AServer', () => {
    it('should add server successfully', async () => {
      const mockAgentCardData: AgentCardData = {
        name: 'Test Agent',
        description: 'Test Description',
        url: 'https://example.com',
        streamingSupported: true,
        skills: [{ name: 'skill1', description: 'description1' }],
        version: '1.0.0',
        provider: { organization: 'Test Org', url: 'https://example.org' },
        iconUrl: 'https://example.com/icon.png'
      }

      vi.mocked(mockServerManager.addA2AServer).mockResolvedValue(mockAgentCardData)

      const result = await a2aPresenter.addA2AServer('https://example.com')

      expect(result).toEqual(mockAgentCardData)
      expect(mockServerManager.addA2AServer).toHaveBeenCalledWith('https://example.com')
    })

    it('should handle errors when adding server fails', async () => {
      const error = new Error('Connection failed')
      vi.mocked(mockServerManager.addA2AServer).mockRejectedValue(error)

      const result = await a2aPresenter.addA2AServer('https://example.com')

      expect(result).toEqual({
        errorCode: '-1',
        errorMsg: 'Connection failed'
      })
    })
  })

  describe('fetchAgentCard', () => {
    it('should fetch agent card successfully', async () => {
      const mockAgentCardData: AgentCardData = {
        name: 'Test Agent',
        description: 'Test Description',
        url: 'https://example.com',
        streamingSupported: false,
        skills: [{ name: 'skill1', description: 'description1' }],
        version: '1.0.0',
        provider: { organization: 'Test Org', url: 'https://example.org' },
        iconUrl: 'https://example.com/icon.png'
      }

      vi.mocked(mockServerManager.fetchAgentCard).mockResolvedValue(mockAgentCardData)

      const result = await a2aPresenter.fetchAgentCard('https://example.com')

      expect(result).toEqual(mockAgentCardData)
      expect(mockServerManager.fetchAgentCard).toHaveBeenCalledWith('https://example.com')
    })

    it('should handle errors when fetching agent card fails', async () => {
      const error = new Error('Server not found')
      vi.mocked(mockServerManager.fetchAgentCard).mockRejectedValue(error)

      const result = await a2aPresenter.fetchAgentCard('https://example.com')

      expect(result).toEqual({
        errorCode: '-1',
        errorMsg: 'Server not found'
      })
    })
  })

  describe('removeA2AServer', () => {
    it('should remove server successfully', async () => {
      vi.mocked(mockServerManager.removeA2AServer).mockResolvedValue(true)

      const result = await a2aPresenter.removeA2AServer('https://example.com')

      expect(result).toBe(true)
      expect(mockServerManager.removeA2AServer).toHaveBeenCalledWith('https://example.com')
    })

    it('should handle errors when removing server fails', async () => {
      vi.mocked(mockServerManager.removeA2AServer).mockRejectedValue(new Error('Removal failed'))

      const result = await a2aPresenter.removeA2AServer('https://example.com')

      expect(result).toBe(false)
    })
  })

  describe('sendMessage', () => {
    it('should send non-streaming message successfully', async () => {
      const mockAgentCard = {
        capabilities: { streaming: false }
      }

      const mockMessage: A2AServerResponse = {
        taskId: 'task-123',
        status: 'completed',
        message: {
          role: 'assistant',
          content: 'Response message'
        }
      }

      const messageParams: A2AMessageSendParams = {
        messageId: 'msg-123',
        kind: 'message',
        role: 'user',
        parts: []
      }

      vi.mocked(mockServerManager.getA2AClient).mockResolvedValue(mockA2AClientAction)
      vi.mocked(mockA2AClientAction.getAgentCard).mockResolvedValue(mockAgentCard)
      vi.mocked(mockA2AClientAction.sendMessage).mockResolvedValue(mockMessage)

      const result = await a2aPresenter.sendMessage('https://example.com', messageParams)

      expect(result).toEqual(mockMessage)
      expect(mockA2AClientAction.sendMessage).toHaveBeenCalledWith(messageParams)
    })

    it('should send streaming message successfully', async () => {
      const mockAgentCard = {
        capabilities: { streaming: true }
      }

      const messageParams: A2AMessageSendParams = {
        messageId: 'msg-123',
        kind: 'message',
        role: 'user',
        parts: []
      }

      // Mock async generator
      async function* mockStreamGenerator() {
        yield { taskId: 'task-123', status: 'running' }
        yield { taskId: 'task-123', status: 'completed' }
      }

      vi.mocked(mockServerManager.getA2AClient).mockResolvedValue(mockA2AClientAction)
      vi.mocked(mockA2AClientAction.getAgentCard).mockResolvedValue(mockAgentCard)
      vi.mocked(mockA2AClientAction.sendStreamingMessage).mockReturnValue(mockStreamGenerator())

      const result = await a2aPresenter.sendMessage('https://example.com', messageParams)

      expect(result).toBeInstanceOf(Object) // AsyncGenerator
      expect(mockA2AClientAction.sendStreamingMessage).toHaveBeenCalledWith(messageParams)
    })

    it('should throw error when server is not running', async () => {
      const messageParams: A2AMessageSendParams = {
        messageId: 'msg-123',
        kind: 'message',
        role: 'user',
        parts: []
      }

      vi.mocked(mockServerManager.getA2AClient).mockResolvedValue(undefined)

      await expect(a2aPresenter.sendMessage('https://example.com', messageParams)).rejects.toThrow(
        "A2A server 'https://example.com' is not running"
      )
    })
  })

  describe('isServerRunning', () => {
    it('should return true when server is running', async () => {
      vi.mocked(mockServerManager.isA2AServerRunning).mockResolvedValue(true)

      const result = await a2aPresenter.isServerRunning('https://example.com')

      expect(result).toBe(true)
      expect(mockServerManager.isA2AServerRunning).toHaveBeenCalledWith('https://example.com')
    })

    it('should return false when server is not running', async () => {
      vi.mocked(mockServerManager.isA2AServerRunning).mockResolvedValue(false)

      const result = await a2aPresenter.isServerRunning('https://example.com')

      expect(result).toBe(false)
    })
  })
})
