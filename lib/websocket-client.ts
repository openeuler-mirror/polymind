import { AgentEvent, AgentEventType } from './types'

/**
 * WebSocket客户端类 - 负责处理WebSocket连接和消息
 * 使用观察者模式管理事件监听器
 */
class WebSocketClient {
  private ws: WebSocket | null = null
  private url: string
  private listeners: Map<string, Set<Function>> = new Map()
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 5
  private reconnectInterval: number = 3000
  private heartbeatInterval: number | null = null
  private heartbeatTimeout: number | null = null
  private isManualClose: boolean = false

  constructor(url: string) {
    this.url = url
  }

  /**
   * 连接到WebSocket服务器
   */
  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url)

        this.ws.onopen = () => {
          this.reconnectAttempts = 0
          this.startHeartbeat()
          this.emit('open')
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            this.emit('message', data)
          } catch (e) {
            this.emit('error', new Error(`Failed to parse message: ${event.data}`))
          }
        }

        this.ws.onclose = (event) => {
          this.stopHeartbeat()
          
          if (!this.isManualClose) {
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
              this.reconnectAttempts++
              setTimeout(() => {
                this.connect().catch(console.error)
              }, this.reconnectInterval)
            } else {
              this.emit('error', new Error('Max reconnection attempts reached'))
            }
          }
          
          this.emit('close', event)
        }

        this.ws.onerror = (error) => {
          this.emit('error', error)
          reject(error)
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * 发送消息
   */
  public send(data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    } else {
      throw new Error('WebSocket is not connected')
    }
  }

  /**
   * 关闭连接
   */
  public close(): void {
    this.isManualClose = true
    if (this.ws) {
      this.ws.close()
    }
  }

  /**
   * 添加事件监听器
   */
  public on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback)
  }

  /**
   * 移除事件监听器
   */
  public off(event: string, callback: Function): void {
    if (this.listeners.has(event)) {
      this.listeners.get(event)!.delete(callback)
    }
  }

  /**
   * 触发事件
   */
  private emit(event: string, ...args: any[]): void {
    if (this.listeners.has(event)) {
      this.listeners.get(event)!.forEach(callback => {
        try {
          callback(...args)
        } catch (error) {
          console.error(`Error in event listener for "${event}":`, error)
        }
      })
    }
  }

  /**
   * 开始心跳检测
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }))
        
        // 设置心跳超时
        this.heartbeatTimeout = window.setTimeout(() => {
          if (this.ws) {
            this.ws.close()
          }
        }, 5000) // 5秒超时
      }
    }, 30000) // 30秒一次心跳
  }

  /**
   * 停止心跳检测
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout)
      this.heartbeatTimeout = null
    }
  }
}

export { WebSocketClient }