'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useChatStore } from '@/lib/store'
import { MessageList } from './message-list'
import { ChatInput, PromptSuggestion } from './chat-input'
import { ChatHeader } from './chat-header'
import { WelcomeScreen } from './welcome-screen'
import type { Message } from '@/lib/types'
import { generateUUID } from '@/lib/utils'
import { sessionService } from '@/services/session-service'
import { messageService } from '@/services/message-service'
import { handleStreamEvent } from '@/lib/stream-event-handler'

export function ChatArea() {
  const [isHydrated, setIsHydrated] = useState(false)
  const [presetPrompts, setPresetPrompts] = useState<PromptSuggestion[]>([])
  const {
    conversations,
    currentConversationId,
    addMessage,
    updateMessage,
    deleteMessage,
    setStreaming,
    loadMoreMessages,
  } = useChatStore()

  // 添加预设提示词
  const handleAddPresetPrompt = useCallback((prompt: PromptSuggestion) => {
    setPresetPrompts((prev) => {
      // 避免重复添加
      if (prev.some((p) => p.id === prompt.id)) {
        return prev
      }
      return [...prev, prompt]
    })
  }, [])

  // 删除预设提示词
  const handleRemovePresetPrompt = useCallback((promptId: string) => {
    setPresetPrompts((prev) => prev.filter((p) => p.id !== promptId))
  }, [])

  // 清空所有预设提示词
  const handleClearPresetPrompts = useCallback(() => {
    setPresetPrompts([])
  }, [])

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlAgentId = params.get('agent')
    const urlSessionId = params.get('session')
    if (urlAgentId && urlSessionId) {
      useChatStore.getState().refreshConversation(urlAgentId, urlSessionId)
      return
    }
    // Fall back to localStorage
    const savedConvId = localStorage.getItem('polymind-current-conversation')
    const savedAgentId = localStorage.getItem('polymind-current-agent')
    if (savedConvId && savedAgentId) {
      useChatStore.getState().refreshConversation(savedAgentId, savedConvId)
    }
  }, [])

  const currentConversation = conversations.find(
    (c) => c.id === currentConversationId
  )
  const messages = currentConversation?.messages || []
  const scrollRef = useRef<HTMLDivElement>(null)

  const [loadingMessages, setLoadingMessages] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const loadedSessionIds = useRef<Set<string>>(new Set())
  const skipAutoScroll = useRef(false)
  const scrollHeightBeforeLoad = useRef(0)

  // 用 ref 存储 scroll handler 需要的值，handleScroll 内部通过 ref 读取最新数据
  const scrollCtx = useRef({
    hasMore: false,
    agentId: '',
    sessionId: '',
    messages: [] as Message[],
    cooldown: false,
  })
  useEffect(() => {
    scrollCtx.current.hasMore = currentConversation?.hasMore ?? false
    scrollCtx.current.agentId = currentConversation?.agentId ?? ''
    scrollCtx.current.sessionId = currentConversation?.sessionId ?? ''
  }, [currentConversation?.hasMore, currentConversation?.agentId, currentConversation?.sessionId])
  useEffect(() => {
    scrollCtx.current.messages = messages
  }, [messages])
  // 记录本地创建的信息ids，避免触发reconnect的第二条sse连接
  const locallyCreatedMessageIds = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!currentConversation) return
    if (currentConversation.messages.length > 0) return
    if (!currentConversation.sessionId || !currentConversation.agentId) return

    // 避免重复请求空会话
    if (loadedSessionIds.current.has(currentConversation.sessionId)) return
    loadedSessionIds.current.add(currentConversation.sessionId)

    let cancelled = false
    setLoadingMessages(true)
    sessionService.getConversation(currentConversation.agentId, currentConversation.sessionId)
      .then((detail) => {
        if (cancelled) return
        const msgs = (detail.messages || []).map((msg: any) =>
          sessionService.transformMessage(msg)
        )
        const hasStreaming = msgs.some((m: Message) => m.isStreaming)
        if (hasStreaming && currentConversation.sessionId) {
          loadedSessionIds.current.delete(currentConversation.sessionId)
        }
        useChatStore.setState((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === currentConversation.id
              ? { ...c, messages: msgs, updatedAt: new Date(detail.updated_at), isStreaming: hasStreaming, hasMore: detail.has_more ?? false }
              : c
          ),
        }))
      })
      .catch((err) => {
        console.error('Failed to load conversation messages:', err)
      })
      .finally(() => {
        if (!cancelled) setLoadingMessages(false)
      })
    return () => { cancelled = true }
  }, [currentConversation?.id])

  // 滚动到顶部时自动加载更早的消息（onScroll 绑定在 JSX 上，元素存在即生效）
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const ctx = scrollCtx.current
    if (!ctx.hasMore || ctx.cooldown) return
    if (el.scrollTop > 5) return

    const oldestMsg = ctx.messages[0]
    if (!oldestMsg?.timestamp || !ctx.agentId || !ctx.sessionId) return

    ctx.cooldown = true
    scrollHeightBeforeLoad.current = el.scrollHeight
    setLoadingMore(true)
    skipAutoScroll.current = true

    const before = oldestMsg.timestamp instanceof Date
      ? oldestMsg.timestamp.toISOString()
      : new Date(oldestMsg.timestamp).toISOString()
    loadMoreMessages(ctx.agentId, ctx.sessionId, before)
      .finally(() => {
        setLoadingMore(false)
        setTimeout(() => { scrollCtx.current.cooldown = false }, 500)
      })
  }, [])

  // 重连，恢复流式响应
  const streamingMsg = messages.find((m) => m.isStreaming)
  useEffect(() => {
    if (!streamingMsg || !currentConversation?.sessionId || !currentConversation?.agentId) return
    if (!currentConversationId) return
    if (locallyCreatedMessageIds.current.has(streamingMsg.id)) return

    const agentId = currentConversation.agentId
    const sessionId = currentConversation.sessionId
    const msgId = streamingMsg.id
    let cancelled = false

    updateMessage(currentConversationId, msgId, {
      content: '',
      events: [],
    })
    setStreaming(currentConversationId, true)

    messageService.reconnectStream(agentId, sessionId, (eventData) => {
      if (cancelled) return
      handleStreamEvent(eventData, currentConversationId, msgId, updateMessage, setStreaming)
    }).catch((err) => {
      if (!cancelled) {
        console.error('Reconnect stream failed:', err)
      }
    }).finally(() => {
      if (!cancelled) setLoadingMessages(false)
    })

    return () => { cancelled = true }
  }, [streamingMsg?.id, currentConversationId])

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    })
  }, [])

  // 初始加载完成后滚动到底部
  const prevLoadingMessages = useRef(false)
  useEffect(() => {
    if (prevLoadingMessages.current && !loadingMessages && messages.length > 0) {
      scrollToBottom()
    }
    prevLoadingMessages.current = loadingMessages
  }, [loadingMessages, messages.length, scrollToBottom])

  // 新消息时自动滚动到底部（prepend 历史消息时恢复滚动位置）
  useEffect(() => {
    if (!scrollRef.current) return

    if (skipAutoScroll.current) {
      skipAutoScroll.current = false
      // 恢复滚动位置：新加载内容插入顶部后，保持原先可见的消息不跳动
      if (scrollHeightBeforeLoad.current > 0) {
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            const heightDelta = scrollRef.current.scrollHeight - scrollHeightBeforeLoad.current
            scrollRef.current.scrollTop = heightDelta
            scrollHeightBeforeLoad.current = 0
          }
        })
      }
      return
    }
    scrollToBottom()
  }, [messages])

  const handleSendMessage = async (content: string, attachments?: File[]) => {
    if (!currentConversationId) return

    // Add user message
    const userMessage: Message = {
      id: generateUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
      attachments: attachments?.map((file) => ({
        id: generateUUID(),
        name: file.name,
        type: file.type.startsWith('image/') ? 'image' : 'file',
        size: file.size,
      })),
    }
    addMessage(currentConversationId, userMessage)

    await streamResponse(content)
  }

  const streamResponse = useCallback(async (content: string) => {
    if (!currentConversationId) return

    // Get current agent and session
    const { currentAgentId, activeSessions, sendMessageToAgent, createNewSession, initializeAgent } = useChatStore.getState()

    let agentId = currentAgentId

    // If no agent selected, create a default agent
    if (!agentId) {
      try {
        // Create a default agent
        const defaultAgent = await initializeAgent({
          name: 'Default Agent',
          adapterType: 'openclaw',
          sandboxType: 'docker',
          idleTimeoutSeconds: 300
        })
        agentId = defaultAgent.id
      } catch (error) {
        console.error('Failed to create default agent:', error)
        return
      }
    }

    // Ensure there's an active session
    const currentConv = useChatStore.getState().conversations.find(c => c.id === currentConversationId)
    let sessionId = currentConv?.sessionId
    if (!sessionId) {
      let session = activeSessions[agentId]
      if (!session) {
        try {
          session = await createNewSession(agentId)
        } catch (error) {
          console.error('Failed to create session:', error)
          return
        }
      }
      sessionId = session.id
      // Persist sessionId back to the conversation for future messages
      useChatStore.setState((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === currentConversationId ? { ...c, sessionId } : c
        ),
      }))
    }

    // Set streaming state
    setStreaming(currentConversationId, true)

    // Create a "thinking" message
    const thinkingMessageId = generateUUID()
    const thinkingMessage: Message = {
      id: thinkingMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    }
    addMessage(currentConversationId, thinkingMessage)
    locallyCreatedMessageIds.current.add(thinkingMessageId)

    try {
      // 创建助手消息ID，用于后续更新
      let assistantMessageId: string | null = null
      let assistantMessage: Message | null = null

      // 发送消息到 agent，使用实时回调处理流式事件
      await sendMessageToAgent(agentId, sessionId, content, (eventData) => {

        // 当收到第一个事件时，删除思考中消息并创建实际的助手消息
        if (!assistantMessageId) {
          // 删除思考中消息
          deleteMessage(currentConversationId, thinkingMessageId)
          locallyCreatedMessageIds.current.delete(thinkingMessageId)

          // 创建新的助手消息
          assistantMessageId = generateUUID()
          assistantMessage = {
            id: assistantMessageId,
            role: 'assistant',
            content: '',
            timestamp: new Date(),
            isStreaming: true,
            toolCalls: [],
            events: []
          }
          addMessage(currentConversationId, assistantMessage)
          locallyCreatedMessageIds.current.add(assistantMessageId)
        }

        if (assistantMessageId) {
          handleStreamEvent(eventData, currentConversationId, assistantMessageId, updateMessage, setStreaming, locallyCreatedMessageIds)
        }
      })
    } catch (error) {
      console.error('Failed to send message:', error)
      // Handle error gracefully
      deleteMessage(currentConversationId, thinkingMessageId)
      locallyCreatedMessageIds.current.clear()
      const errorMessageId = generateUUID()
      const errorMessage: Message = {
        id: errorMessageId,
        role: 'assistant',
        content: 'Sorry, there was an error sending your message. Please try again.',
        timestamp: new Date(),
        isStreaming: false,
      }
      addMessage(currentConversationId, errorMessage)
      setStreaming(currentConversationId, false)
    }
  }, [currentConversationId, addMessage, updateMessage, deleteMessage, setStreaming])

  const handleRegenerate = useCallback(async (assistantMessageId: string) => {
    if (!currentConversationId) return

    // 删除当前 assistant 消息
    deleteMessage(currentConversationId, assistantMessageId)

    // 用系统提示重新发送（不创建新用户消息，对用户不可见）
    const regenerateContent = '/regenerate'
    await streamResponse(regenerateContent)
  }, [currentConversationId, deleteMessage, streamResponse])

  if (!isHydrated || (messages.length === 0 && !loadingMessages)) {
    return (
      <div className="flex h-full flex-col bg-background">
        <ChatHeader conversation={currentConversation} />
        <WelcomeScreen onAddPrompt={handleAddPresetPrompt} />
        <div className="border-t border-border p-4">
          <ChatInput
            onSend={handleSendMessage}
            presetPrompts={presetPrompts}
            onRemovePresetPrompt={handleRemovePresetPrompt}
            onClearPresetPrompts={handleClearPresetPrompts}
          />
        </div>
      </div>
    )
  }

  if (loadingMessages) {
    return (
      <div className="flex h-full flex-col bg-background">
        <ChatHeader conversation={currentConversation} />
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm">加载历史会话中...</p>
          </div>
        </div>
        <div className="border-t border-border p-4">
          <ChatInput
            onSend={handleSendMessage}
            presetPrompts={presetPrompts}
            onRemovePresetPrompt={handleRemovePresetPrompt}
            onClearPresetPrompts={handleClearPresetPrompts}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <ChatHeader conversation={currentConversation} />
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto scrollbar-thin">
        {loadingMore && (
          <div className="flex items-center justify-center py-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="ml-2 text-xs text-muted-foreground">加载更早的消息...</span>
          </div>
        )}
        {currentConversation?.hasMore && !loadingMore && (
          <div className="flex items-center justify-center py-2">
            <button
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={handleScroll}
            >
              查看更早的消息
            </button>
          </div>
        )}
        <MessageList messages={messages} onRegenerate={handleRegenerate} />
      </div>
      <div className="border-t border-border p-4">
        <ChatInput onSend={handleSendMessage} />
      </div>
    </div>
  )
}

function getSimulatedResponse(input: string): string {
  const responses = [
    `我理解您的问题。让我为您详细解答：

首先，这是一个很好的问题。根据我的分析，有以下几个要点需要考虑：

1. **核心概念理解**：在处理这类问题时，我们需要明确基础概念和应用场景。

2. **实践方案**：我建议采用渐进式的方法来解决，先从简单的情况入手，逐步扩展到复杂场景。

3. **最佳实践**：在实际应用中，请注意遵循行业标准和代码规范。

如果您需要更详细的代码示例或具体的实现方案，请告诉我具体的需求。`,

    `好的，我来帮您分析这个问题。

## 问题分析

根据您的描述，这里涉及到几个关键点：

- 系统架构的设计考量
- 性能优化的平衡
- 可维护性的保证

## 建议方案

\`\`\`typescript
// 示例代码
interface Solution {
  approach: string;
  complexity: 'low' | 'medium' | 'high';
  benefits: string[];
}

const recommend: Solution = {
  approach: '模块化设计',
  complexity: 'medium',
  benefits: ['易于测试', '便于扩展', '清晰的职责划分']
};
\`\`\`

需要我继续深入解释某个方面吗？`,

    `非常感谢您的提问！这是一个实际开发中常见的场景。

### 解决方案

我推荐以下步骤：

1. 首先评估当前系统状态
2. 制定迭代改进计划
3. 逐步实施并验证效果

### 注意事项

- 确保有完整的测试覆盖
- 做好版本控制和回滚准备
- 文档同步更新

如果您有具体的代码或配置需要检查，欢迎分享，我会给出更针对性的建议。`,
  ]

  return responses[Math.floor(Math.random() * responses.length)]
}
