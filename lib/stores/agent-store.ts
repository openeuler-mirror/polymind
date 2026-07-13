import type { StateCreator } from 'zustand'
import type { Agent, Conversation, CreateAgentRequest } from '../types'
import { AdapterType, SandboxType, AgentStatus } from '../types'
import { agentService } from '@/services/agent-service'
import { sessionService } from '@/services/session-service'
import { generateUUID } from '../utils'
import { cacheDelete, cacheSetAll, cacheGetAll, CACHE_KEYS } from '../cache'
import { appConfig } from '@/app/config'
import { syncUrlParams, getUrlParam } from './utils'
import type { StoreState } from './index'

export interface AgentSlice {
  agents: Agent[]
  currentAgentId: string | null
  agentStatus: Record<string, Agent['status']>
  agentCreateFlag: number
  isAgentsLoading: boolean
  setCurrentAgent: (agentId: string | null) => void
  triggerAgentCreate: () => void
  addAgent: (agent: Agent) => void
  updateAgent: (agent: Agent) => void
  removeAgent: (agentId: string) => void
  setAgents: (agents: Agent[]) => void
  initializeAgent: (config: CreateAgentRequest) => Promise<Agent>
  fetchAgentsWithConversations: () => Promise<void>
}

function patchAgentNames(
  conversations: Conversation[],
  sessionAgentNames: [string, string][]
): Conversation[] {
  const nameMap = new Map(sessionAgentNames)
  return conversations.map(c => {
    if (!c.agentName && c.sessionId && nameMap.has(c.sessionId)) {
      return { ...c, agentName: nameMap.get(c.sessionId)! }
    }
    return c
  })
}

function deduplicateConversations<T extends { id: string; sessionId?: string }>(
  existing: T[],
  incoming: T[]
): T[] {
  const existingIds = new Set(existing.map(c => c.id))
  const existingSessionIds = new Set(existing.map(c => c.sessionId).filter(Boolean))
  return incoming.filter(c => !existingIds.has(c.id) && !existingSessionIds.has(c.sessionId))
}

function mergeAndSort<T extends { updatedAt: Date | string }>(fresh: T[], patched: T[]): T[] {
  return [...fresh, ...patched].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
}

export const createAgentSlice: StateCreator<StoreState, [], [], AgentSlice> = (set, get) => {
  let pendingFetch: Promise<void> | null = null

  return {
    agents: [],
    currentAgentId: null,
    agentStatus: {},
    agentCreateFlag: 0,
    isAgentsLoading: false,

    setCurrentAgent: agentId => {
      const currentSessionId = getUrlParam('session')
      set({ currentAgentId: agentId })
      if (!get().currentConversationId) {
        syncUrlParams(agentId || undefined, currentSessionId || undefined)
      }
    },

    triggerAgentCreate: () =>
      set(state => ({
        agentCreateFlag: state.agentCreateFlag + 1,
      })),

    addAgent: agent => {
      set(state => ({
        agents: [...state.agents, agent],
      }))
    },

    updateAgent: agent => {
      set(state => ({
        agents: state.agents.map(a => (a.id === agent.id ? agent : a)),
      }))
    },

    removeAgent: agentId => {
      cacheDelete(CACHE_KEYS.AGENTS)
      cacheDelete(CACHE_KEYS.CONVERSATIONS_WITH_NAMES)
      set(state => {
        const agents = state.agents.filter(a => a.id !== agentId)
        const agentStatus = { ...state.agentStatus }
        delete agentStatus[agentId]
        const conversations = state.conversations.filter(c => c.agentId !== agentId)
        const currentConversationId =
          state.currentConversationId &&
          conversations.some(c => c.id === state.currentConversationId)
            ? state.currentConversationId
            : null

        const isCurrentAgentDeleted = state.currentAgentId === agentId
        const nextAgentId = isCurrentAgentDeleted
          ? (agents.find(a => a.status !== AgentStatus.DELETED)?.id ?? null)
          : state.currentAgentId

        const conversationRemoved = !currentConversationId && state.currentConversationId
        if (conversationRemoved || isCurrentAgentDeleted) {
          syncUrlParams(nextAgentId || undefined)
        }

        return {
          agents,
          agentStatus,
          conversations,
          currentConversationId,
          currentAgentId: nextAgentId,
        }
      })
    },

    setAgents: agents => {
      set(() => ({ agents }))
    },

    initializeAgent: async (config: CreateAgentRequest) => {
      let newAgent: Agent

      if (appConfig.app.useMockData) {
        const now = new Date().toISOString()
        newAgent = {
          id: generateUUID(),
          name: config.name || 'New Agent',
          description: config.description,
          adapterType: config.adapterType || AdapterType.OPENCODE,
          sandboxType: config.sandboxType || SandboxType.DOCKER,
          status: AgentStatus.RUNNING,
          sandboxId: undefined,
          defaultSessionId: undefined,
          hasScheduledTasks: false,
          idleTimeoutSeconds: config.idleTimeoutSeconds ?? 300,
          createdAt: now,
          updatedAt: now,
        }
      } else {
        newAgent = await agentService.createAgent(config)
      }

      get().addAgent(newAgent)
      get().setCurrentAgent(newAgent.id)
      return newAgent
    },

    fetchAgentsWithConversations: async () => {
      if (pendingFetch) {
        return await pendingFetch
      }

      const cached = cacheGetAll()
      if (cached) {
        set(state => {
          const existingIds = new Set(state.conversations.map(c => c.id))
          const existingSessionIds = new Set(
            state.conversations.map(c => c.sessionId).filter(Boolean)
          )
          const patched = patchAgentNames(state.conversations, cached.sessionAgentNames)
          const freshConvs = cached.conversations.filter(
            c => !existingIds.has(c.id) && !existingSessionIds.has(c.sessionId)
          )
          return {
            agents: cached.agents,
            conversations: mergeAndSort(freshConvs, patched),
          }
        })
      }
      const doNetworkRefresh = async () => {
        try {
          set({ isAgentsLoading: true })
          const enriched = await agentService.getAgentsWithConversations()
          const agents: Agent[] = enriched.map((item: any) => agentService.transformAgent(item))

          const agentIds = new Set(agents.map(a => a.id))
          const allConversations: Conversation[] = []
          const sessionAgentNames: [string, string][] = []

          for (const item of enriched) {
            const agentName = item.name
            for (const summary of item.conversations || []) {
              const sessId: string = summary.id
              sessionAgentNames.push([sessId, agentName])
              allConversations.push(sessionService.transformConversationSummary(summary, agentName))
            }
          }

          const newConversations = deduplicateConversations(get().conversations, allConversations)

          cacheSetAll({ agents, conversations: allConversations, sessionAgentNames }, 2 * 60 * 1000)

          set(state => {
            const patched = patchAgentNames(state.conversations, sessionAgentNames).filter(
              c => !c.agentId || agentIds.has(c.agentId)
            )

            const merged = mergeAndSort(newConversations, patched)

            const convStillExists = merged.some(c => c.id === state.currentConversationId)
            if (!convStillExists && state.currentConversationId) {
              syncUrlParams(state.currentAgentId || undefined)
            }
            return {
              agents,
              conversations: merged,
              isAgentsLoading: false,
              ...(convStillExists ? {} : { currentConversationId: null }),
            }
          })
        } catch (error) {
          console.error('Failed to fetch agents with conversations:', error)
          set({ isAgentsLoading: false })
        } finally {
          pendingFetch = null
        }
      }

      pendingFetch = doNetworkRefresh()

      if (cached) {
        return
      }

      return await pendingFetch
    },
  }
}
