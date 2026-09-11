'use strict'
/**
 * 运行时配置：系统环境变量 → window.__APP_CONFIG__。
 *
 * 配置因此从**构建期烘焙**挪到**运行时** —— 改 /etc/polymind/polymind.env 后只需重启
 * 桌面端，不必重新构建前端产物。前端只从 window.__APP_CONFIG__ 读配置（全仓仅
 * app/layout.tsx 与 app/config/index.ts 出现 process.env），一处改写即覆盖全部配置面。
 */

/**
 * 可注入页面的 key 白名单。唯一真相源是同目录的 public-env-keys.json —— 前端
 * （app/config/index.ts）与构建脚本（build-renderer.mjs）读的是同一个文件，加 key 时
 * 不存在"改了两处、漏了第三处"的静默漂移。放在 desktop/src/ 下是因为本文件要在
 * **用户机器上**运行，而 RPM 只把 desktop/src/ 装进 /opt/polymind/desktop/app/。
 */
const PUBLIC_ENV_KEYS = require('./public-env-keys.json')

/** 面向系统管理员的变量名 → 前端配置 key。故意不复用 NEXT_PUBLIC_ 前缀，避免与构建期变量混淆。 */
const ENV_ALIASES = {
  POLYMIND_API_URL: 'NEXT_PUBLIC_AGENTD_API_URL',
  POLYMIND_WS_URL: 'NEXT_PUBLIC_WS_URL',
  POLYMIND_API_TIMEOUT: 'NEXT_PUBLIC_API_TIMEOUT',
  POLYMIND_AUTH_TOKEN: 'NEXT_PUBLIC_AUTH_TOKEN',
  POLYMIND_APP_NAME: 'NEXT_PUBLIC_APP_NAME',
  POLYMIND_APP_VERSION: 'NEXT_PUBLIC_APP_VERSION',
  POLYMIND_DEBUG: 'NEXT_PUBLIC_DEBUG',
  POLYMIND_USE_MOCK_DATA: 'NEXT_PUBLIC_USE_MOCK_DATA',
  POLYMIND_MAX_RECONNECT_ATTEMPTS: 'NEXT_PUBLIC_MAX_RECONNECT_ATTEMPTS',
  POLYMIND_RECONNECT_INTERVAL: 'NEXT_PUBLIC_RECONNECT_INTERVAL',
  POLYMIND_WITTYHUB_API_URL: 'NEXT_WITTYHUB_API_URL',
}

/** 绝对 URL（http/https）不可能是同源相对路径 —— 用来识别"绕过了 app:// 代理"。 */
const ABSOLUTE_URL_RE = /^https?:[/][/]/i

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {{logger?: Console}} options
 * @returns {Record<string,string>} 最终写入 window.__APP_CONFIG__ 的对象
 */
function resolveRuntimeConfig(env = process.env, options = {}) {
  const { logger = console } = options
  const config = {}

  // 1) 配置文件（JSON），便于 RPM 直接投放 /etc/polymind/desktop-config.json
  if (env.POLYMIND_DESKTOP_CONFIG_FILE) {
    try {
      Object.assign(
        config,
        JSON.parse(require('node:fs').readFileSync(env.POLYMIND_DESKTOP_CONFIG_FILE, 'utf8'))
      )
    } catch (err) {
      logger.warn(
        `[desktop] 读取配置失败 ${env.POLYMIND_DESKTOP_CONFIG_FILE}: ${err && err.message}`
      )
    }
  }

  // 2) 内联 JSON（systemd Environment= 里塞复杂结构时用）
  if (env.POLYMIND_DESKTOP_CONFIG_JSON) {
    try {
      Object.assign(config, JSON.parse(env.POLYMIND_DESKTOP_CONFIG_JSON))
    } catch (err) {
      logger.warn(`[desktop] POLYMIND_DESKTOP_CONFIG_JSON 不是合法 JSON: ${err && err.message}`)
    }
  }

  // 3) 单变量覆盖（优先级最高，方便 .env 里逐项写）
  for (const [envKey, configKey] of Object.entries(ENV_ALIASES)) {
    const value = env[envKey]
    if (value !== undefined && value !== '') config[configKey] = String(value)
  }

  // 丢弃非白名单 key，避免把无关变量注入页面
  for (const key of Object.keys(config)) {
    if (!PUBLIC_ENV_KEYS.includes(key)) delete config[key]
  }

  warnIfProxyBypassed(config, logger)
  return config
}

/**
 * 代理旁路告警。代理模式是靠"**不设置** NEXT_PUBLIC_AGENTD_API_URL"实现的：空值 → 相对
 * 路径 /api → 被 app-protocol.js 截走转给主进程。一旦被设成绝对地址（配置文件写错一行就会
 * 这样），请求就直连后端、离开 app://polymind origin，而日志里本来什么都看不到。
 * 详见 README「三、环境变量」的 ⚠️ 说明。
 */
function warnIfProxyBypassed(config, logger) {
  const value = config.NEXT_PUBLIC_AGENTD_API_URL
  if (!value || !ABSOLUTE_URL_RE.test(value)) return
  logger.warn(
    '[desktop] NEXT_PUBLIC_AGENTD_API_URL=' +
      value +
      ' 是绝对地址：页面将**绕过** app:// 代理直连该地址，' +
      '请求会离开 app://polymind origin（需要后端放行 CORS）。' +
      '若希望走主进程代理，请留空该值，只用 POLYMIND_DESKTOP_API_TARGET 指定后端。'
  )
}

module.exports = { PUBLIC_ENV_KEYS, ENV_ALIASES, resolveRuntimeConfig, warnIfProxyBypassed }
