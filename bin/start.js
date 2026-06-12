#!/usr/bin/env node
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.join(__dirname, '..')

// 查找 Next.js standalone 目录（兼容嵌套和扁平两种结构）
function findStandaloneDir() {
  const base = path.join(rootDir, '.next', 'standalone')

  // 情况1: server.js 直接在 standalone/ 下
  if (fs.existsSync(path.join(base, 'server.js'))) {
    return base
  }

  // 情况2: server.js 在 standalone/<name>/ 子目录下（Next.js 按包名嵌套）
  try {
    const entries = fs.readdirSync(base, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const candidate = path.join(base, entry.name)
        if (fs.existsSync(path.join(candidate, 'server.js'))) {
          return candidate
        }
      }
    }
  } catch (e) {}

  return base
}

const standaloneDir = findStandaloneDir()

// 处理命令行参数（nginx 反向代理模式，Next.js 仅监听内部端口）
const args = process.argv.slice(2)
const portIndex = args.indexOf('--port')
const port = portIndex !== -1 ? args[portIndex + 1] : '3001'
const hostIndex = args.indexOf('--host')
const host = hostIndex !== -1 ? args[hostIndex + 1] : '127.0.0.1'

// ==================== 运行时配置加载 ====================
const homedir = os.homedir()
const polymindDir = path.join(homedir, '.polymind')
const envPath = path.join(polymindDir, '.env')
const publicEnv = {}

fs.mkdirSync(polymindDir, { recursive: true })

const backendPort = process.env.BACKEND_PORT || '8000'
const defaultEnvContent = `# PolyMind 全局配置文件
# 修改后重启服务即可生效
# ==============================================
# 后端API地址（nginx 反向代理，使用相对路径，同源无 CORS）
NEXT_PUBLIC_AGENTD_API_URL=/api
# WebSocket地址
NEXT_PUBLIC_WS_URL=/api/ws
# API请求超时时间(毫秒)
NEXT_PUBLIC_API_TIMEOUT=120000
# 最大重连次数
NEXT_PUBLIC_MAX_RECONNECT_ATTEMPTS=5
# 重连间隔(毫秒)
NEXT_PUBLIC_RECONNECT_INTERVAL=3000
# 应用名称
NEXT_PUBLIC_APP_NAME=PolyMind
# 应用版本
NEXT_PUBLIC_APP_VERSION=1.0.0
# 调试模式
NEXT_PUBLIC_DEBUG=false
# 认证令牌（可选，用于 API 请求的 Bearer 认证）
NEXT_PUBLIC_AUTH_TOKEN=dev-token
# 模拟数据模式（仅开发用，生产环境请设为 false 或不设置）
#NEXT_PUBLIC_USE_MOCK_DATA=false
`

// 检查并迁移已有 .env（旧的绝对 URL → 相对 URL）
let envContent = ''
let envNeedsRewrite = false

if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf-8')

  const currentApiUrl = envContent.match(/^NEXT_PUBLIC_AGENTD_API_URL=(.+)$/m)
  const currentWsUrl = envContent.match(/^NEXT_PUBLIC_WS_URL=(.+)$/m)

  if (currentApiUrl && currentApiUrl[1].startsWith('http')) {
    console.warn('⚠️  检测到绝对 API URL，已迁移为 /api')
    envContent = envContent.replace(
      /^NEXT_PUBLIC_AGENTD_API_URL=.*/m,
      'NEXT_PUBLIC_AGENTD_API_URL=/api'
    )
    envNeedsRewrite = true
  }
  if (currentWsUrl && currentWsUrl[1].startsWith('ws://')) {
    console.warn('⚠️  检测到绝对 WS URL，已迁移为 /api/ws')
    envContent = envContent.replace(/^NEXT_PUBLIC_WS_URL=.*/m, 'NEXT_PUBLIC_WS_URL=/api/ws')
    envNeedsRewrite = true
  }

  if (envNeedsRewrite) {
    fs.writeFileSync(envPath, envContent)
  }
} else {
  envContent = defaultEnvContent
  fs.writeFileSync(envPath, envContent)
  console.log(`📝 已生成默认配置文件: ${envPath}`)
}

// 读取全局配置文件
console.log(`📝 加载全局配置: ${envPath}`)

// 解析.env文件内容
envContent.split('\n').forEach(line => {
  line = line.trim()
  if (!line || line.startsWith('#')) return
  const [key, ...valueParts] = line.split('=')
  const configKey = key.trim()
  const configValue = valueParts
    .join('=')
    .trim()
    .replace(/^["']|["']$/g, '')

  process.env[configKey] = configValue

  // 收集NEXT_PUBLIC_开头的配置，需要暴露给前端
  if (configKey.startsWith('NEXT_PUBLIC_')) {
    publicEnv[configKey] = configValue
  }
})

// 生成动态配置文件，注入到前端
const publicDir = path.join(standaloneDir, 'public')
const envJsPath = path.join(publicDir, 'env.js')

const envJsContent = `
// PolyMind 运行时动态配置，自动生成请勿修改
window.process = window.process || {};
window.process.env = Object.assign(window.process.env || {}, ${JSON.stringify(publicEnv)});
`

// 写入配置文件
fs.mkdirSync(publicDir, { recursive: true })
fs.writeFileSync(envJsPath, envJsContent)
console.log(`✅ 共加载 ${Object.keys(publicEnv).length} 项自定义配置`)

// 启动信息
const frontendPort = process.env.FRONTEND_PORT || '3000'
console.log(`🚀 启动 PolyMind Web 服务（nginx 反向代理）`)
console.log(`📌 nginx 监听端口: ${frontendPort}`)
console.log(`📌 Next.js 内部端口: ${port} (127.0.0.1)`)
console.log(`📌 后端代理: /api/* -> 127.0.0.1:${backendPort}`)

// 启动Next.js独立服务，直接传递参数确保生效
const serverPath = path.join(standaloneDir, 'server.js')
const serverArgs = [serverPath, '--host', host, '--port', port]
console.log(`🔧 启动命令: node ${serverArgs.join(' ')}`)

const server = spawn('node', serverArgs, {
  cwd: standaloneDir,
  env: {
    ...process.env,
    PORT: port,
    HOST: host,
    HOSTNAME: host,
  },
  stdio: 'inherit',
})

server.on('close', code => {
  process.exit(code)
})

server.on('error', err => {
  console.error('❌ 启动失败:', err.message)
  process.exit(1)
})
