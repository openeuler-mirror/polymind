#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// 处理命令行参数
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = portIndex !== -1 ? args[portIndex + 1] : '3000';
const hostIndex = args.indexOf('--host');
const host = hostIndex !== -1 ? args[hostIndex + 1] : '0.0.0.0';

// ==================== 运行时配置加载 ====================
const homedir = os.homedir();
const polymindDir = path.join(homedir, '.polymind');
const envPath = path.join(polymindDir, '.env');
const publicEnv = {};

// 确保配置目录存在
fs.mkdirSync(polymindDir, { recursive: true });

// 默认配置内容
const defaultEnvContent = `# PolyMind 全局配置文件
# 修改后重启服务即可生效
# ==============================================
# 后端API地址
NEXT_PUBLIC_AGENTD_API_URL=http://127.0.0.1:8000
# WebSocket地址
NEXT_PUBLIC_WS_URL=ws://127.0.0.1:8000/ws
# API请求超时时间(毫秒)
NEXT_PUBLIC_API_TIMEOUT=30000
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
`;

// 如果配置文件不存在则创建默认配置
if (!fs.existsSync(envPath)) {
  fs.writeFileSync(envPath, defaultEnvContent);
  console.log(`📝 已生成默认配置文件: ${envPath}`);
}

// 读取全局配置文件
console.log(`📝 加载全局配置: ${envPath}`);
console.log(`💡 修改配置后重启服务即可生效`);
const envContent = fs.readFileSync(envPath, 'utf-8');

// 解析.env文件内容
envContent.split('\n').forEach(line => {
  line = line.trim();
  if (!line || line.startsWith('#')) return;
  const [key, ...valueParts] = line.split('=');
  const configKey = key.trim();
  const configValue = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
  
  // 注入到环境变量
  process.env[configKey] = configValue;
  
  // 收集NEXT_PUBLIC_开头的配置，需要暴露给前端
  if (configKey.startsWith('NEXT_PUBLIC_')) {
    publicEnv[configKey] = configValue;
  }
});

// 生成动态配置文件，注入到前端
const publicDir = path.join(rootDir, '.next', 'standalone', 'public');
const envJsPath = path.join(publicDir, 'env.js');

// 兼容原有代码，直接挂载到window.process.env
const envJsContent = `
// PolyMind 运行时动态配置，自动生成请勿修改
window.process = window.process || {};
window.process.env = Object.assign(window.process.env || {}, ${JSON.stringify(publicEnv)});
`;

// 写入配置文件
fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(envJsPath, envJsContent);
console.log(`✅ 共加载 ${Object.keys(publicEnv).length} 项自定义配置`);
// ==================== 配置加载完成 ====================

// 生成访问地址显示
let displayHost = host;
if (host === '0.0.0.0' || host === '::') {
  displayHost = 'localhost';
  // 提示可以通过服务器IP访问
  console.log(`🚀 启动 PolyMind Web 服务`);
  console.log(`📌 绑定地址: ${host}`);
  console.log(`📌 服务端口: ${port}`);
  console.log(`📂 服务根目录: ${rootDir}`);
  console.log(`🌐 本地访问: http://${displayHost}:${port}`);
  console.log(`🌐 局域网访问: http://<服务器IP>:${port}`);
} else {
  console.log(`🚀 启动 PolyMind Web 服务`);
  console.log(`📌 绑定地址: ${host}`);
  console.log(`📌 服务端口: ${port}`);
  console.log(`📂 服务根目录: ${rootDir}`);
  console.log(`🌐 访问地址: http://${host}:${port}`);
}

// 启动Next.js独立服务，直接传递参数确保生效
const serverPath = path.join(rootDir, '.next', 'standalone', 'server.js');
const serverArgs = [serverPath, '--host', host, '--port', port];

// 打印执行命令方便排查
console.log(`🔧 启动命令: node ${serverArgs.join(' ')}`);

const server = spawn('node', serverArgs, {
  cwd: rootDir,
  env: {
    ...process.env,
    HOST: host,
    HOSTNAME: host,
  },
  stdio: 'inherit'
});

server.on('close', (code) => {
  process.exit(code);
});

server.on('error', (err) => {
  console.error('❌ 启动失败:', err.message);
  process.exit(1);
});
