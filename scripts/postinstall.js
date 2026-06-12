#!/usr/bin/env node
import os from 'os'
import path from 'path'
import fs from 'fs'

// 获取用户主目录
const homedir = os.homedir()
const polymindDir = path.join(homedir, '.polymind')
const envPath = path.join(polymindDir, '.env')

// 创建配置目录
fs.mkdirSync(polymindDir, { recursive: true })

// 默认配置内容
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
`

// 如果配置文件不存在则写入默认配置，存在则不覆盖
if (!fs.existsSync(envPath)) {
  fs.writeFileSync(envPath, defaultEnvContent)
  console.log(`✅ PolyMind 全局配置目录已创建: ${polymindDir}`)
  console.log(`📝 默认配置文件已生成: ${envPath}`)
} else {
  console.log(`✅ PolyMind 配置文件已存在: ${envPath}，跳过初始化`)
}
