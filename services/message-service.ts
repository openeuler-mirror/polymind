import { httpClient } from '@/lib/http-client'
import { WebSocketClient } from '@/lib/websocket-client'
import { AgentEvent, Command } from '@/lib/types'
import { AgentEventType } from '@/lib/types'
import { appConfig } from '@/app/config'

// 发送消息命令
class SendMessageCommand implements Command {
  private agentId: string
  private sessionId: string
  private content: string

  constructor(agentId: string, sessionId: string, content: string) {
    this.agentId = agentId
    this.sessionId = sessionId
    this.content = content
  }

  async execute(): Promise<void> {
    const request = {
      session_id: this.sessionId,
      content: this.content,
      attachments: []
    }
    
    await httpClient.post(
      `/api/v1/agents/${this.agentId}/sessions/${this.sessionId}/messages`,
      request
    )
  }
}

/**
 * 消息服务类 - 负责消息的发送和接收
 * 使用命令模式封装不同的消息操作
 */
class MessageService {
  private webSocketClient: WebSocketClient | null = null

  /**
   * 发送消息到Agent
   */
  public async sendMessage(agentId: string, sessionId: string, content: string): Promise<void> {
    const command = new SendMessageCommand(agentId, sessionId, content)
    await command.execute()
  }

  /**
   * 建立WebSocket连接以接收实时消息
   */
  public connectForMessages(
    agentId: string, 
    onMessage: (event: AgentEvent) => void,
    onError?: (error: any) => void
  ): WebSocketClient {
    // 从配置的baseUrl构建WebSocket URL
    const baseUrl = appConfig.api.baseUrl
    const wsUrl = baseUrl.replace('http', 'ws') + `/api/v1/agents/${agentId}/ws`
    this.webSocketClient = new WebSocketClient(wsUrl)
    
    this.webSocketClient.on('message', (data: any) => {
      const event: AgentEvent = {
        type: data.type as AgentEventType,
        content: data.content,
        timestamp: new Date(data.timestamp),
        name: data.name,
        input: data.input,
        toolCallId: data.tool_call_id
      }
      onMessage(event)
    })

    if (onError) {
      this.webSocketClient.on('error', onError)
    }

    this.webSocketClient.connect().catch(error => {
      console.error('WebSocket connection error:', error)
      if (onError) onError(error)
    })
    
    return this.webSocketClient
  }

  /**
   * 断开WebSocket连接
   */
  public disconnect(): void {
    if (this.webSocketClient) {
      this.webSocketClient.close()
      this.webSocketClient = null
    }
  }
}

// 导出单例实例
export const messageService = new MessageService()