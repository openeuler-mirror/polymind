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
  private onEvent?: (event: any) => void
  private signal?: AbortSignal

  constructor(agentId: string, sessionId: string, content: string, onEvent?: (event: any) => void, signal?: AbortSignal) {
    this.agentId = agentId
    this.sessionId = sessionId
    this.content = content
    this.onEvent = onEvent
    this.signal = signal
  }

  async execute(): Promise<any[]> {
    const request = {
      content: this.content
    }
    
    console.log('Sending message to streaming API:', {
      agentId: this.agentId,
      sessionId: this.sessionId,
      content: this.content
    })
    
    // 使用流式 API 端点
    const url = `/api/v1/agents/${this.agentId}/sessions/${this.sessionId}/messages/stream`
    
    // 构建完整的 URL
    const fullUrl = `${appConfig.api.baseUrl}${url}`
    console.log('Full streaming API URL:', fullUrl)
    
    return new Promise((resolve, reject) => {
      const events: any[] = []
      
      // 构建请求选项
      const options: RequestInit = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        },
        body: JSON.stringify(request),
        signal: this.signal
      } as RequestInit & { duplex?: string }
      
      // 添加流式传输需要的duplex配置（TypeScript类型扩展）
      ;(options as any).duplex = 'half'
      
      // 应用请求拦截器
      const processedOptions = this.applyRequestInterceptors(options, url)
      
      // 发送流式请求
      fetch(fullUrl, processedOptions)
      .then(async response => {
        if (!response.ok) {
          // 读取错误响应内容
          let errorDetails = ''
          try {
            const errorData = await response.json()
            errorDetails = JSON.stringify(errorData, null, 2)
          } catch {
            errorDetails = await response.text()
          }
          console.error('Streaming API error response:', {
            status: response.status,
            statusText: response.statusText,
            details: errorDetails
          })
          throw new Error(`HTTP error! status: ${response.status}, details: ${errorDetails}`)
        }
        
        if (!response.body) {
          throw new Error('No response body')
        }
        
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        
        // 处理流式响应
        const processStream = async () => {
          const { done, value } = await reader.read()
          
          if (done) {
            // 流结束
            resolve(events)
            return
          }
          
          // 解码数据
          buffer += decoder.decode(value, { stream: true })
          
          // 处理 SSE 格式的数据
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.substring(6)
              if (data) {
                try {
                  const event = JSON.parse(data)
                  events.push(event)
                  const eventType = (event.event?.type || event.type)
                  console.log(`[Stream] type: ${eventType}`)
                  if (this.onEvent) {
                    this.onEvent(event.event || event)
                  }
                } catch (error) {
                  console.error('Error parsing streaming event:', error)
                }
              }
            }
          }
          
          // 继续处理流
          processStream()
        }
        
        processStream().catch(error => {
          if (error?.name === 'AbortError') {
            resolve(events)
            return
          }
          reject(error)
        })
      })
      .catch(error => {
        if (error?.name === 'AbortError') {
          resolve(events)
          return
        }
        console.error('Streaming request error:', error)
        reject(error)
      })
    })
  }
  
  /**
   * 应用请求拦截器
   */
  private applyRequestInterceptors(options: RequestInit, url: string): RequestInit {
    // 模拟 httpClient 的请求拦截器逻辑
    const authToken = process.env.NEXT_PUBLIC_AUTH_TOKEN
    if (authToken) {
      return {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${authToken}`
        }
      }
    }
    return options
  }
}

/**
 * 消息服务类 - 负责消息的发送和接收
 * 使用命令模式封装不同的消息操作
 */
class MessageService {
  private webSocketClients: Record<string, WebSocketClient> = {} // agentId -> WebSocketClient
  private streamingControllers: Record<string, AbortController> = {}

  /**
   * 发送消息到Agent
   */
  public sendMessage(agentId: string, sessionId: string, content: string, onEvent?: (event: any) => void): Promise<any[]> {
    const controller = new AbortController()
    this.streamingControllers[agentId] = controller
    const command = new SendMessageCommand(agentId, sessionId, content, onEvent, controller.signal)
    return command.execute().finally(() => {
      if (this.streamingControllers[agentId] === controller) {
        delete this.streamingControllers[agentId]
      }
    })
  }

  public abortMessage(agentId: string): void {
    const controller = this.streamingControllers[agentId]
    if (!controller) return
    controller.abort()
    delete this.streamingControllers[agentId]
  }

  /**
   * 建立WebSocket连接以接收实时消息
   */
  public connectForMessages(
    agentId: string, 
    sessionId: string,
    onMessage: (event: any) => void,
    onError?: (error: any) => void
  ): WebSocketClient {
    // 从配置的baseUrl构建WebSocket URL
    const baseUrl = appConfig.api.baseUrl
    // 构建正确的WebSocket URL，根据设计文档应该是 /agent/sessions/{session_id}/ws
    const wsUrl = baseUrl.replace('http', 'ws') + `/agent/sessions/${sessionId}/ws`
    
    console.log('Connecting to WebSocket:', wsUrl)
    
    // 关闭已存在的连接
    if (this.webSocketClients[agentId]) {
      this.webSocketClients[agentId].close()
    }
    
    this.webSocketClients[agentId] = new WebSocketClient(wsUrl)
    const wsClient = this.webSocketClients[agentId]
    
    wsClient.on('message', (data: any) => {
      onMessage(data)
    })

    if (onError) {
      wsClient.on('error', onError)
    }

    wsClient.connect().catch(error => {
      console.error('WebSocket connection error:', error)
      if (onError) onError(error)
    })
    
    return wsClient
  }

  /**
   * 断开WebSocket连接
   */
  public disconnect(agentId: string): void {
    if (this.webSocketClients[agentId]) {
      this.webSocketClients[agentId].close()
      delete this.webSocketClients[agentId]
    }
  }

  /**
   * 断开所有WebSocket连接
   */
  public disconnectAll(): void {
    Object.values(this.webSocketClients).forEach(client => {
      client.close()
    })
    this.webSocketClients = {}
  }
}

// 导出单例实例
export const messageService = new MessageService()
