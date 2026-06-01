import { create } from 'zustand'
import type { Conversation, Message, MCPTool, Agent, Session, AgentEvent } from './types'
import { AgentStatus, AdapterType, SessionStatus, SandboxType, MessageStatus } from './types'
import { WebSocketClient } from '@/lib/websocket-client'
import { messageService } from '@/services/message-service'
import { agentService } from '@/services/agent-service'
import { sessionService } from '@/services/session-service'
import { generateUUID } from './utils'
import { cacheDelete, cacheSetAll, cacheGetAll, CACHE_KEYS } from './cache'

// 环境变量控制是否使用模拟数据
const USE_MOCK_DATA = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true'

function syncUrlParams(agentId?: string, sessionId?: string) {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  if (agentId) params.set('agent', agentId)
  else params.delete('agent')
  if (sessionId) params.set('session', sessionId)
  else params.delete('session')
  const qs = params.toString()
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
  window.history.replaceState(null, '', url)
}

function getInitialState() {
  return {
    conversations: [],
    currentConversationId: null,
    currentAgentId: null,
    agents: [],
  }
}

const initialState = getInitialState()

interface Settings {
  theme: 'light' | 'dark' | 'system'
  language: 'zh-CN' | 'en-US'
  modelConfig?: {
    adapterType: string
    apiKey: string
    apiBaseUrl: string
  }
}

interface Tab {
  id: string
  name: string
  icon?: React.ElementType
  color?: string
}

export interface ChatState {
  conversations: Conversation[]
  currentConversationId: string | null
  isSidebarOpen: boolean
  isRightPanelOpen: boolean
  mcpTools: MCPTool[]
  settings: Settings
  rightPanelTabs: Tab[]
  activeRightPanelTab: string | null
  settingsActiveSection: string | null
  
  // Agent相关状态
  agents: Agent[]
  currentAgentId: string | null
  agentStatus: Record<string, Agent['status']>
  
  // 连接状态
  wsConnections: Record<string, WebSocketClient> // agentId -> websocket
  isConnecting: boolean
  connectionError: string | null

  // 停止生成锁
  _stoppingInProgress: boolean
  
  // Actions
  createConversation: (agentId?: string, agentName?: string) => Promise<string>
  createLocalConversation: (agentId: string, agentName?: string) => string
  assignSessionToConversation: (convId: string, sessionId: string) => void
  startNewTask: (agentId: string) => void
  deleteConversation: (id: string) => Promise<void>
  setCurrentConversation: (id: string) => void
  addMessage: (conversationId: string, message: Message) => void
  updateMessage: (conversationId: string, messageId: string, updates: Partial<Message> | ((message: Message) => Partial<Message>)) => void
  deleteMessage: (conversationId: string, messageId: string) => void
  toggleSidebar: () => void
  toggleRightPanel: () => void
  setStreaming: (conversationId: string | null, streaming: boolean) => void
  stopStreaming: () => void
  toggleTool: (toolId: string) => void
  updateConversationTitle: (id: string, title: string) => void
  togglePinConversation: (id: string) => void
  updateSettings: (settings: Partial<Settings>) => void
  addRightPanelTab: (tab: Tab) => void
  removeRightPanelTab: (tabId: string) => void
  setActiveRightPanelTab: (tabId: string | null) => void
  setSettingsActiveSection: (section: string | null) => void
  
  // Agent相关操作
  setCurrentAgent: (agentId: string | null) => void
  agentCreateFlag: number
  triggerAgentCreate: () => void
  addAgent: (agent: Agent) => void
  updateAgent: (agent: Agent) => void
  removeAgent: (agentId: string) => void
  setAgents: (agents: Agent[]) => void
  initializeAgent: (config: any) => Promise<Agent>
  connectToAgent: (agentId: string) => Promise<void>
  disconnectFromAgent: (agentId: string) => void
  sendMessageToAgent: (agentId: string, sessionId: string, content: string, onEvent?: (event: any) => void) => Promise<any[]>
  createNewSession: (agentId: string) => Promise<Session>

  // 会话持久化操作
  fetchConversations: (agentId: string) => Promise<void>
  refreshConversation: (agentId: string, sessionId: string) => Promise<void>
  loadMoreMessages: (agentId: string, sessionId: string, before: string) => Promise<void>
  fetchAgentsWithConversations: () => Promise<{ fromCache?: boolean }>
}

const defaultTools: MCPTool[] = [
  { id: 'web-search', name: '网络搜索', description: '搜索互联网获取最新信息', category: 'search', enabled: true },
  { id: 'code-exec', name: '代码执行', description: '在安全沙箱中执行代码', category: 'code', enabled: true },
  { id: 'file-read', name: '文件读取', description: '读取和分析上传的文件', category: 'file', enabled: true },
  { id: 'data-analysis', name: '数据分析', description: '分析和可视化数据', category: 'data', enabled: true },
  { id: 'web-browse', name: '网页浏览', description: '访问和提取网页内容', category: 'web', enabled: false },
  { id: 'image-gen', name: '图像生成', description: '根据描述生成图像', category: 'system', enabled: false },
]

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: initialState.conversations,
  currentConversationId: initialState.currentConversationId,
  isSidebarOpen: true,
  isRightPanelOpen: false,
  isStreaming: false,
  mcpTools: defaultTools,
  settings: {
    theme: 'system',
    language: 'zh-CN',
  },
  rightPanelTabs: [],
  activeRightPanelTab: null,
  settingsActiveSection: null,
  
  // Agent相关状态
  agents: initialState.agents,
  currentAgentId: initialState.currentAgentId,
  agentStatus: {},
  wsConnections: {},
  isConnecting: false,
  connectionError: null,
  _stoppingInProgress: false,
  agentCreateFlag: 0,

  createConversation: async (agentId?: string, agentName?: string) => {
     let sessionId: string | undefined
     // If agentId is provided, set it as current agent and create a new session
     if (agentId) {
       try {
         const session = await get().createNewSession(agentId)
         sessionId = session.id
       } catch (error) {
         console.error('Failed to create session:', error)
       }
     }

     const id = generateUUID()
     const newConversation: Conversation = {
       id,
       title: '新对话',
       messages: [],
       createdAt: new Date(),
       updatedAt: new Date(),
       agentId,
       agentName,
       sessionId,
       isStreaming: false
     }
    cacheDelete(CACHE_KEYS.CONVERSATIONS_WITH_NAMES)
    set((state) => {
      syncUrlParams(agentId, sessionId)
      return {
        conversations: [newConversation, ...state.conversations],
        currentConversationId: id,
        ...(agentId ? { currentAgentId: agentId } : {})
      }
    })

    return id
  },

  deleteConversation: async (id) => {
    const state = get()
    const conversation = state.conversations.find(c => c.id === id)

    // If the conversation has its own sessionId, delete the backend session directly
    if (conversation?.sessionId && conversation?.agentId) {
      try {
        if (!USE_MOCK_DATA) {
          await sessionService.deleteSession(conversation.agentId, conversation.sessionId)
        }
      } catch (error) {
        console.error('Failed to delete session:', error)
      }
    }

    cacheDelete(CACHE_KEYS.CONVERSATIONS_WITH_NAMES)
    set((state) => {
      const filtered = state.conversations.filter((c) => c.id !== id)
      const newCurrentId = state.currentConversationId === id
        ? filtered[0]?.id || null
        : state.currentConversationId

      // Sync URL: if current conversation was deleted, update URL to fallback or clear session
      if (state.currentConversationId === id) {
        if (newCurrentId) {
          const newConv = filtered.find(c => c.id === newCurrentId)
          if (newConv) {
            syncUrlParams(newConv.agentId, newConv.sessionId)
          }
        } else {
          syncUrlParams(state.currentAgentId || undefined)
        }
      }

      return {
        conversations: filtered,
        currentConversationId: newCurrentId,
      }
    })
  },

  deleteMessage: (conversationId, messageId) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              messages: c.messages.filter((m) => m.id !== messageId),
            }
          : c
      ),
    }))
  },

  setCurrentConversation: (id) => {
    set((state) => {
      const conversation = state.conversations.find(c => c.id === id)
      if (conversation) {
        syncUrlParams(conversation.agentId, conversation.sessionId)
      }
      return {
        currentConversationId: id,
        ...(conversation?.agentId ? { currentAgentId: conversation.agentId } : {})
      }
    })
  },

  addMessage: (conversationId, message) => {
    const state = get()
    const conv = state.conversations.find((c) => c.id === conversationId)
    if (!conv) return

    const isFirstMessage = conv.messages.length === 0 && message.role === 'user'
    const newTitle = isFirstMessage
      ? message.content.slice(0, 30) + (message.content.length > 30 ? '...' : '')
      : conv.title

    set((state) => {
      const idx = state.conversations.findIndex((c) => c.id === conversationId)
      if (idx === -1) return state
      const conv = state.conversations[idx]
      const updated = {
        ...conv,
        messages: [...conv.messages, message],
        updatedAt: new Date(),
        title: newTitle,
      }
      const next = [...state.conversations]
      next.splice(idx, 1)
      next.unshift(updated)
      return { conversations: next }
    })
  },

  updateMessage: (conversationId, messageId, updates) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId ? { ...m, ...(typeof updates === 'function' ? updates(m) : updates) } : m
              ),
            }
          : c
      ),
    }))
  },

  toggleSidebar: () => {
    set((state) => ({ isSidebarOpen: !state.isSidebarOpen }))
  },

  toggleRightPanel: () => {
    set((state) => ({ isRightPanelOpen: !state.isRightPanelOpen }))
  },

  setStreaming: (conversationId: string | null, streaming: boolean) => {
    if (!conversationId) return
    set((state) => ({
      conversations: state.conversations.map((conv) =>
        conv.id === conversationId ? { ...conv, isStreaming: streaming } : conv
      )
    }))
  },

  stopStreaming: () => {
    const state = get()
    if (state._stoppingInProgress) return

    const conversationId = state.currentConversationId
    if (!conversationId) return

    const conversation = state.conversations.find(conv => conv.id === conversationId)
    const agentId = conversation?.agentId || state.currentAgentId
    if (agentId) {
      set({ _stoppingInProgress: true })
      messageService.abortMessage(agentId, conversation?.sessionId)
    }

    set((state) => ({
      _stoppingInProgress: false,
      conversations: state.conversations.map((conv) =>
        conv.id === conversationId
          ? {
              ...conv,
              isStreaming: false,
              messages: conv.messages.map((message) =>
                message.role === 'assistant' && (message.isStreaming || message.toolCalls?.some((toolCall) => toolCall.status === 'running'))
                  ? {
                      ...message,
                      isStreaming: false,
                      status: MessageStatus.INTERRUPTED,
                      toolCalls: message.toolCalls?.map((toolCall) =>
                        toolCall.status === 'running'
                          ? { ...toolCall, status: 'error' as const, error: toolCall.error || '已停止生成' }
                          : toolCall
                      ),
                      events: message.events?.map((event) =>
                        event.toolCall?.status === 'running'
                          ? {
                              ...event,
                              toolCall: {
                                ...event.toolCall,
                                status: 'error' as const,
                                error: event.toolCall.error || '已停止生成',
                              },
                            }
                          : event
                      ),
                    }
                  : message
              ),
            }
          : conv
      )
    }))
  },

  toggleTool: (toolId) => {
    set((state) => ({
      mcpTools: state.mcpTools.map((t) =>
        t.id === toolId ? { ...t, enabled: !t.enabled } : t
      ),
    }))
  },

  updateConversationTitle: (id, title) => {
    cacheDelete(CACHE_KEYS.CONVERSATIONS_WITH_NAMES)
    set((state) => {
      const idx = state.conversations.findIndex((c) => c.id === id)
      if (idx === -1) return state
      const updated = { ...state.conversations[idx], title, updatedAt: new Date() }
      const next = [...state.conversations]
      next.splice(idx, 1)
      next.unshift(updated)
      return { conversations: next }
    })
    const conv = get().conversations.find(c => c.id === id)
    if (conv?.agentId && conv?.sessionId) {
      sessionService.updateConversation(conv.agentId, conv.sessionId, { title }).catch(err =>
        console.error('Failed to persist title:', err)
      )
    }
  },

  togglePinConversation: (id) => {
    cacheDelete(CACHE_KEYS.CONVERSATIONS_WITH_NAMES)
    set((state) => {
      const conv = state.conversations.find(c => c.id === id)
      const newPinned = !conv?.pinned
      if (conv?.agentId && conv?.sessionId) {
        sessionService.updateConversation(conv.agentId, conv.sessionId, { pinned: newPinned }).catch(err =>
          console.error('Failed to persist pin:', err)
        )
      }
      return {
        conversations: state.conversations.map((c) =>
          c.id === id ? { ...c, pinned: newPinned } : c
        ),
      }
    })
  },

  updateSettings: (settings) => {
    set((state) => ({
      settings: { ...state.settings, ...settings },
    }))
  },
  
  addRightPanelTab: (tab) => {
    set((state) => {
      const existingTab = state.rightPanelTabs.find(t => t.id === tab.id)
      if (existingTab) {
        return state
      }
      return {
        rightPanelTabs: [...state.rightPanelTabs, tab]
      }
    })
  },
  
  removeRightPanelTab: (tabId) => {
    set((state) => {
      const updatedTabs = state.rightPanelTabs.filter(tab => tab.id !== tabId)
      let newActiveTab = state.activeRightPanelTab
      if (newActiveTab === tabId) {
        newActiveTab = updatedTabs.length > 0 ? updatedTabs[0].id : null
      }
      return {
        rightPanelTabs: updatedTabs,
        activeRightPanelTab: newActiveTab
      }
    })
  },
  
  setActiveRightPanelTab: (tabId) => {
    set({
      activeRightPanelTab: tabId
    })
  },
  
  setSettingsActiveSection: (section) => {
    set({
      settingsActiveSection: section
    })
  },
  
  // Agent相关操作
  setCurrentAgent: (agentId) => {
    const currentSessionId = new URLSearchParams(window.location.search).get('session')
    set({ currentAgentId: agentId })
    if (!get().currentConversationId) {
      syncUrlParams(agentId || undefined, currentSessionId || undefined)
    }
  },

  triggerAgentCreate: () => set((state) => ({
    agentCreateFlag: state.agentCreateFlag + 1
  })),

  startNewTask: (agentId) => {
    set({ currentConversationId: null, currentAgentId: agentId })
    syncUrlParams(agentId)
  },

  createLocalConversation: (agentId, agentName) => {
    const id = generateUUID()
    set((state) => {
      syncUrlParams(agentId)
      return {
        conversations: [
          {
            id,
            title: '新对话',
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            agentId,
            agentName,
            isStreaming: false,
          },
          ...state.conversations,
        ],
        currentConversationId: id,
      }
    })
    return id
  },

  assignSessionToConversation: (convId, sessionId) => {
    set((state) => {
      const conv = state.conversations.find(c => c.id === convId)
      if (!conv) return {}
      syncUrlParams(conv.agentId, sessionId)
      return {
        conversations: state.conversations.map(c =>
          c.id === convId ? { ...c, sessionId } : c
        )
      }
    })
  },

  addAgent: (agent) => {
    set((state) => ({
      agents: [...state.agents, agent]
    }))
  },
  
  updateAgent: (agent) => {
    set((state) => ({
      agents: state.agents.map(a => a.id === agent.id ? agent : a)
    }))
  },
  
  removeAgent: (agentId) => {
    cacheDelete(CACHE_KEYS.AGENTS)
    cacheDelete(CACHE_KEYS.CONVERSATIONS_WITH_NAMES)
    set((state) => {
      const agents = state.agents.filter(a => a.id !== agentId)
      const agentStatus = { ...state.agentStatus }
      delete agentStatus[agentId]
      const conversations = state.conversations.filter(c => c.agentId !== agentId)
      const currentConversationId = state.currentConversationId &&
        conversations.some(c => c.id === state.currentConversationId)
          ? state.currentConversationId
          : null

      // If the deleted agent was the current one, pick the next available
      const isCurrentAgentDeleted = state.currentAgentId === agentId
      const nextAgentId = isCurrentAgentDeleted
        ? (agents.find(a => a.status !== 'deleted')?.id ?? null)
        : state.currentAgentId

      // Sync URL params: removed conversation OR removed current agent
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
  
  setAgents: (agents) => {
    set(() => ({
      agents
    }))
  },
  
  initializeAgent: async (config: any) => {
    let newAgent: Agent
    
    if (USE_MOCK_DATA) {
      // 使用模拟数据
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
        idleTimeoutSeconds: config.idleTimeoutSeconds || 300,
        createdAt: now,
        updatedAt: now
      }
      
      get().addAgent(newAgent)
      get().setCurrentAgent(newAgent.id)
    } else {
      // 实际调用API创建Agent
      newAgent = await agentService.createAgent(config)
      get().addAgent(newAgent)
      get().setCurrentAgent(newAgent.id)
    }
    
    return newAgent
  },
  
  connectToAgent: async (agentId: string) => {
    set({ isConnecting: true, connectionError: null })

    try {
      // 确保有活动会话
      const currentConvId = get().currentConversationId
      const currentConv = currentConvId ? get().conversations.find(c => c.id === currentConvId) : null
      let session: Session | undefined

      if (currentConv?.sessionId) {
        session = { id: currentConv.sessionId } as Session
      } else {
        session = await get().createNewSession(agentId)
      }
      
      // 实际调用API建立WebSocket连接
      const wsClient = messageService.connectForMessages(
        agentId,
        session.id,
        (event: any) => {
          console.log(`[WS] type: ${event.type}`)
          
          // 处理不同类型的事件
          switch (event.type) {
            case 'message.delta':
              // 处理增量消息
              if (event.payload?.delta) {
                // 查找当前对话中的助手消息
                const currentConversationId = get().currentConversationId
                if (currentConversationId) {
                  const conversation = get().conversations.find(c => c.id === currentConversationId)
                  if (conversation) {
                    const assistantMessage = conversation.messages.find(
                      m => m.role === 'assistant' && m.isStreaming
                    )
                    if (assistantMessage) {
                      get().updateMessage(
                        currentConversationId,
                        assistantMessage.id,
                        {
                          content: (assistantMessage.content || '') + event.payload.delta
                        }
                      )
                    }
                  }
                }
              }
              break
            case 'message.completed':
              // 处理消息完成
              if (event.payload?.text) {
                const currentConversationId = get().currentConversationId
                if (currentConversationId) {
                  const conversation = get().conversations.find(c => c.id === currentConversationId)
                  if (conversation) {
                    const assistantMessage = conversation.messages.find(
                      m => m.role === 'assistant' && m.isStreaming
                    )
                    if (assistantMessage) {
                      get().updateMessage(
                        currentConversationId,
                        assistantMessage.id,
                        {
                          content: event.payload.text,
                          isStreaming: false
                        }
                      )
                      get().setStreaming(currentConversationId, false)
                    }
                  }
                }
              }
              break
            case 'tool.call.started':
              // 处理工具调用开始
              if (event.payload?.tool_name) {
                const currentConversationId = get().currentConversationId
                if (currentConversationId) {
                  const conversation = get().conversations.find(c => c.id === currentConversationId)
                  if (conversation) {
                    const assistantMessage = conversation.messages.find(
                      m => m.role === 'assistant' && m.isStreaming
                    )
                    if (assistantMessage) {
                      const toolCall = {
                        id: event.payload.tool_call_id || generateUUID(),
                        name: event.payload.tool_name,
                        status: 'running' as const,
                        input: event.payload.arguments
                      }
                      get().updateMessage(
                        currentConversationId,
                        assistantMessage.id,
                        {
                          toolCalls: [...(assistantMessage.toolCalls || []), toolCall]
                        }
                      )
                    }
                  }
                }
              }
              break
            case 'tool.call.response':
              // 处理工具调用响应
              if (event.payload?.tool_call_id) {
                const currentConversationId = get().currentConversationId
                if (currentConversationId) {
                  const conversation = get().conversations.find(c => c.id === currentConversationId)
                  if (conversation) {
                    const assistantMessage = conversation.messages.find(
                      m => m.role === 'assistant'
                    )
                    if (assistantMessage && assistantMessage.toolCalls) {
                      const updatedToolCalls = assistantMessage.toolCalls.map(toolCall => {
                        if (toolCall.id === event.payload.tool_call_id) {
                          return {
                            ...toolCall,
                            status: 'completed' as const,
                            output: event.payload.content,
                            error: event.payload.is_error ? event.payload.content : undefined,
                            duration: event.payload.duration
                          }
                        }
                        return toolCall
                      })
                      get().updateMessage(
                        currentConversationId,
                        assistantMessage.id,
                        {
                          toolCalls: updatedToolCalls
                        }
                      )
                    }
                  }
                }
              }
              break
            case 'usage.updated':
              // 处理用量更新
              console.log('Usage updated:', event.payload)
              break
            case 'stream.error':
            case 'client.error':
              // 处理错误
              console.error('Error event:', event.payload)
              const currentConversationId = get().currentConversationId
              get().setStreaming(currentConversationId, false)
              break
            default:
              console.log('Unknown event type:', event.type)
          }
        },
        (error) => {
          set({ connectionError: error.message, isConnecting: false })
          const currentConversationId = get().currentConversationId
          get().setStreaming(currentConversationId, false)
        }
      )

      set((state) => {
        const wsConnections = { ...state.wsConnections }
        wsConnections[agentId] = wsClient
        return { wsConnections, isConnecting: false }
      })
    } catch (error: any) {
      set({ isConnecting: false, connectionError: error.message })
    }
  },
  
  disconnectFromAgent: (agentId: string) => {
    messageService.disconnect(agentId)
    set((state) => {
      const wsConnections = { ...state.wsConnections }
      if (wsConnections[agentId]) {
        const wsClient = wsConnections[agentId]
        wsClient.close()
        delete wsConnections[agentId]
      }
      return { wsConnections }
    })
  },
  
  sendMessageToAgent: async (agentId: string, sessionId: string, content: string, onEvent?: (event: any) => void) => {
    if (!sessionId) {
      throw new Error('No active session for agent')
    }
    
    try {
      // 调用流式API发送消息
      const events = await messageService.sendMessage(agentId, sessionId, content, onEvent)
      
      return events
    } catch (error) {
      console.error('Error sending message:', error)
      throw error
    }
  },
  
  fetchConversations: async (agentId: string) => {
    try {
      const summaries = await sessionService.getConversations(agentId)
      const agent = get().agents.find(a => a.id === agentId)
      const conversations = summaries.map((s: any) =>
        sessionService.transformConversationSummary(s, agent?.name)
      )
      set((state) => {
        const existingIds = new Set(state.conversations.map(c => c.id))
        const existingSessionIds = new Set(state.conversations.map(c => c.sessionId).filter(Boolean))
        const newConversations = conversations.filter(
          (c: Conversation) => !existingIds.has(c.id) && !existingSessionIds.has(c.sessionId)
        )
        return {
          conversations: [...newConversations, ...state.conversations],
        }
      })
    } catch (error) {
      console.error('Failed to fetch conversations:', error)
    }
  },

  refreshConversation: async (agentId: string, sessionId: string) => {
    try {
      const detail = await sessionService.getConversation(agentId, sessionId)
      const messages = (detail.messages || []).map((msg: any) =>
        sessionService.transformMessage(msg)
      )
      set((state) => {
        const existing = state.conversations.find(
          c => c.sessionId === sessionId
        )
        if (existing) {
          return {
            conversations: state.conversations.map((c) =>
              c.sessionId === sessionId
                ? { ...c, messages, hasMore: detail.has_more ?? false, updatedAt: new Date(detail.updated_at) }
                : c
            ),
            currentConversationId: existing.id,
            currentAgentId: agentId,
          }
        }
        const placeholder: Conversation = {
          id: generateUUID(),
          title: detail.title || '新对话',
          messages,
          createdAt: new Date(detail.created_at),
          updatedAt: new Date(detail.updated_at),
          pinned: detail.pinned,
          agentId,
          sessionId,
          hasMore: detail.has_more ?? false,
        }
        return {
          conversations: [placeholder, ...state.conversations],
          currentConversationId: placeholder.id,
          currentAgentId: agentId,
        }
      })
    } catch (error) {
      console.error('Failed to refresh conversation:', error)
      const currentSessionId = new URLSearchParams(window.location.search).get('session')
      syncUrlParams(agentId, currentSessionId || undefined)
    }
  },

  loadMoreMessages: async (agentId: string, sessionId: string, before: string) => {
    try {
      const detail = await sessionService.getConversation(agentId, sessionId, 20, before)
      const olderMessages = (detail.messages || []).map((msg: any) =>
        sessionService.transformMessage(msg)
      )
      set((state) => {
        const existing = state.conversations.find(
          c => c.sessionId === sessionId
        )
        if (!existing) return state
        const existingIds = new Set(existing.messages.map((m: Message) => m.id))
        const newMessages = olderMessages.filter((m: Message) => !existingIds.has(m.id))
        return {
          conversations: state.conversations.map((c) =>
            c.sessionId === sessionId
              ? {
                  ...c,
                  messages: [...newMessages, ...c.messages],
                  hasMore: detail.has_more ?? false,
                }
              : c
          ),
        }
      })
    } catch (error) {
      console.error('Failed to load more messages:', error)
    }
  },

  fetchAgentsWithConversations: async () => {
    let fromCache = false

    const cached = cacheGetAll()
    if (cached) {
      fromCache = true
      set(state => {
        const existingIds = new Set(state.conversations.map(c => c.id))
        const existingSessionIds = new Set(state.conversations.map(c => c.sessionId).filter(Boolean))
        const patched: Conversation[] = state.conversations.map(c => {
          if (!c.agentName && c.sessionId) {
            for (const [sid, name] of cached.sessionAgentNames) {
              if (sid === c.sessionId) return { ...c, agentName: name }
            }
          }
          return c
        })
        const freshConvs = cached.conversations.filter(
          c => !existingIds.has(c.id) && !existingSessionIds.has(c.sessionId)
        )
        const merged = [...freshConvs, ...patched].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )
        return {
          agents: cached.agents,
          conversations: merged,
        }
      })
    }
    const doNetworkRefresh = async () => {
      try {
        const enriched = await agentService.getAgentsWithConversations()
        const agents: Agent[] = enriched.map((item: any) => agentService.transformAgent(item))

        const agentIds = new Set(agents.map(a => a.id))
        const existingIds = new Set(get().conversations.map(c => c.id))
        const existingSessionIds = new Set(get().conversations.map(c => c.sessionId).filter(Boolean))
        const allConversations: Conversation[] = []
        const sessionAgentNames: [string, string][] = []

        for (const item of enriched) {
          const agentName = item.name
          for (const summary of item.conversations || []) {
            const sessId: string = summary.id
            sessionAgentNames.push([sessId, agentName])
            allConversations.push(
              sessionService.transformConversationSummary(summary, agentName)
            )
          }
        }

        const newConversations = allConversations.filter(
          c => !existingIds.has(c.id) && !existingSessionIds.has(c.sessionId)
        )

        cacheSetAll({
          agents,
          conversations: allConversations,
          sessionAgentNames,
        }, 2 * 60 * 1000)

        set(state => {
          const patched = state.conversations
            .map(c => {
              if (!c.agentName && c.sessionId) {
                for (const [sid, name] of sessionAgentNames) {
                  if (sid === c.sessionId) return { ...c, agentName: name }
                }
              }
              return c
            })
            .filter(c => !c.agentId || agentIds.has(c.agentId))

          const merged = [...newConversations, ...patched].sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          )

          const convStillExists = merged.some(c => c.id === state.currentConversationId)
          if (!convStillExists && state.currentConversationId) {
            syncUrlParams(state.currentAgentId || undefined)
          }
          return {
            agents,
            conversations: merged,
            ...(convStillExists ? {} : { currentConversationId: null }),
          }
        })
      } catch (error) {
        console.error('Failed to fetch agents with conversations:', error)
      }
    }

    if (fromCache) {
      doNetworkRefresh()
      return { fromCache: true }
    }

    await doNetworkRefresh()
    return { fromCache: false }
  },

  createNewSession: async (agentId: string) => {
    let session: Session
    
    if (USE_MOCK_DATA) {
      // 模拟创建会话
      const now = new Date().toISOString()
      session = {
        id: generateUUID(),
        agentId,
        status: SessionStatus.ACTIVE,
        contextInitialized: true,
        runtimeType: 'openclaw',
        createdAt: now,
        updatedAt: now
      }
    } else {
      // 实际调用API创建会话
      session = await sessionService.createSession(agentId)
    }

    return session
  }
}))

