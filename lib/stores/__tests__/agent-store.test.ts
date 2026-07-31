jest.mock('@/services/agent-service', () => ({
  agentService: {
    createAgent: jest.fn(),
    getAgentsWithConversations: jest.fn(),
    transformAgent: jest.fn(),
  },
}))

jest.mock('@/services/session-service', () => ({
  sessionService: {
    transformConversationSummary: jest.fn(),
  },
}))

jest.mock('../../cache', () => {
  const actual = jest.requireActual('../../cache')
  return {
    ...actual,
    cacheGetAll: jest.fn(),
    cacheSetAll: jest.fn(),
    cacheDelete: jest.fn(),
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
import { createAgentSlice, type AgentSlice } from '../agent-store'
import { createChatSlice, type ChatSlice } from '../chat-store'
import { createConnectionSlice, type ConnectionSlice } from '../connection-store'
import { createSettingsSlice, type SettingsSlice } from '../settings-store'
import { createUISlice, type UISlice } from '../ui-store'
import { AdapterType, SandboxType, AgentStatus } from '../../types'
import { agentService } from '@/services/agent-service'
import { sessionService } from '@/services/session-service'
import { cacheGetAll, cacheSetAll } from '../../cache'
import { appConfig } from '@/app/config'

type TestState = ChatSlice & AgentSlice & ConnectionSlice & SettingsSlice & UISlice

const useTestStore = create<TestState>()((...a) => ({
  ...createChatSlice(...a),
  ...createAgentSlice(...a),
  ...createConnectionSlice(...a),
  ...createSettingsSlice(...a),
  ...createUISlice(...a),
}))

const testAgent: ReturnType<typeof agentService.transformAgent> = {
  id: 'test-agent',
  name: 'Test Agent',
  adapterType: AdapterType.OPENCODE,
  sandboxType: SandboxType.DOCKER,
  status: AgentStatus.RUNNING,
  sandboxId: '',
  defaultSessionId: '',
  hasScheduledTasks: false,
  idleTimeoutSeconds: 300,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

const testConversation = {
  id: 'conv-1',
  title: 'Test Conversation',
  messages: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  agentId: 'test-agent',
}

function mockTransformAgentImpl(item: any) {
  return {
    id: item.id,
    name: item.name,
    adapterType: AdapterType.OPENCODE,
    sandboxType: SandboxType.DOCKER,
    status: AgentStatus.RUNNING,
    sandboxId: '',
    defaultSessionId: '',
    hasScheduledTasks: false,
    idleTimeoutSeconds: 300,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function setupTransformAgentMock() {
  ;(agentService.transformAgent as jest.Mock).mockImplementation(mockTransformAgentImpl)
}

function setupNetworkMocks(agents: any[], conversations: any[]) {
  const enriched = agents.map(a => ({
    id: a.id,
    name: a.name,
    conversations: conversations
      .filter(c => c.agentId === a.id)
      .map(c => ({
        id: c.id,
        title: c.title,
        agentId: c.agentId,
      })),
  }))

  ;(agentService.getAgentsWithConversations as jest.Mock).mockResolvedValue(enriched)
  setupTransformAgentMock()
  ;(sessionService.transformConversationSummary as jest.Mock).mockImplementation(
    (summary: any, agentName: string) => ({
      id: summary.id,
      title: summary.title || '',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      agentId: summary.agentId,
      agentName,
    })
  )
}

describe('AgentSlice', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(appConfig as any).app.useMockData = false
    useTestStore.setState({
      agents: [],
      currentAgentId: null,
      agentStatus: {},
      agentCreateFlag: 0,
      isAgentsLoading: false,
      conversations: [],
      currentConversationId: null,
    })
  })

  it('should have correct initial state', () => {
    const state = useTestStore.getState()
    expect(state.agents).toEqual([])
    expect(state.currentAgentId).toBeNull()
    expect(state.agentStatus).toEqual({})
    expect(state.agentCreateFlag).toBe(0)
    expect(state.isAgentsLoading).toBe(false)
  })

  it('should set current agent', () => {
    useTestStore.getState().setCurrentAgent('agent-1')
    expect(useTestStore.getState().currentAgentId).toBe('agent-1')
  })

  it('should trigger agent create', () => {
    const initialFlag = useTestStore.getState().agentCreateFlag
    useTestStore.getState().triggerAgentCreate()
    expect(useTestStore.getState().agentCreateFlag).toBe(initialFlag + 1)
  })

  it('should add an agent', () => {
    useTestStore.getState().addAgent(testAgent)
    const state = useTestStore.getState()
    expect(state.agents.length).toBe(1)
    expect(state.agents[0].id).toBe('test-agent')
    expect(state.agents[0].name).toBe('Test Agent')
  })

  it('should update an agent', () => {
    useTestStore.getState().addAgent(testAgent)
    const updated = { ...testAgent, name: 'Updated Agent', status: AgentStatus.RUNNING }
    useTestStore.getState().updateAgent(updated)
    const agent = useTestStore.getState().agents.find(a => a.id === 'test-agent')
    expect(agent?.name).toBe('Updated Agent')
    expect(agent?.status).toBe(AgentStatus.RUNNING)
  })

  it('should remove an agent', () => {
    useTestStore.getState().addAgent(testAgent)
    useTestStore.getState().removeAgent('test-agent')
    expect(useTestStore.getState().agents.length).toBe(0)
  })

  it('should set agents array', () => {
    useTestStore.getState().setAgents([testAgent])
    expect(useTestStore.getState().agents.length).toBe(1)
    expect(useTestStore.getState().agents[0].id).toBe('test-agent')
  })

  describe('removeAgent cross-slice behavior', () => {
    it('should clean up conversations belonging to removed agent', () => {
      useTestStore.getState().addAgent(testAgent)
      useTestStore.setState({
        conversations: [
          {
            id: 'conv-1',
            title: 'Test',
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            agentId: 'test-agent',
          },
          {
            id: 'conv-2',
            title: 'Other',
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            agentId: 'other-agent',
          },
        ],
        currentConversationId: 'conv-1',
        currentAgentId: 'test-agent',
      })

      useTestStore.getState().removeAgent('test-agent')

      const state = useTestStore.getState()
      expect(state.agents.length).toBe(0)
      expect(state.conversations.length).toBe(1)
      expect(state.conversations[0].agentId).toBe('other-agent')
      expect(state.currentAgentId).toBeNull()
    })

    it('should clear currentConversationId if it belonged to removed agent', () => {
      useTestStore.getState().addAgent(testAgent)
      useTestStore.setState({
        conversations: [
          {
            id: 'conv-1',
            title: 'Test',
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            agentId: 'test-agent',
          },
        ],
        currentConversationId: 'conv-1',
      })

      useTestStore.getState().removeAgent('test-agent')
      expect(useTestStore.getState().currentConversationId).toBeNull()
    })

    it('should clean up agentStatus for removed agent', () => {
      useTestStore.getState().addAgent(testAgent)
      useTestStore.setState({
        agentStatus: { 'test-agent': AgentStatus.RUNNING, 'other-agent': AgentStatus.PAUSED },
      })

      useTestStore.getState().removeAgent('test-agent')

      const state = useTestStore.getState()
      expect(state.agentStatus['test-agent']).toBeUndefined()
      expect(state.agentStatus['other-agent']).toBe(AgentStatus.PAUSED)
    })

    it('should select next available non-deleted agent when current is removed', () => {
      const otherAgent = { ...testAgent, id: 'other-agent', name: 'Other Agent' }
      const deletedAgent = {
        ...testAgent,
        id: 'soft-deleted',
        name: 'Soft Deleted',
        status: AgentStatus.DELETED,
      }
      useTestStore.getState().setAgents([otherAgent, deletedAgent, testAgent])
      useTestStore.setState({ currentAgentId: 'test-agent' })

      useTestStore.getState().removeAgent('test-agent')

      const state = useTestStore.getState()
      // Should fall back to the non-deleted remaining agent, skipping the soft-deleted one
      expect(state.currentAgentId).toBe('other-agent')
      expect(state.agents.length).toBe(2)
    })
  })

  describe('initializeAgent', () => {
    const createConfig = {
      name: 'New Agent',
      description: 'A test agent',
      sandboxType: SandboxType.DOCKER,
      adapterType: AdapterType.OPENCODE,
      idleTimeoutSeconds: 300,
    }

    it('should create agent via service in real mode', async () => {
      const createdAgent = { ...testAgent, id: 'created-agent', name: 'New Agent' }
      ;(agentService.createAgent as jest.Mock).mockResolvedValue(createdAgent)

      const result = await useTestStore.getState().initializeAgent(createConfig)

      expect(agentService.createAgent).toHaveBeenCalledWith(createConfig)
      expect(result).toEqual(createdAgent)

      const state = useTestStore.getState()
      expect(state.agents).toContainEqual(createdAgent)
      expect(state.currentAgentId).toBe('created-agent')
    })

    it('should create mock agent when useMockData is true', async () => {
      ;(appConfig as any).app.useMockData = true

      const result = await useTestStore.getState().initializeAgent(createConfig)

      // Mock mode should not call the real service
      expect(agentService.createAgent).not.toHaveBeenCalled()

      expect(result.id).toBeTruthy()
      expect(result.name).toBe('New Agent')
      expect(result.status).toBe(AgentStatus.RUNNING)

      const state = useTestStore.getState()
      expect(state.agents).toContainEqual(result)
      expect(state.currentAgentId).toBe(result.id)
    })

    it('should use defaults for missing config fields in mock mode', async () => {
      ;(appConfig as any).app.useMockData = true

      const result = await useTestStore.getState().initializeAgent({ name: 'Minimal' } as any)

      expect(result.name).toBe('Minimal')
      expect(result.adapterType).toBe(AdapterType.OPENCODE)
      expect(result.sandboxType).toBe(SandboxType.DOCKER)
      expect(result.idleTimeoutSeconds).toBe(300)
    })
  })

  describe('fetchAgentsWithConversations', () => {
    it('should populate store on network success', async () => {
      ;(cacheGetAll as jest.Mock).mockReturnValue(null)
      setupNetworkMocks([{ id: 'agent-1', name: 'Agent 1' }], [])

      const result = await useTestStore.getState().fetchAgentsWithConversations()

      expect(result).toBeUndefined()
      expect(agentService.getAgentsWithConversations).toHaveBeenCalledTimes(1)

      const state = useTestStore.getState()
      expect(state.agents.length).toBe(1)
      expect(state.agents[0].name).toBe('Agent 1')
      expect(state.isAgentsLoading).toBe(false)
    })

    it('should apply cached data before network completes', async () => {
      const cachedAgent = { ...testAgent, id: 'cached-agent', name: 'Cached Agent' }
      ;(cacheGetAll as jest.Mock).mockReturnValue({
        agents: [cachedAgent],
        conversations: [],
        sessionAgentNames: [],
      })

      // Use a deferred promise so network doesn't overwrite cache before we check
      let resolveNetwork: (value: any) => void
      const deferred = new Promise<any[]>(resolve => {
        resolveNetwork = resolve
      })
      ;(agentService.getAgentsWithConversations as jest.Mock).mockReturnValue(deferred)
      setupTransformAgentMock()

      await useTestStore.getState().fetchAgentsWithConversations()

      // Cache data should be in store immediately, before network completes
      const stateBeforeNetwork = useTestStore.getState()
      expect(stateBeforeNetwork.agents).toContainEqual(cachedAgent)

      // Resolve network and verify it eventually updates
      resolveNetwork!([{ id: 'agent-1', name: 'Agent 1', conversations: [] }])
      // Let pending microtasks flush
      await new Promise(r => setTimeout(r, 10))

      const stateAfterNetwork = useTestStore.getState()
      expect(stateAfterNetwork.agents[0].name).toBe('Agent 1')
    })

    it('should patch agentName onto existing store conversations using sessionAgentNames', async () => {
      // Set up a store conversation that has a sessionId but no agentName
      useTestStore.setState({
        conversations: [{ ...testConversation, sessionId: 'sess-1', agentName: undefined }],
      })
      ;(cacheGetAll as jest.Mock).mockReturnValue({
        agents: [testAgent],
        conversations: [], // cached conversations are empty — patching applies to store state
        sessionAgentNames: [['sess-1', testAgent.name]],
      })

      // Use a deferred network so we can check store state before network overwrites
      let resolveNetwork: (value: any) => void
      const deferred = new Promise<any[]>(resolve => {
        resolveNetwork = resolve
      })
      ;(agentService.getAgentsWithConversations as jest.Mock).mockReturnValue(deferred)
      setupTransformAgentMock()

      await useTestStore.getState().fetchAgentsWithConversations()

      // Store conversations should now have agentName patched from sessionAgentNames
      const state = useTestStore.getState()
      expect(state.conversations.length).toBe(1)
      const patched = state.conversations.find((c: any) => c.id === 'conv-1')
      expect(patched?.agentName).toBe(testAgent.name)

      // Resolve network to clear pendingFetch for subsequent tests
      resolveNetwork!([{ id: 'agent-1', name: 'Agent 1', conversations: [] }])
      await new Promise(r => setTimeout(r, 10))
    })

    it('should handle network error gracefully', async () => {
      ;(cacheGetAll as jest.Mock).mockReturnValue(null)
      ;(agentService.getAgentsWithConversations as jest.Mock).mockRejectedValue(
        new Error('Network error')
      )

      await useTestStore.getState().fetchAgentsWithConversations()

      const state = useTestStore.getState()
      // Should not be stuck loading
      expect(state.isAgentsLoading).toBe(false)
      // State should remain unchanged
      expect(state.agents).toEqual([])
    })

    it('should deduplicate concurrent calls', async () => {
      ;(cacheGetAll as jest.Mock).mockReturnValue(null)

      // Deferred promise to control when network resolves
      let resolveNetwork: (value: any) => void
      const deferred = new Promise<any[]>(resolve => {
        resolveNetwork = resolve
      })
      ;(agentService.getAgentsWithConversations as jest.Mock).mockReturnValue(deferred)
      setupTransformAgentMock()
      ;(sessionService.transformConversationSummary as jest.Mock).mockReturnValue({
        id: 'conv-1',
        title: '',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        agentId: 'agent-1',
        agentName: 'Agent 1',
      })

      const store = useTestStore.getState()

      // Start first call — it will hang on the deferred promise
      const call1 = store.fetchAgentsWithConversations()
      // Start second call immediately — should see pendingFetch and wait
      const call2 = store.fetchAgentsWithConversations()

      // Resolve the network request
      resolveNetwork!([{ id: 'agent-1', name: 'Agent 1', conversations: [] }])

      await Promise.all([call1, call2])

      // Only one network request should have been made
      expect(agentService.getAgentsWithConversations).toHaveBeenCalledTimes(1)

      // Both calls should see the same final state
      const finalState = useTestStore.getState()
      expect(finalState.agents.length).toBe(1)
      expect(finalState.isAgentsLoading).toBe(false)
    })

    it('should keep existing conversations after network refresh', async () => {
      // Set up existing conversation with distinct ID from network data
      useTestStore.setState({
        conversations: [
          {
            ...testConversation,
            id: 'existing-conv',
            agentId: 'agent-1',
            sessionId: 'sess-existing',
          },
        ],
      })
      ;(cacheGetAll as jest.Mock).mockReturnValue(null)
      setupNetworkMocks(
        [{ id: 'agent-1', name: 'Agent 1' }],
        [{ id: 'new-conv', title: 'New', agentId: 'agent-1' }]
      )

      await useTestStore.getState().fetchAgentsWithConversations()

      const state = useTestStore.getState()
      // Should have both the existing conversation and the new one
      expect(state.conversations.length).toBeGreaterThanOrEqual(1)
      // Existing conversation should be preserved (patched with agentName if applicable)
      const existing = state.conversations.find((c: any) => c.id === 'existing-conv')
      expect(existing).toBeTruthy()
    })

    it('should skip cached conversations whose sessionId already exists in store', async () => {
      // Existing store conversation occupies sessionId 'sess-dup'
      useTestStore.setState({
        conversations: [
          {
            ...testConversation,
            id: 'store-conv',
            sessionId: 'sess-dup',
            agentId: 'test-agent',
          },
        ],
      })
      // Cache returns a conversation sharing the same sessionId — must be filtered out
      const cachedConv = {
        ...testConversation,
        id: 'cached-conv',
        sessionId: 'sess-dup',
        agentId: 'test-agent',
      }
      ;(cacheGetAll as jest.Mock).mockReturnValue({
        agents: [testAgent],
        conversations: [cachedConv],
        sessionAgentNames: [],
      })

      // Deferred network so we can observe cache-only state before it overwrites
      let resolveNetwork: (value: any) => void
      const deferred = new Promise<any[]>(resolve => {
        resolveNetwork = resolve
      })
      ;(agentService.getAgentsWithConversations as jest.Mock).mockReturnValue(deferred)
      setupTransformAgentMock()

      await useTestStore.getState().fetchAgentsWithConversations()

      const state = useTestStore.getState()
      // The duplicate cached conversation should NOT have been added
      const ids = state.conversations.map((c: any) => c.id)
      expect(ids).not.toContain('cached-conv')
      expect(ids).toContain('store-conv')

      // Cleanup: resolve network and flush pendingFetch
      resolveNetwork!([{ id: 'test-agent', name: 'Test Agent', conversations: [] }])
      await new Promise(r => setTimeout(r, 10))
    })
  })
})
