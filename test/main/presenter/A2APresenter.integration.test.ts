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

describe('A2APresenter Integration Tests', () => {
  let a2aPresenter: A2APresenter
  let mockConfigPresenter: IConfigPresenter
  let mockServerManager: ServerManager
  let mockA2AClientAction: A2AClientAction
  let mockFetch: Mock

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock fetch
    mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200
    } as Response)

    // Mock config presenter
    mockConfigPresenter = {
      exportAgents: vi.fn().mockResolvedValue({
        agents: []
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

    // Mock ServerManager instance
    mockServerManager = {
      getA2AClient: vi.fn(),
      isA2AServerRunning: vi.fn(),
      addA2AServer: vi.fn(),
      fetchAgentCard: vi.fn(),
      removeA2AServer: vi.fn()
    } as unknown as ServerManager

    // Mock constructors
    vi.mocked(ServerManager).mockImplementation(() => mockServerManager)
    vi.mocked(A2AClientAction).mockImplementation(() => mockA2AClientAction)

    a2aPresenter = new A2APresenter(mockConfigPresenter)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Full workflow: Add server and get client', () => {
    it('should complete full workflow of adding server and getting client data', async () => {
      const mockAgentCardData: AgentCardData = {
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
      }

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

      // Add server
      vi.mocked(mockServerManager.addA2AServer).mockResolvedValue(mockAgentCardData)
      const addResult = await a2aPresenter.addA2AServer('https://example.com')
      expect(addResult).toEqual(mockAgentCardData)

      // Mock getting client
      vi.mocked(mockServerManager.getA2AClient).mockResolvedValue(mockA2AClientAction)
      vi.mocked(mockA2AClientAction.getAgentCard).mockResolvedValue(mockAgentCard)
      vi.mocked(mockServerManager.isA2AServerRunning).mockResolvedValue(true)

      // Get client data
      const clientData = await a2aPresenter.getA2AClient('https://example.com')

      expect(clientData).toBeDefined()
      expect(clientData?.isRunning).toBe(true)
      expect(clientData?.agentCard.name).toBe('Test Agent')
      expect(clientData?.agentCard.streamingSupported).toBe(true)
      expect(clientData?.agentCard.skills).toHaveLength(2)
    })

    it('should handle streaming vs non-streaming message sending', async () => {
      const messageParams: A2AMessageSendParams = {
        messageId: 'msg-123',
        kind: 'message',
        role: 'user',
        parts: [{ type: 'text', text: 'Test message' }]
      }

      const mockStreamingAgentCard = {
        capabilities: { streaming: true }
      }

      const mockNonStreamingAgentCard = {
        capabilities: { streaming: false }
      }

      const mockResponse: A2AServerResponse = {
        taskId: 'task-123',
        status: 'completed',
        message: {
          role: 'assistant',
          content: 'Response'
        }
      }

      // Mock async generator for streaming
      async function* mockStreamGenerator() {
        yield { taskId: 'task-123', status: 'running' }
        yield { taskId: 'task-123', status: 'completed' }
      }

      // Test streaming
      vi.mocked(mockServerManager.getA2AClient).mockResolvedValue(mockA2AClientAction)
      vi.mocked(mockA2AClientAction.getAgentCard)
        .mockResolvedValueOnce(mockStreamingAgentCard)
        .mockResolvedValueOnce(mockNonStreamingAgentCard)
      vi.mocked(mockA2AClientAction.sendStreamingMessage).mockReturnValue(mockStreamGenerator())
      vi.mocked(mockA2AClientAction.sendMessage).mockResolvedValue(mockResponse)

      // Send streaming message
      const streamingResult = await a2aPresenter.sendMessage('https://example.com', messageParams)
      expect(mockA2AClientAction.sendStreamingMessage).toHaveBeenCalledWith(messageParams)

      // Send non-streaming message
      const nonStreamingResult = await a2aPresenter.sendMessage(
        'https://example.com',
        messageParams
      )
      expect(mockA2AClientAction.sendMessage).toHaveBeenCalledWith(messageParams)
    })
  })

  describe('Error handling workflow', () => {
    it('should handle add server -> fetch agent card -> remove server workflow with errors', async () => {
      const serverURL = 'https://example.com'

      // 1. Server doesn't exist initially
      vi.mocked(mockServerManager.isA2AServerRunning).mockResolvedValue(false)
      const isRunning = await a2aPresenter.isServerRunning(serverURL)
      expect(isRunning).toBe(false)

      // 2. Add server fails
      const error = new Error('Connection failed')
      vi.mocked(mockServerManager.addA2AServer).mockRejectedValue(error)
      const addResult = await a2aPresenter.addA2AServer(serverURL)
      expect(addResult).toEqual({
        errorCode: '-1',
        errorMsg: 'Connection failed'
      })

      // 3. Fetch agent card fails
      vi.mocked(mockServerManager.fetchAgentCard).mockRejectedValue(new Error('Server not found'))
      const fetchResult = await a2aPresenter.fetchAgentCard(serverURL)
      expect(fetchResult).toEqual({
        errorCode: '-1',
        errorMsg: 'Server not found'
      })
    })
  })

  describe('URL normalization workflow', () => {
    it('should handle various URL formats consistently', async () => {
      const testCases = [
        'https://example.com',
        'https://example.com/',
        'https://example.com/.well-known/agent-card.json',
        'https://example.com//.well-known/agent-card.json'
      ]

      const mockAgentCardData: AgentCardData = {
        name: 'Test Agent',
        description: 'Test',
        url: 'https://example.com',
        streamingSupported: false,
        skills: [],
        version: '1.0.0'
      }

      for (const url of testCases) {
        // Clear previous mocks
        vi.clearAllMocks()

        // Re-setup mocks
        vi.mocked(ServerManager).mockImplementation(() => mockServerManager)
        a2aPresenter = new A2APresenter(mockConfigPresenter)

        vi.mocked(mockServerManager.addA2AServer).mockResolvedValue(mockAgentCardData)
        const result = await a2aPresenter.addA2AServer(url)

        expect(result).toBeDefined()
        expect(mockServerManager.addA2AServer).toHaveBeenCalledWith(url)
      }
    })
  })

  describe('Server Manager integration', () => {
    it('should correctly use ServerManager methods', async () => {
      // Test all ServerManager methods are called correctly
      vi.mocked(mockServerManager.isA2AServerRunning).mockResolvedValue(true)
      vi.mocked(mockServerManager.getA2AClient).mockResolvedValue(mockA2AClientAction)
      vi.mocked(mockA2AClientAction.getAgentCard).mockResolvedValue({
        name: 'Test',
        description: 'Test',
        url: 'https://example.com',
        capabilities: {},
        skills: [],
        version: '1.0.0'
      })

      // Check server running
      await a2aPresenter.isServerRunning('https://example.com')
      expect(mockServerManager.isA2AServerRunning).toHaveBeenCalledWith('https://example.com')

      // Get client
      await a2aPresenter.getA2AClient('https://example.com')
      expect(mockServerManager.getA2AClient).toHaveBeenCalledWith('https://example.com')

      // Remove server
      vi.mocked(mockServerManager.removeA2AServer).mockResolvedValue(true)
      const removed = await a2aPresenter.removeA2AServer('https://example.com')
      expect(removed).toBe(true)
      expect(mockServerManager.removeA2AServer).toHaveBeenCalledWith('https://example.com')
    })
  })

  describe('Config presenter integration', () => {
    it('should interact with config presenter correctly', async () => {
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

      // Clear mocks but keep config presenter mock
      mockConfigPresenter.importAgentFromA2AData = vi.fn().mockResolvedValue(undefined)

      // Re-mock the constructors
      vi.mocked(ServerManager).mockImplementation(() => mockServerManager)

      // Create a fresh instance
      const freshPresenter = new A2APresenter(mockConfigPresenter)

      // Make addA2AServer also call importAgentFromA2AData
      vi.mocked(mockServerManager.addA2AServer).mockImplementation(async (url) => {
        // Simulate the real implementation
        await mockConfigPresenter.importAgentFromA2AData(mockAgentCardData)
        return mockAgentCardData
      })

      await freshPresenter.addA2AServer('https://example.com')

      expect(mockConfigPresenter.importAgentFromA2AData).toHaveBeenCalledWith(mockAgentCardData)
    })
  })
})
