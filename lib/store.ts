import { create } from 'zustand'
import type { Conversation, Message, MCPTool, Agent, Session, AgentEvent } from './types'
import { AgentStatus, AdapterType, SessionStatus, SandboxType } from './types'
import { WebSocketClient } from '@/lib/websocket-client'
import { messageService } from '@/services/message-service'
import { agentService } from '@/services/agent-service'
import { sessionService } from '@/services/session-service'

// 环境变量控制是否使用模拟数据
const USE_MOCK_DATA = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true'

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
  isStreaming: boolean
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
  
  // Actions
  createConversation: (agentId?: string) => Promise<string>
  deleteConversation: (id: string) => void
  setCurrentConversation: (id: string) => void
  addMessage: (conversationId: string, message: Message) => void
  updateMessage: (conversationId: string, messageId: string, updates: Partial<Message> | ((message: Message) => Partial<Message>)) => void
  deleteMessage: (conversationId: string, messageId: string) => void
  toggleSidebar: () => void
  toggleRightPanel: () => void
  setStreaming: (streaming: boolean) => void
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
  initializeAgent: (config: any) => Promise<Agent>
  connectToAgent: (agentId: string) => Promise<void>
  disconnectFromAgent: (agentId: string) => void
  sendMessageToAgent: (agentId: string, content: string, onEvent?: (event: any) => void) => Promise<any[]>
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

const demoConversations: Conversation[] = [
  {
    id: '1',
    title: '项目架构设计讨论',
    createdAt: new Date(Date.now() - 3600000),
    updatedAt: new Date(Date.now() - 1800000),
    pinned: true,
    messages: [
      {
        id: 'm1',
        role: 'user',
        content: '帮我设计一个微服务架构的电商系统',
        timestamp: new Date(Date.now() - 3600000),
      },
      {
        id: 'm2',
        role: 'assistant',
        content: '好的，我来帮你设计一个微服务架构的电商系统。这个系统可以分为以下几个核心服务：\n\n## 1. 用户服务 (User Service)\n- 用户注册、登录、认证\n- 用户信息管理\n- 权限控制\n\n## 2. 商品服务 (Product Service)\n- 商品CRUD操作\n- 商品分类管理\n- 库存管理\n\n## 3. 订单服务 (Order Service)\n- 订单创建与管理\n- 订单状态流转\n- 订单查询\n\n## 4. 支付服务 (Payment Service)\n- 支付接口集成\n- 支付状态管理\n- 退款处理\n\n## 5. 通知服务 (Notification Service)\n- 邮件通知\n- 短信通知\n- 站内消息\n\n需要我详细展开某个服务的设计吗？',
        timestamp: new Date(Date.now() - 3500000),
        toolCalls: [
          {
            id: 'tc1',
            name: '架构分析',
            status: 'completed',
            duration: 2500,
          }
        ]
      },
    ],
  },
  {
    id: '2',
    title: 'Python 数据处理脚本',
    createdAt: new Date(Date.now() - 86400000),
    updatedAt: new Date(Date.now() - 43200000),
    messages: [
      {
        id: 'm3',
        role: 'user',
        content: '写一个处理 CSV 文件的 Python 脚本',
        timestamp: new Date(Date.now() - 86400000),
      },
    ],
  },
  {
    id: '3',
    title: 'React 性能优化',
    createdAt: new Date(Date.now() - 172800000),
    updatedAt: new Date(Date.now() - 172800000),
    messages: [],
  },
]

// 处理流式事件
const handleEvent = (event: any, conversationId: string, messageId: string) => {
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
      id: event.payload?.tool_call_id || crypto.randomUUID(),
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
        store.setStreaming(false)
      }
      break
    case 'thinking':
      // 处理思考过程
      break
    case 'tool.call.started':
      // 处理工具调用开始
      if (event.payload?.tool_name) {
        const toolCall = {
          id: event.payload.tool_call_id || crypto.randomUUID(),
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
      store.setStreaming(false)
      break
    default:
      console.log('Unknown event type:', event.type)
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: demoConversations,
  currentConversationId: '1',
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
  currentAgentId: null,
  agentStatus: {},
  activeSessions: {},
  wsConnections: {},
  isConnecting: false,
  connectionError: null,

  createConversation: async (agentId?: string) => {
    const id = crypto.randomUUID()
    const newConversation: Conversation = {
      id,
      title: '新对话',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    set((state) => ({
      conversations: [newConversation, ...state.conversations],
      currentConversationId: id,
    }))
    
    // If agentId is provided, set it as current agent and create a new session
    if (agentId) {
      set({ currentAgentId: agentId })
      // Create a new session for the agent
      try {
        await get().createNewSession(agentId)
      } catch (error) {
        console.error('Failed to create session:', error)
      }
    }
    
    return id
  },

  deleteConversation: (id) => {
    set((state) => {
      const filtered = state.conversations.filter((c) => c.id !== id)
      const newCurrentId = state.currentConversationId === id
        ? filtered[0]?.id || null
        : state.currentConversationId
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
    set({ currentConversationId: id })
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

  setStreaming: (streaming) => {
    set({ isStreaming: streaming })
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
  
  initializeAgent: async (config: any) => {
    let newAgent: Agent
    
    if (USE_MOCK_DATA) {
      // 使用模拟数据
      const now = new Date().toISOString()
      newAgent = {
        id: crypto.randomUUID(),
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
      let session = get().activeSessions[agentId]
      if (!session) {
        session = await get().createNewSession(agentId)
      }
      
      // 实际调用API建立WebSocket连接
      const wsClient = messageService.connectForMessages(
        agentId,
        session.id,
        (event: any) => {
          // 处理接收到的消息
          console.log('Received event:', event)
          
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
                      get().setStreaming(false)
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
                        id: event.payload.tool_call_id || crypto.randomUUID(),
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
              get().setStreaming(false)
              break
            default:
              console.log('Unknown event type:', event.type)
          }
        },
        (error) => {
          set({ connectionError: error.message, isConnecting: false })
          get().setStreaming(false)
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
  
  sendMessageToAgent: async (agentId: string, content: string, onEvent?: (event: any) => void) => {
    // 获取当前活动会话
    const activeSession = get().activeSessions[agentId]
    if (!activeSession) {
      throw new Error('No active session for agent')
    }
    
    try {
      // 调用流式API发送消息
      const events = await messageService.sendMessage(agentId, activeSession.id, content, onEvent)
      
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
        id: crypto.randomUUID(),
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
