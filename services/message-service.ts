import { httpClient } from '@/lib/http-client'
import { WebSocketClient } from '@/lib/websocket-client'
import { AgentEvent, Command } from '@/lib/types'
import { AgentEventType } from '@/lib/types'
import { appConfig } from '@/app/config'
import { sessionService } from './session-service'

function buildSSERequestOptions(
  overrides: RequestInit = {},
  body?: Record<string, unknown>
): RequestInit {
  const options: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    } as Record<string, string>,
    ...overrides,
  } as RequestInit & { duplex?: string }

  ;(options as any).duplex = 'half'

  const authToken = appConfig.auth.token
  if (authToken) {
    ;(options.headers as Record<string, string>)['Authorization'] = `Bearer ${authToken}`
  }

  if (body) {
    options.body = JSON.stringify(body)
  }

  return options
}

function parseSSEStream(
  response: Response,
  onEvent?: (event: any) => void,
  logPrefix: string = '[SSE]'
): Promise<any[]> {
  return new Promise((resolve, reject) => {
    if (!response.body) {
      resolve([])
      return
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const events: any[] = []
    let buffer = ''

    const processLine = (line: string) => {
      if (line.startsWith('data: ')) {
        const data = line.substring(6)
        if (data) {
          try {
            const event = JSON.parse(data)
            events.push(event)
            if (onEvent) {
              onEvent(event.event || event)
            }
          } catch (error) {
            console.error(`Error parsing ${logPrefix} event:`, error)
          }
        }
      }
    }

    const processStream = async () => {
      const { done, value } = await reader.read()
      if (done) {
        // 处理 buffer 中残留的最后一个不完整行（不以 \n 结尾的情况）
        if (buffer.trim()) {
          const remainingLines = buffer.split('\n')
          for (const line of remainingLines) {
            processLine(line)
          }
        }
        resolve(events)
        return
      }
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        processLine(line)
      }
      await processStream()
    }

    processStream().catch(err => {
      if (err?.name === 'AbortError') {
        resolve(events)
      } else {
        reject(err)
      }
    })
  })
}

// 发送消息命令
class SendMessageCommand implements Command {
  private agentId: string
  private sessionId: string
  private content: string
  private onEvent?: (event: any) => void
  private signal?: AbortSignal

  constructor(
    agentId: string,
    sessionId: string,
    content: string,
    onEvent?: (event: any) => void,
    signal?: AbortSignal
  ) {
    this.agentId = agentId
    this.sessionId = sessionId
    this.content = content
    this.onEvent = onEvent
    this.signal = signal
  }

  async execute(): Promise<any[]> {
    const url = `/agents/${this.agentId}/sessions/${this.sessionId}/messages/stream`
    const fullUrl = `${appConfig.api.baseUrl}${url}`

    const options = buildSSERequestOptions({ signal: this.signal }, { content: this.content })

    const response = await fetch(fullUrl, options)
    if (!response.ok) {
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
        details: errorDetails,
      })
      throw new Error(`HTTP error! status: ${response.status}, details: ${errorDetails}`)
    }

    return parseSSEStream(response, this.onEvent, '[Stream]')
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
  public sendMessage(
    agentId: string,
    sessionId: string,
    content: string,
    onEvent?: (event: any) => void
  ): Promise<any[]> {
    const controller = new AbortController()
    this.streamingControllers[agentId] = controller
    const command = new SendMessageCommand(agentId, sessionId, content, onEvent, controller.signal)
    return command.execute().finally(() => {
      if (this.streamingControllers[agentId] === controller) {
        delete this.streamingControllers[agentId]
      }
    })
  }

  public abortMessage(agentId: string, sessionId?: string): void {
    const controller = this.streamingControllers[agentId]
    if (!controller) return
    controller.abort()
    delete this.streamingControllers[agentId]

    // 直接调用 HTTP abort 端点，确保后端同步中断（不依赖 SSE 断连检测）
    if (sessionId) {
      sessionService.abortSession(agentId, sessionId)
    }
  }

  /**
   * 重连到正在进行的消息流（页面刷新后恢复流式响应）
   */
  public async reconnectStream(
    agentId: string,
    sessionId: string,
    onEvent?: (event: any) => void
  ): Promise<any[]> {
    const url = `/agents/${agentId}/sessions/${sessionId}/messages/stream/reconnect`
    const fullUrl = `${appConfig.api.baseUrl}${url}`
    const options = buildSSERequestOptions()
    const response = await fetch(fullUrl, options)
    if (!response.ok) {
      const errorBody = await response.text()
      console.error('Reconnect stream error:', response.status, errorBody)
      throw new Error(`Reconnect stream failed: ${response.status} ${errorBody}`)
    }

    return parseSSEStream(response, onEvent, '[Reconnect]')
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
