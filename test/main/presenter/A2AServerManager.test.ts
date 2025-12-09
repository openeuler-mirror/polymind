import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'
import { ServerManager } from '../../../src/main/presenter/A2APresenter/serverManager'
import { A2AClientAction } from '../../../src/main/presenter/A2APresenter/A2AClientAction'
import type { IConfigPresenter, AgentCardData } from '../../../src/shared/presenter'

// Mock dependencies
vi.mock('../../../src/main/presenter/A2APresenter/A2AClientAction')
vi.mock('@a2a-js/sdk/client', () => ({
  A2AClient: vi.fn()
}))

describe('ServerManager', () => {
  let serverManager: ServerManager
  let mockConfigPresenter: IConfigPresenter
  let mockA2AClientAction: A2AClientAction

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock config presenter
    mockConfigPresenter = {
      exportAgents: vi.fn().mockResolvedValue({
        agents: [],
        installedAgents: [],
        lastUpdateTime: Date.now()
      }),
      importAgentFromA2AData: vi.fn().mockResolvedValue(undefined)
    } as unknown as IConfigPresenter

    // Mock A2AClientAction instance
    mockA2AClientAction = {
      getAgentCard: vi.fn(),
      isConnected: vi.fn(),
      sendMessage: vi.fn(),
      sendStreamingMessage: vi.fn()
    } as unknown as A2AClientAction

    // Mock A2AClientAction constructor
    vi.mocked(A2AClientAction).mockImplementation(() => mockA2AClientAction)

    serverManager = new ServerManager(mockConfigPresenter)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should create an instance and load existing agents', () => {
      expect(serverManager).toBeInstanceOf(ServerManager)
    })

    it('should load existing agents from config', async () => {
      const mockConfigWithAgents = {
        agents: [
          {
            id: '1',
            name: 'Test Agent 1',
            a2aURL: 'https://agent1.example.com',
            provider: 'Provider 1'
          },
          {
            id: '2',
            name: 'Test Agent 2',
            a2aURL: 'https://agent2.example.com/.well-known/agent-card.json',
            provider: 'Provider 2'
          }
        ],
        installedAgents: [],
        lastUpdateTime: Date.now()
      }

      vi.mocked(mockConfigPresenter.exportAgents).mockResolvedValue(mockConfigWithAgents)

      // Create a new instance to trigger loadExistingA2AAgents
      const newServerManager = new ServerManager(mockConfigPresenter)

      // Wait for async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(A2AClientAction).toHaveBeenCalledWith('https://agent1.example.com')
      expect(A2AClientAction).toHaveBeenCalledWith('https://agent2.example.com')
    })

    it('should handle errors when loading existing agents', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      vi.mocked(mockConfigPresenter.exportAgents).mockRejectedValue(new Error('Config error'))

      new ServerManager(mockConfigPresenter)

      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(consoleSpy).toHaveBeenCalledWith(
        '[A2A] Failed to load existing A2A agents:',
        expect.any(Error)
      )

      consoleSpy.mockRestore()
    })
  })

  describe('addA2AServer', () => {
    it('should add a new server successfully', async () => {
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
        defaultInputModes: ['text'],
        defaultOutputModes: ['text'],
        protocolVersion: '1.0',
        provider: { organization: 'Test Org', url: 'https://example.org' },
        iconUrl: 'https://example.com/icon.png'
      } as any // 使用 as any 来绕过类型检查

      vi.mocked(mockA2AClientAction.getAgentCard).mockResolvedValue(mockAgentCard)

      const result = await serverManager.addA2AServer('https://example.com')

      expect(A2AClientAction).toHaveBeenCalledWith('https://example.com')
      expect(mockConfigPresenter.importAgentFromA2AData).toHaveBeenCalledWith({
        name: 'Test Agent',
        description: 'Test Description',
        url: 'https://example.com',
        streamingSupported: true,
        skills: [
          { name: 'skill1', description: 'description1' },
          { name: 'skill2', description: 'description2' }
        ],
        version: '1.0.0',
        provider: { organization: 'Test Org', url: 'https://example.org' },
        iconUrl: 'https://example.com/icon.png'
      })
      expect(result).toEqual({
        name: 'Test Agent',
        description: 'Test Description',
        url: 'https://example.com',
        streamingSupported: true,
        skills: [
          { name: 'skill1', description: 'description1' },
          { name: 'skill2', description: 'description2' }
        ],
        version: '1.0.0',
        provider: { organization: 'Test Org', url: 'https://example.org' },
        iconUrl: 'https://example.com/icon.png'
      })
    })

    it('should handle invalid server URL', async () => {
      await expect(serverManager.addA2AServer('invalid-url')).rejects.toThrow(
        '[A2A] Invalid server URL: invalid-url'
      )
    })

    it('should handle server that has already been added', async () => {
      // First, add a server
      vi.mocked(mockA2AClientAction.getAgentCard).mockResolvedValue({
        name: 'Test Agent',
        description: 'Test',
        url: 'https://example.com',
        capabilities: {},
        skills: [],
        version: '1.0.0',
        defaultInputModes: ['text'],
        defaultOutputModes: ['text'],
        protocolVersion: '1.0'
      })

      await serverManager.addA2AServer('https://example.com')

      // Try to add the same server again
      await expect(serverManager.addA2AServer('https://example.com')).rejects.toThrow(
        '[A2A] https://example.com has been added'
      )
    })

    it('should handle agent card fetch failure', async () => {
      const error = new Error('Failed to fetch agent card')
      vi.mocked(mockA2AClientAction.getAgentCard).mockRejectedValue(error)

      await expect(serverManager.addA2AServer('https://example.com')).rejects.toThrow(
        'Failed to fetch agent card'
      )
    })

    it('should normalize URLs with agent-card.json suffix', async () => {
      const mockAgentCard = {
        name: 'Test Agent',
        description: 'Test',
        url: 'https://example.com',
        capabilities: {},
        skills: [],
        version: '1.0.0',
        defaultInputModes: ['text'],
        defaultOutputModes: ['text'],
        protocolVersion: '1.0'
      }

      vi.mocked(mockA2AClientAction.getAgentCard).mockResolvedValue(mockAgentCard)

      await serverManager.addA2AServer('https://example.com/.well-known/agent-card.json')

      expect(A2AClientAction).toHaveBeenCalledWith('https://example.com')
    })

    it('should normalize URLs by removing trailing slashes', async () => {
      const mockAgentCard = {
        name: 'Test Agent',
        description: 'Test',
        url: 'https://example.com',
        capabilities: {},
        skills: [],
        version: '1.0.0',
        defaultInputModes: ['text'],
        defaultOutputModes: ['text'],
        protocolVersion: '1.0'
      }

      vi.mocked(mockA2AClientAction.getAgentCard).mockResolvedValue(mockAgentCard)

      await serverManager.addA2AServer('https://example.com/')

      expect(A2AClientAction).toHaveBeenCalledWith('https://example.com')
    })
  })

  describe('fetchAgentCard', () => {
    it('should fetch agent card without adding to pool', async () => {
      const mockAgentCard = {
        name: 'Test Agent',
        description: 'Test Description',
        url: 'https://example.com',
        capabilities: { streaming: false },
        skills: [{ name: 'skill1', description: 'description1' }],
        version: '1.0.0',
        defaultInputModes: ['text'],
        defaultOutputModes: ['text'],
        protocolVersion: '1.0',
        provider: { organization: 'Test Org' },
        iconUrl: 'https://example.com/icon.png'
      }

      vi.mocked(mockA2AClientAction.getAgentCard).mockResolvedValue(mockAgentCard)

      const result = await serverManager.fetchAgentCard('https://example.com')

      expect(A2AClientAction).toHaveBeenCalledWith('https://example.com')
      expect(result).toEqual({
        name: 'Test Agent',
        description: 'Test Description',
        url: 'https://example.com',
        streamingSupported: false,
        skills: [{ name: 'skill1', description: 'description1' }],
        version: '1.0.0',
        provider: { organization: 'Test Org', url: '' },
        iconUrl: 'https://example.com/icon.png'
      })
    })

    it('should not add server to pool when fetching agent card', async () => {
      const mockAgentCard = {
        name: 'Test Agent',
        description: 'Test',
        url: 'https://example.com',
        capabilities: {},
        skills: [],
        version: '1.0.0',
        defaultInputModes: ['text'],
        defaultOutputModes: ['text'],
        protocolVersion: '1.0'
      }

      vi.mocked(mockA2AClientAction.getAgentCard).mockResolvedValue(mockAgentCard)

      await serverManager.fetchAgentCard('https://example.com')

      // Try to get the client - should return undefined as it wasn't added
      const client = await serverManager.getA2AClient('https://example.com')
      expect(client).toBeUndefined()
    })
  })

  describe('removeA2AServer', () => {
    it('should remove server successfully', async () => {
      // First add a server
      vi.mocked(mockA2AClientAction.getAgentCard).mockResolvedValue({
        name: 'Test Agent',
        description: 'Test',
        url: 'https://example.com',
        capabilities: {},
        skills: [],
        version: '1.0.0',
        defaultInputModes: ['text'],
        defaultOutputModes: ['text'],
        protocolVersion: '1.0'
      })

      await serverManager.addA2AServer('https://example.com')

      // Now remove it
      const result = await serverManager.removeA2AServer('https://example.com')

      expect(result).toBe(true)
    })

    it('should return false for non-existent server', async () => {
      const result = await serverManager.removeA2AServer('https://example.com')

      expect(result).toBe(false)
    })

    it('should handle invalid server URL', async () => {
      await expect(serverManager.removeA2AServer('invalid-url')).rejects.toThrow(
        '[A2A] Invalid server URL: invalid-url'
      )
    })
  })

  describe('getA2AClient', () => {
    it('should get existing client', async () => {
      // First add a server
      vi.mocked(mockA2AClientAction.getAgentCard).mockResolvedValue({
        name: 'Test Agent',
        description: 'Test',
        url: 'https://example.com',
        capabilities: {},
        skills: [],
        version: '1.0.0',
        defaultInputModes: ['text'],
        defaultOutputModes: ['text'],
        protocolVersion: '1.0'
      })

      await serverManager.addA2AServer('https://example.com')

      // Get the client
      const client = await serverManager.getA2AClient('https://example.com')

      expect(client).toBe(mockA2AClientAction)
    })

    it('should return undefined for non-existent client', async () => {
      const client = await serverManager.getA2AClient('https://example.com')

      expect(client).toBeUndefined()
    })

    it('should return undefined for invalid server URL', async () => {
      const client = await serverManager.getA2AClient('invalid-url')

      expect(client).toBeUndefined()
    })
  })

  describe('isA2AServerRunning', () => {
    it('should return true when server is running', async () => {
      // Add a server first
      vi.mocked(mockA2AClientAction.getAgentCard).mockResolvedValue({
        name: 'Test Agent',
        description: 'Test',
        url: 'https://example.com',
        capabilities: {},
        skills: [],
        version: '1.0.0',
        defaultInputModes: ['text'],
        defaultOutputModes: ['text'],
        protocolVersion: '1.0'
      })

      await serverManager.addA2AServer('https://example.com')

      // Mock isConnected
      vi.mocked(mockA2AClientAction.isConnected).mockResolvedValue(true)

      const result = await serverManager.isA2AServerRunning('https://example.com')

      expect(result).toBe(true)
    })

    it('should return false when server is not running', async () => {
      // Add a server first
      vi.mocked(mockA2AClientAction.getAgentCard).mockResolvedValue({
        name: 'Test Agent',
        description: 'Test',
        url: 'https://example.com',
        capabilities: {},
        skills: [],
        version: '1.0.0',
        defaultInputModes: ['text'],
        defaultOutputModes: ['text'],
        protocolVersion: '1.0'
      })

      await serverManager.addA2AServer('https://example.com')

      // Mock isConnected
      vi.mocked(mockA2AClientAction.isConnected).mockResolvedValue(false)

      const result = await serverManager.isA2AServerRunning('https://example.com')

      expect(result).toBe(false)
    })

    it('should return false when server does not exist', async () => {
      const result = await serverManager.isA2AServerRunning('https://example.com')

      expect(result).toBe(false)
    })
  })
})
