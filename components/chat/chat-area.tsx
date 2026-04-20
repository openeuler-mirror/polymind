'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useChatStore } from '@/lib/store'
import { MessageList } from './message-list'
import { ChatInput, PromptSuggestion } from './chat-input'
import { ChatHeader } from './chat-header'
import { WelcomeScreen } from './welcome-screen'
import type { Message } from '@/lib/types'

export function ChatArea() {
  const [isHydrated, setIsHydrated] = useState(false)
  const [presetPrompts, setPresetPrompts] = useState<PromptSuggestion[]>([])
  const {
    conversations,
    currentConversationId,
    addMessage,
    updateMessage,
    setStreaming,
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

  const currentConversation = conversations.find(
    (c) => c.id === currentConversationId
  )
  const messages = currentConversation?.messages || []
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSendMessage = async (content: string, attachments?: File[]) => {
    if (!currentConversationId) return

    // Add user message
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
      attachments: attachments?.map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type.startsWith('image/') ? 'image' : 'file',
        size: file.size,
      })),
    }
    addMessage(currentConversationId, userMessage)

    // Get current agent and session
    const { currentAgentId, activeSessions, sendMessageToAgent, createNewSession, initializeAgent, deleteMessage } = useChatStore.getState()
    
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
    let session = activeSessions[agentId]
    if (!session) {
      try {
        session = await createNewSession(agentId)
      } catch (error) {
        console.error('Failed to create session:', error)
        return
      }
    }

    // Set streaming state
    setStreaming(true)
    
    // Create a "thinking" message
    const thinkingMessageId = crypto.randomUUID()
    const thinkingMessage: Message = {
      id: thinkingMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    }
    addMessage(currentConversationId, thinkingMessage)

    try {
      // 创建助手消息ID，用于后续更新
      let assistantMessageId: string | null = null
      let assistantMessage: Message | null = null
      
      // 发送消息到 agent，使用实时回调处理流式事件
      await sendMessageToAgent(agentId, content, (eventData) => {
        
        // 当收到第一个事件时，删除思考中消息并创建实际的助手消息
        if (!assistantMessageId) {
          // 删除思考中消息
          deleteMessage(currentConversationId, thinkingMessageId)
          
          // 创建新的助手消息
          assistantMessageId = crypto.randomUUID()
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
        }
        
        // 确保助手消息已创建
        if (assistantMessageId && assistantMessage) {
          // 获取最新的消息状态
          const currentMessage = useChatStore.getState().conversations.find(
            c => c.id === currentConversationId
          )?.messages.find(
            m => m.id === assistantMessageId
          ) || assistantMessage

          switch (eventData.type) {
            case 'message.delta':
              if (eventData.payload?.delta) {
                updateMessage(currentConversationId, assistantMessageId, {
                  content: (currentMessage.content || '') + eventData.payload.delta,
                  events: [...(currentMessage.events || []), {
                    type: 'message.delta',
                    content: eventData.payload.delta,
                    timestamp: eventData.ts_ms || Date.now()
                  }]
                })
              }
              break
            case 'message.completed':
              if (eventData.payload?.text) {
                updateMessage(currentConversationId, assistantMessageId, {
                  content: eventData.payload.text,
                  isStreaming: false
                })
                setStreaming(false)
              } else {
                // If no text in payload, still mark as completed
                updateMessage(currentConversationId, assistantMessageId, {
                  isStreaming: false
                })
                setStreaming(false)
              }
              break
            case 'thinking':
              if (eventData.payload?.thinking) {
                updateMessage(currentConversationId, assistantMessageId, {
                  thinking: [...(currentMessage.thinking || []), eventData.payload.thinking],
                  displayText: [...(currentMessage.displayText || []), eventData.payload.display_text || `AI正在思考：${eventData.payload.thinking}`],
                  events: [...(currentMessage.events || []), {
                    type: 'thinking',
                    content: eventData.payload.display_text || `AI正在思考：${eventData.payload.thinking}`,
                    timestamp: eventData.ts_ms || Date.now()
                  }]
                })
              }
              break
            case 'tool.call.started':
              if (eventData.payload?.tool_name) {
                const toolCall = {
                  id: eventData.payload.tool_call_id || crypto.randomUUID(),
                  name: eventData.payload.tool_name,
                  status: 'running' as const,
                  input: eventData.payload.arguments,
                  displayText: eventData.payload.display_text || `正在调用工具：${eventData.payload.tool_name}`
                }
                updateMessage(currentConversationId, assistantMessageId, {
                  toolCalls: [...(currentMessage.toolCalls || []), toolCall],
                  events: [...(currentMessage.events || []), {
                    type: 'tool.call.started',
                    content: eventData.payload.display_text || `正在调用工具：${eventData.payload.tool_name}`,
                    timestamp: eventData.ts_ms || Date.now(),
                    toolCall
                  }]
                })
              }
              break
            case 'tool.call.response':
              if (eventData.payload?.name) {
                // 格式化输出内容，使其更易读
                const formatOutput = (content: any): string => {
                  // 空值检查
                  if (content === null || content === undefined) {
                    return ''
                  }
                  
                  // 如果是字符串，直接返回
                  if (typeof content === 'string') {
                    return content
                  }
                  
                  // 如果是对象，尝试提取关键信息
                  if (typeof content === 'object') {
                    // 如果有 details.content，优先使用
                    if (content.details?.content) {
                      const detailsContent = content.details.content
                      return typeof detailsContent === 'string' ? detailsContent : JSON.stringify(detailsContent)
                    }
                    
                    // 如果有 text 字段
                    if (content.text && typeof content.text === 'string') {
                      return content.text
                    }
                    
                    // 如果有 content 数组，提取文本内容
                    if (Array.isArray(content.content)) {
                      const texts = content.content
                        .filter((item: any) => item && item.type === 'text' && typeof item.text === 'string')
                        .map((item: any) => item.text)
                        .join('\n')
                      if (texts) {
                        return texts
                      }
                    }
                    
                    // 如果有 error 字段
                    if (content.error && typeof content.error === 'string') {
                      return content.error
                    }
                    
                    // 如果有 message 字段（通常用于错误信息）
                    if (content.message && typeof content.message === 'string') {
                      return content.message
                    }
                    
                    // 最后尝试 JSON 序列化
                    try {
                      return JSON.stringify(content, null, 2)
                    } catch (e) {
                      console.error('Failed to stringify content:', e)
                      return '[无法序列化的内容]'
                    }
                  }
                  
                  // 其他类型转换为字符串
                  try {
                    return String(content)
                  } catch (e) {
                    return '[无法转换的内容]'
                  }
                }

                // 格式化显示文本
                const formatDisplayText = (payload: any): string => {
                  if (payload.display_text) {
                    return payload.display_text
                  }
                  
                  if (payload.is_error) {
                    const errorContent = formatOutput(payload.content)
                    return `工具调用失败：${errorContent.substring(0, 100)}${errorContent.length > 100 ? '...' : ''}`
                  }
                  
                  const outputContent = formatOutput(payload.content)
                  return `工具调用结果：${outputContent.substring(0, 100)}${outputContent.length > 100 ? '...' : ''}`
                }

                const toolCall = {
                  id: eventData.payload.tool_call_id || crypto.randomUUID(),
                  name: eventData.payload.name,
                  status: eventData.payload.is_error ? 'error' as const : 'completed' as const,
                  input: eventData.payload.arguments,
                  output: eventData.payload.content,
                  error: eventData.payload.is_error ? eventData.payload.content : undefined,
                  duration: eventData.payload.duration,
                  displayText: formatDisplayText(eventData.payload)
                }
                updateMessage(currentConversationId, assistantMessageId, {
                  toolCalls: [...(currentMessage.toolCalls || []), toolCall],
                  events: [...(currentMessage.events || []), {
                    type: 'tool.call.response',
                    content: formatDisplayText(eventData.payload),
                    timestamp: eventData.ts_ms || Date.now(),
                    toolCall
                  }]
                })
              }
              break
            case 'usage.updated':
              if (eventData.payload) {
                updateMessage(currentConversationId, assistantMessageId, {
                  usage: {
                    inputTokens: eventData.payload.input_tokens,
                    outputTokens: eventData.payload.output_tokens,
                    totalCost: eventData.payload.total_cost
                  }
                })
              }
              break
            case 'stream.error':
            case 'client.error':
              // Handle errors
              console.error('Error event:', eventData.payload || 'No payload')
              setStreaming(false)
              break
            default:
              console.log('Unknown event type:', eventData.type)
          }
        }
      })
    } catch (error) {
      console.error('Failed to send message:', error)
      // Handle error gracefully
      deleteMessage(currentConversationId, thinkingMessageId)
      const errorMessageId = crypto.randomUUID()
      const errorMessage: Message = {
        id: errorMessageId,
        role: 'assistant',
        content: 'Sorry, there was an error sending your message. Please try again.',
        timestamp: new Date(),
        isStreaming: false,
      }
      addMessage(currentConversationId, errorMessage)
      setStreaming(false)
    }
  }

  if (!isHydrated || messages.length === 0) {
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

  return (
    <div className="flex h-full flex-col bg-background">
      <ChatHeader conversation={currentConversation} />
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
        <MessageList messages={messages} />
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
