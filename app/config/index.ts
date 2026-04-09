// 统一配置管理

/**
 * 应用配置接口
 */
export interface AppConfig {
  // API配置
  api: {
    baseUrl: string
    timeout: number
  }
  // WebSocket配置
  websocket: {
    url: string
    maxReconnectAttempts: number
    baseReconnectInterval: number
    maxReconnectInterval: number
    heartbeatInterval: number
    heartbeatTimeout: number
  }
  // 应用配置
  app: {
    name: string
    version: string
    debug: boolean
  }
}

/**
 * 应用配置（getter 写法 → 客户端/TS文件永远能拿到环境变量）
 */
export const appConfig: AppConfig = {
  api: {
    get baseUrl() {
      return process.env.NEXT_PUBLIC_AGENTD_API_URL || 'http://127.0.0.1:3002';
    },
    get timeout() {
      return Number(process.env.NEXT_PUBLIC_API_TIMEOUT) || 30000;
    }
  },
  websocket: {
    get url() {
      return process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:18080/ws';
    },
    get maxReconnectAttempts() {
      return Number(process.env.NEXT_PUBLIC_MAX_RECONNECT_ATTEMPTS) || 5;
    },
    get baseReconnectInterval() {
      return Number(process.env.NEXT_PUBLIC_RECONNECT_INTERVAL) || 3000;
    },
    get maxReconnectInterval() {
      return Number(process.env.NEXT_PUBLIC_RECONNECT_INTERVAL) || 30000;
    },
    get heartbeatInterval() {
      return Number(process.env.NEXT_PUBLIC_RECONNECT_INTERVAL) || 30000;
    },
    get heartbeatTimeout() {
      return Number(process.env.NEXT_PUBLIC_RECONNECT_INTERVAL) || 5000;
    }
  },
  app: {
    get name() {
      return process.env.NEXT_PUBLIC_APP_NAME || 'PolyMind';
    },
    get version() {
      return process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0';
    },
    get debug() {
      return process.env.NEXT_PUBLIC_DEBUG?.toLowerCase() === 'true' || false;
    }
  }
};