// 统一配置管理
// 这是项目唯一的运行时配置定义点。
// 新增 NEXT_PUBLIC_* 环境变量时只需修改：
//   1. PUBLIC_ENV_KEYS 数组（添加 key）
//   2. appConfig 中对应的 getter（添加读取逻辑）
// layout.tsx 和 bin/start.js 均从此模块导入，无需手动同步。

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
 * 所有需要注入到客户端运行时的 NEXT_PUBLIC_* 环境变量 key 列表。
 */
export const PUBLIC_ENV_KEYS = [
  'NEXT_PUBLIC_AGENTD_API_URL',
  'NEXT_PUBLIC_WS_URL',
  'NEXT_PUBLIC_API_TIMEOUT',
  'NEXT_PUBLIC_MAX_RECONNECT_ATTEMPTS',
  'NEXT_PUBLIC_RECONNECT_INTERVAL',
  'NEXT_PUBLIC_APP_NAME',
  'NEXT_PUBLIC_APP_VERSION',
  'NEXT_PUBLIC_DEBUG',
  'NEXT_PUBLIC_AUTH_TOKEN',
  'NEXT_PUBLIC_USE_MOCK_DATA',
  'NEXT_WITTYHUB_API_URL',
] as const

/**
 * 应用配置接口
 */
export interface AppConfig {
  // API配置
  api: {
    baseUrl: string
    timeout: number
  }
  // 认证配置
  auth: {
    token: string | undefined
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
  marketplace: {
    wittyhubApiUrl: string
  }
  // 应用配置
  app: {
    name: string
    version: string
    debug: boolean
    useMockData: boolean
  }
}

/**
 * 应用配置（getter 写法 → 客户端/TS 文件永远能拿到运行时的环境变量）
 */
export const appConfig: AppConfig = {
  api: {
    get baseUrl() {
      return getConfigValue('NEXT_PUBLIC_AGENTD_API_URL') || '/api'
    },
    get timeout() {
      return Number(getConfigValue('NEXT_PUBLIC_API_TIMEOUT')) || 120000
    },
  },
  auth: {
    get token() {
      return getConfigValue('NEXT_PUBLIC_AUTH_TOKEN')
    },
  },
  websocket: {
    get url() {
      return getConfigValue('NEXT_PUBLIC_WS_URL') || '/api/ws'
    },
    get maxReconnectAttempts() {
      return Number(getConfigValue('NEXT_PUBLIC_MAX_RECONNECT_ATTEMPTS')) || 5
    },
    get baseReconnectInterval() {
      return Number(getConfigValue('NEXT_PUBLIC_RECONNECT_INTERVAL')) || 3000
    },
    get maxReconnectInterval() {
      return Number(getConfigValue('NEXT_PUBLIC_RECONNECT_INTERVAL')) || 30000
    },
    get heartbeatInterval() {
      return Number(getConfigValue('NEXT_PUBLIC_RECONNECT_INTERVAL')) || 30000
    },
    get heartbeatTimeout() {
      return Number(getConfigValue('NEXT_PUBLIC_RECONNECT_INTERVAL')) || 5000
    },
  },
  marketplace: {
    get wittyhubApiUrl() {
      return getConfigValue('NEXT_WITTYHUB_API_URL') || 'http://127.0.0.1:8081'
    },
  },
  app: {
    get name() {
      return getConfigValue('NEXT_PUBLIC_APP_NAME') || 'PolyMind'
    },
    get version() {
      return getConfigValue('NEXT_PUBLIC_APP_VERSION') || '1.0.0'
    },
    get debug() {
      return getConfigValue('NEXT_PUBLIC_DEBUG')?.toLowerCase() === 'true' || false
    },
    get useMockData() {
      return getConfigValue('NEXT_PUBLIC_USE_MOCK_DATA') === 'true'
    },
  },
}
