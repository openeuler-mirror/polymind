import { create } from 'zustand'
import type { Conversation, Message, MCPTool, ToolCall } from './types'

interface ChatState {
  conversations: Conversation[]
  currentConversationId: string | null
  isSidebarOpen: boolean
  isStreaming: boolean
  mcpTools: MCPTool[]
  
  // Actions
  createConversation: () => string
  deleteConversation: (id: string) => void
  setCurrentConversation: (id: string) => void
  addMessage: (conversationId: string, message: Message) => void
  updateMessage: (conversationId: string, messageId: string, updates: Partial<Message>) => void
  toggleSidebar: () => void
  setStreaming: (streaming: boolean) => void
  toggleTool: (toolId: string) => void
  updateConversationTitle: (id: string, title: string) => void
  togglePinConversation: (id: string) => void
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

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: demoConversations,
  currentConversationId: '1',
  isSidebarOpen: true,
  isStreaming: false,
  mcpTools: defaultTools,

  createConversation: () => {
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
                m.id === messageId ? { ...m, ...updates } : m
              ),
            }
          : c
      ),
    }))
  },

  toggleSidebar: () => {
    set((state) => ({ isSidebarOpen: !state.isSidebarOpen }))
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
}))
