'use client'

import { useEffect, useRef } from 'react'
import { useChatStore } from '@/lib/store'
import { MessageList } from './message-list'
import { ChatInput } from './chat-input'
import { ChatHeader } from './chat-header'
import { WelcomeScreen } from './welcome-screen'
import type { Message } from '@/lib/types'

export function ChatArea() {
  const {
    conversations,
    currentConversationId,
    addMessage,
    updateMessage,
    setStreaming,
  } = useChatStore()

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

    // Simulate AI response with streaming
    setStreaming(true)
    const assistantMessageId = crypto.randomUUID()
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
      toolCalls: [],
    }
    addMessage(currentConversationId, assistantMessage)

    // Simulate tool call
    const shouldUseTool = Math.random() > 0.5
    if (shouldUseTool) {
      const toolCall = {
        id: crypto.randomUUID(),
        name: '思考分析',
        status: 'running' as const,
      }
      updateMessage(currentConversationId, assistantMessageId, {
        toolCalls: [toolCall],
      })

      await new Promise((r) => setTimeout(r, 1500))

      updateMessage(currentConversationId, assistantMessageId, {
        toolCalls: [{ ...toolCall, status: 'completed', duration: 1500 }],
      })
    }

    // Simulate streaming response
    const responseText = getSimulatedResponse(content)
    let currentText = ''

    for (let i = 0; i < responseText.length; i++) {
      await new Promise((r) => setTimeout(r, 15 + Math.random() * 25))
      currentText += responseText[i]
      updateMessage(currentConversationId, assistantMessageId, {
        content: currentText,
      })
    }

    updateMessage(currentConversationId, assistantMessageId, {
      isStreaming: false,
    })
    setStreaming(false)
  }

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col bg-background">
        <ChatHeader conversation={currentConversation} />
        <WelcomeScreen onSendMessage={handleSendMessage} />
        <div className="border-t border-border p-4">
          <ChatInput onSend={handleSendMessage} />
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
