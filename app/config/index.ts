// 统一配置管理

// 声明全局配置类型
declare global {
  interface Window {
    __APP_CONFIG__?: Record<string, string | undefined>
  }
}

/**
 * 获取配置值，兼容服务端和客户端
 */
function getConfigValue(key: string): string | undefined {
  if (typeof window === 'undefined') {
    // 服务端环境：直接读进程环境变量
    return process.env[key]
  } else {
    // 客户端环境：读全局注入的配置
    return window.__APP_CONFIG__?.[key]
  }
}

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
      return getConfigValue('NEXT_PUBLIC_AGENTD_API_URL') || 'http://127.0.0.1:8000';
    },
    get timeout() {
      return Number(getConfigValue('NEXT_PUBLIC_API_TIMEOUT')) || 30000;
    }
  },
  websocket: {
    get url() {
      return getConfigValue('NEXT_PUBLIC_WS_URL') || 'ws://localhost:18080/ws';
    },
    get maxReconnectAttempts() {
      return Number(getConfigValue('NEXT_PUBLIC_MAX_RECONNECT_ATTEMPTS')) || 5;
    },
    get baseReconnectInterval() {
      return Number(getConfigValue('NEXT_PUBLIC_RECONNECT_INTERVAL')) || 3000;
    },
    get maxReconnectInterval() {
      return Number(getConfigValue('NEXT_PUBLIC_RECONNECT_INTERVAL')) || 30000;
    },
    get heartbeatInterval() {
      return Number(getConfigValue('NEXT_PUBLIC_RECONNECT_INTERVAL')) || 30000;
    },
    get heartbeatTimeout() {
      return Number(getConfigValue('NEXT_PUBLIC_RECONNECT_INTERVAL')) || 5000;
    }
  },
  app: {
    get name() {
      return getConfigValue('NEXT_PUBLIC_APP_NAME') || 'PolyMind';
    },
    get version() {
      return getConfigValue('NEXT_PUBLIC_APP_VERSION') || '1.0.0';
    },
    get debug() {
      return getConfigValue('NEXT_PUBLIC_DEBUG')?.toLowerCase() === 'true' || false;
    }
  }
};