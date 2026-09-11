// 统一配置管理
// 这是项目唯一的运行时配置定义点。
// 新增 NEXT_PUBLIC_* 环境变量时只需修改：
//   1. desktop/src/public-env-keys.json（添加 key，这是唯一真相源）
//   2. appConfig 中对应的 getter（添加读取逻辑）
// layout.tsx 和 bin/start.js 均从此模块导入，无需手动同步。
import PUBLIC_ENV_KEYS_JSON from '../../desktop/src/public-env-keys.json'

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
 *
 * 本数组的唯一真相源是 `desktop/src/public-env-keys.json`，此处只做转出。
 *
 *   这份列表有三个消费方 —— ① app/layout.tsx（构建期内联）、
 *   ② desktop/build-renderer.mjs（构建期清空，阻断开发机地址被烘焙）、
 *   ③ desktop/src/runtime-config.js（**运行时**过滤要注入页面的变量）。
 *   前两个在构建期跑在仓库里，随便读哪都能读到；但 ③ 是在用户机器上运行的，
 *   而 RPM 只把 `desktop/src/` 原样装进 /opt/polymind/desktop/app/（见 polymind.spec），
 *   清单必须待在这棵树里才不会"打包后就找不到"。
 *   三个消费方共用同一份文件，加 key 时不存在"改了两处、漏了第三处"的静默漂移。
 */
export const PUBLIC_ENV_KEYS: readonly string[] = PUBLIC_ENV_KEYS_JSON

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
      return getConfigValue('NEXT_WITTYHUB_API_URL') || 'https://skillhub.openeuler.org'
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
