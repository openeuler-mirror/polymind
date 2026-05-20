import { create } from 'zustand'
import type { Conversation, Message, MCPTool, Agent, Session, AgentEvent } from './types'
import { AgentStatus, AdapterType, SessionStatus, SandboxType } from './types'
import { WebSocketClient } from '@/lib/websocket-client'
import { messageService } from '@/services/message-service'
import { agentService } from '@/services/agent-service'
import { sessionService } from '@/services/session-service'
import { generateUUID } from './utils'

// 环境变量控制是否使用模拟数据
const USE_MOCK_DATA = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true'

function getInitialState() {
  if (typeof window === 'undefined') {
    return {
      conversations: [],
      currentConversationId: null,
      currentAgentId: null,
    }
  }
  
  try {
    const savedConversations = localStorage.getItem('polymind-conversations')
    const savedCurrentId = localStorage.getItem('polymind-current-conversation')
    const savedCurrentAgentId = localStorage.getItem('polymind-current-agent')
    
    if (savedConversations) {
      const parsed = JSON.parse(savedConversations)
      if (Array.isArray(parsed) && parsed.length > 0) {
        const conversations = parsed.map((conv: any) => ({
          ...conv,
          createdAt: new Date(conv.createdAt),
          updatedAt: new Date(conv.updatedAt),
          isStreaming: conv.isStreaming ?? false,
          messages: conv.messages.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }))
        }))
        
        return {
          conversations,
          currentConversationId: savedCurrentId || parsed[0]?.id || null,
          currentAgentId: savedCurrentAgentId || null,
        }
      }
    }
  } catch (err) {
    console.error('Failed to load from localStorage:', err)
  }
  
  return {
    conversations: [],
    currentConversationId: null,
    currentAgentId: null,
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
  
  // Agent相关状态
  agents: Agent[]
  currentAgentId: string | null
  agentStatus: Record<string, Agent['status']>
  
  // 会话相关状态
  activeSessions: Record<string, Session> // agentId -> session
  
  // 连接状态
  wsConnections: Record<string, WebSocketClient> // agentId -> websocket
  isConnecting: boolean
  connectionError: string | null

  // 停止生成锁
  _stoppingInProgress: boolean
  
  // Actions
  createConversation: (agentId?: string, agentName?: string) => Promise<string>
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
  
  // Agent相关操作
  setCurrentAgent: (agentId: string | null) => void
  addAgent: (agent: Agent) => void
  updateAgent: (agent: Agent) => void
  removeAgent: (agentId: string) => void
  setAgents: (agents: Agent[]) => void
  initializeAgent: (config: any) => Promise<Agent>
  connectToAgent: (agentId: string) => Promise<void>
  disconnectFromAgent: (agentId: string) => void
  sendMessageToAgent: (agentId: string, sessionId: string | undefined, content: string, onEvent?: (event: any) => void) => Promise<any[]>
  createNewSession: (agentId: string) => Promise<Session>
}

const defaultTools: MCPTool[] = [
  { id: 'web-search', name: '网络搜索', description: '搜索互联网获取最新信息', category: 'search', enabled: true },
  { id: 'code-exec', name: '代码执行', description: '在安全沙箱中执行代码', category: 'code', enabled: true },
  { id: 'file-read', name: '文件读取', description: '读取和分析上传的文件', category: 'file', enabled: true },
  { id: 'data-analysis', name: '数据分析', description: '分析和可视化数据', category: 'data', enabled: true },
  { id: 'web-browse', name: '网页浏览', description: '访问和提取网页内容', category: 'web', enabled: false },
  { id: 'image-gen', name: '图像生成', description: '根据描述生成图像', category: 'system', enabled: false },
]

const demoConversations: Conversation[] = []

// 处理流式事件
const handleEvent = (event: any, conversationId: string, messageId: string) => {
  console.log(`[Event] type: ${event.type}`)
  
  const getStore = () => useChatStore.getState()
  const store = getStore()
  
  // 获取当前消息
  const message = store.conversations
    .find(c => c.id === conversationId)
    ?.messages.find(m => m.id === messageId)
  
  if (!message) return
  
  // 将事件添加到消息的 events 数组中
  const eventItem = {
    type: event.type,
    content: event.payload?.delta || event.payload?.display_text || event.payload?.content || '',
    timestamp: event.ts_ms || Date.now(),
    toolCall: event.type === 'tool.call.response' ? {
      id: event.payload?.tool_call_id || generateUUID(),
      name: event.payload?.name || event.payload?.tool_name || '',
      status: 'completed' as const,
      input: event.payload?.arguments,
      output: event.payload?.content,
      error: event.payload?.is_error ? event.payload?.content : undefined,
      duration: event.payload?.duration
    } : undefined
  }
  
  // 更新消息的 events 数组
  store.updateMessage(conversationId, messageId, {
    events: [...(message.events || []), eventItem]
  })
  
  // 处理不同类型的事件
  switch (event.type) {
    case 'message.delta':
      // 处理增量消息
      if (event.payload?.delta) {
        store.updateMessage(conversationId, messageId, {
          content: (message.content || '') + event.payload.delta
        })
      }
      break
    case 'message.completed':
      // 处理消息完成
      if (event.payload?.text) {
        store.updateMessage(conversationId, messageId, {
          content: event.payload.text,
          isStreaming: false
        })
        store.setStreaming(conversationId, false)
      }
      break
    case 'thinking':
      // 处理思考过程
      break
    case 'tool.call.started':
      // 处理工具调用开始
      if (event.payload?.tool_name) {
        const toolCall = {
          id: event.payload.tool_call_id || generateUUID(),
          name: event.payload.tool_name,
          status: 'running' as const,
          input: event.payload.arguments
        }
        store.updateMessage(conversationId, messageId, {
          toolCalls: [...(message.toolCalls || []), toolCall]
        })
      }
      break
    case 'tool.call.response':
      // 处理工具调用响应
      if (event.payload?.tool_call_id) {
        if (message.toolCalls) {
          const updatedToolCalls = message.toolCalls.map(toolCall => {
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
          store.updateMessage(conversationId, messageId, {
            toolCalls: updatedToolCalls
          })
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
      store.setStreaming(conversationId, false)
      break
    default:
      console.log('Unknown event type:', event.type)
  }
}

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
  
  // Agent相关状态
  agents: [],
  currentAgentId: initialState.currentAgentId,
  agentStatus: {},
  activeSessions: {},
  wsConnections: {},
  isConnecting: false,
  connectionError: null,
  _stoppingInProgress: false,

  createConversation: async (agentId?: string, agentName?: string) => {
     const id = generateUUID()
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
    set((state) => ({
      conversations: [newConversation, ...state.conversations],
      currentConversationId: id,
      ...(agentId ? { currentAgentId: agentId } : {})
    }))

    return id
  },

  deleteConversation: async (id) => {
    const state = get()
    const conversation = state.conversations.find(c => c.id === id)
    let deletedSessionId: string | undefined

    // If the conversation has its own sessionId, delete the backend session directly
    if (conversation?.sessionId && conversation?.agentId) {
      try {
        if (!USE_MOCK_DATA) {
          await sessionService.deleteSession(conversation.agentId, conversation.sessionId)
        }
        deletedSessionId = conversation.sessionId
      } catch (error) {
        console.error('Failed to delete session:', error)
      }
    } else if (state.currentConversationId === id && state.currentAgentId) {
      // for conversations without sessionId, fall back to activeSessions
      const session = state.activeSessions[state.currentAgentId]
      if (session) {
        const otherActiveConversations = state.conversations.filter(
          (conv) => conv.id !== id && conv.messages.length > 0
        )
        if (otherActiveConversations.length === 0) {
          try {
            if (!USE_MOCK_DATA) {
              await sessionService.deleteSession(state.currentAgentId, session.id)
            }
            deletedSessionId = session.id
          } catch (error) {
            console.error('Failed to delete session:', error)
          }
        }
      }
    }

    set((state) => {
      const filtered = state.conversations.filter((c) => c.id !== id)
      const newCurrentId = state.currentConversationId === id
        ? filtered[0]?.id || null
        : state.currentConversationId

      const updates: any = {
        conversations: filtered,
        currentConversationId: newCurrentId,
      }

      // Clean up activeSessions if the deleted session matches
      if (deletedSessionId) {
        const deletedAgentId = conversation?.agentId || state.currentAgentId
        if (deletedAgentId) {
          const session = state.activeSessions[deletedAgentId]
          if (session && session.id === deletedSessionId) {
            const newActiveSessions = { ...state.activeSessions }
            delete newActiveSessions[deletedAgentId]
            updates.activeSessions = newActiveSessions
          }
        }
      }

      return updates
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
      return {
        currentConversationId: id,
        ...(conversation?.agentId ? { currentAgentId: conversation.agentId } : {})
      }
    })
  },

  addMessage: (conversationId, message) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              messages: [...c.messages, message],
              updatedAt: new Date(),
              title: c.messages.length === 0 && message.role === 'user'
                ? message.content.slice(0, 30) + (message.content.length > 30 ? '...' : '')
                : c.title,
            }
          : c
      ),
    }))
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
      messageService.abortMessage(agentId)
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
                      stopped: true,
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
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, title } : c
      ),
    }))
  },

  togglePinConversation: (id) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, pinned: !c.pinned } : c
      ),
    }))
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
  
  // Agent相关操作
  setCurrentAgent: (agentId) => {
    set({ currentAgentId: agentId })
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
    set((state) => {
      const agents = state.agents.filter(a => a.id !== agentId)
      const agentStatus = { ...state.agentStatus }
      delete agentStatus[agentId]
      const activeSessions = { ...state.activeSessions }
      delete activeSessions[agentId]
      
      return {
        agents,
        agentStatus,
        activeSessions
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
      let session = get().activeSessions[agentId]

      if (currentConv?.sessionId) {
        // Conversation has its own sessionId — ensure we connect to that session
        if (!session || session.id !== currentConv.sessionId) {
          session = { id: currentConv.sessionId } as Session
        }
      } else if (!session) {
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
  
  sendMessageToAgent: async (agentId: string, sessionId: string | undefined, content: string, onEvent?: (event: any) => void) => {
    // 获取当前活动会话
    const sid = sessionId || get().activeSessions[agentId]?.id
    if (!sid) {
      throw new Error('No active session for agent')
    }
    
    try {
      // 调用流式API发送消息
      const events = await messageService.sendMessage(agentId, sid, content, onEvent)
      
      return events
    } catch (error) {
      console.error('Error sending message:', error)
      throw error
    }
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
    
    set((state) => {
      const activeSessions = { ...state.activeSessions }
      activeSessions[agentId] = session
      return { activeSessions }
    })
    
    return session
  }
}))

// 订阅状态变化，自动保存到 localStorage
if (typeof window !== 'undefined') {
  let prevConversations = initialState.conversations
  let prevCurrentId = initialState.currentConversationId
  let prevCurrentAgentId = initialState.currentAgentId
  
  useChatStore.subscribe((state) => {
    if (state.conversations !== prevConversations) {
      prevConversations = state.conversations
      if (state.conversations && state.conversations.length > 0) {
        localStorage.setItem('polymind-conversations', JSON.stringify(state.conversations))
      }
    }
    
    if (state.currentConversationId !== prevCurrentId) {
      prevCurrentId = state.currentConversationId
      if (state.currentConversationId) {
        localStorage.setItem('polymind-current-conversation', state.currentConversationId)
      }
    }
    
    if (state.currentAgentId !== prevCurrentAgentId) {
      prevCurrentAgentId = state.currentAgentId
      if (state.currentAgentId) {
        localStorage.setItem('polymind-current-agent', state.currentAgentId)
      }
    }
  })
}
