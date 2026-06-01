#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// 查找 Next.js standalone 目录（兼容嵌套和扁平两种结构）
function findStandaloneDir() {
  const base = path.join(rootDir, '.next', 'standalone');

  // 情况1: server.js 直接在 standalone/ 下
  if (fs.existsSync(path.join(base, 'server.js'))) {
    return base;
  }

  // 情况2: server.js 在 standalone/<name>/ 子目录下（Next.js 按包名嵌套）
  try {
    const entries = fs.readdirSync(base, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const candidate = path.join(base, entry.name);
        if (fs.existsSync(path.join(candidate, 'server.js'))) {
          return candidate;
        }
      }
    }
  } catch (e) {
    // 目录不存在等情况，回退到默认路径
  }

  // 回退：返回默认路径，让后续报错给出清晰的错误信息
  return base;
}

const standaloneDir = findStandaloneDir();

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

// 获取后端端口（从环境变量或默认值）
const backendPort = process.env.BACKEND_PORT || '8000';
const backendHost = process.env.BACKEND_HOST || '127.0.0.1';

// 动态替换构建后代码中的硬编码后端地址
function replaceBackendUrlInBuild() {
  if (backendPort === '8000' && backendHost === '127.0.0.1') {
    // 默认配置，无需替换
    return;
  }

  const targetDir = path.join(standaloneDir, '.next');
  if (!fs.existsSync(targetDir)) {
    return;
  }

  const newApiUrl = `http://${backendHost}:${backendPort}`;
  const newWsUrl = `ws://${backendHost}:${backendPort}`;

  console.log(`🔄 动态替换构建代码中的后端地址 -> ${newApiUrl}`);

  // 使用正则匹配任意端口号（解决上次替换后本次无法匹配旧端口的问题）
  const apiRegex = /http:\/\/127\.0\.0\.1:\d+/g;
  const wsRegex = /ws:\/\/127\.0\.0\.1:\d+/g;

  // 递归查找所有 .js 文件
  const files = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name));
      } else if (entry.name.endsWith('.js')) {
        files.push(path.join(dir, entry.name));
      }
    }
  }

  try {
    walk(targetDir);
  } catch (e) {
    return;
  }

  for (const file of files) {
    try {
      let content = fs.readFileSync(file, 'utf-8');
      const oldContent = content;
      content = content.replace(apiRegex, newApiUrl);
      content = content.replace(wsRegex, newWsUrl);
      if (content !== oldContent) {
        fs.writeFileSync(file, content);
        console.log(`   ✓ ${path.relative(rootDir, file)}`);
      }
    } catch (e) {
      // 忽略无法读取/写入的文件
    }
  }
}

// 动态替换 server.js 中的 allowedDevOrigins
function replaceAllowedOrigins() {
  // 1. 优先从环境变量获取，其次从 .env 配置文件读取
  let allowedOriginsEnv = process.env.ALLOWED_ORIGINS;

  if (!allowedOriginsEnv || allowedOriginsEnv.trim() === '') {
    // 环境变量未设置，尝试从 .env 文件读取（支持持久化配置）
    if (fs.existsSync(envPath)) {
      try {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const match = envContent.match(/^ALLOWED_ORIGINS=(.+)$/m);
        if (match && match[1].trim() !== '') {
          allowedOriginsEnv = match[1].trim();
        }
      } catch (e) {
        // 读取失败，忽略
      }
    }
  }

  if (!allowedOriginsEnv || allowedOriginsEnv.trim() === '') {
    // 未配置，使用默认值
    return;
  }

  const serverPath = path.join(standaloneDir, 'server.js');
  if (!fs.existsSync(serverPath)) {
    return;
  }

  // 将逗号分隔的字符串转换为 JSON 数组格式
  const originsArray = allowedOriginsEnv
    .split(',')
    .map(o => o.trim())
    .filter(o => o !== '');

  if (originsArray.length === 0) {
    console.warn('⚠️  ALLOWED_ORIGINS 格式无效，使用默认值');
    return;
  }

  const newAllowedOrigins = JSON.stringify(originsArray);

  try {
    let content = fs.readFileSync(serverPath, 'utf-8');
    const oldContent = content;
    // 匹配 "allowedDevOrigins":[...] 格式并替换（支持 IPv6、端口号等）
    content = content.replace(
      /"allowedDevOrigins"\s*:\s*\[[^\]]*\]/g,
      `"allowedDevOrigins":${newAllowedOrigins}`
    );

    if (content !== oldContent) {
      fs.writeFileSync(serverPath, content);
      console.log(`🔄 动态配置允许的访问来源: ${newAllowedOrigins}`);
    }
  } catch (e) {
    console.warn(`⚠️  无法修改 allowedDevOrigins: ${e.message}`);
  }
}

// 执行替换
replaceBackendUrlInBuild();
replaceAllowedOrigins();

// 默认配置内容（动态插入后端端口）
const defaultEnvContent = `# PolyMind 全局配置文件
# 修改后重启服务即可生效
# ==============================================
# 后端API地址
NEXT_PUBLIC_AGENTD_API_URL=http://${backendHost}:${backendPort}
# WebSocket地址
NEXT_PUBLIC_WS_URL=ws://${backendHost}:${backendPort}/ws
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
# 后端服务地址（默认 127.0.0.1，远程访问时设为虚拟机 IP）
BACKEND_HOST=127.0.0.1
# 允许访问的来源（逗号分隔，修改后重启生效）
ALLOWED_ORIGINS=127.0.0.1,localhost
# 调试模式
NEXT_PUBLIC_DEBUG=false
`;

// 检查是否需要动态更新后端端口配置
let envContent = '';
if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf-8');
  
  // 如果环境变量指定了后端端口，强制更新配置文件
  if (process.env.BACKEND_PORT) {
    const newApiUrl = `NEXT_PUBLIC_AGENTD_API_URL=http://${backendHost}:${backendPort}`;
    const newWsUrl = `NEXT_PUBLIC_WS_URL=ws://${backendHost}:${backendPort}/ws`;
    
    // 使用正则替换现有的配置
    envContent = envContent.replace(/NEXT_PUBLIC_AGENTD_API_URL=.*/, newApiUrl);
    envContent = envContent.replace(/NEXT_PUBLIC_WS_URL=.*/, newWsUrl);
    
    // 写入更新后的配置文件
    fs.writeFileSync(envPath, envContent);
    console.log(`🔄 动态更新后端地址: ${newApiUrl}`);
    console.log(`🔄 动态更新WebSocket地址: ${newWsUrl}`);
  }
} else {
  // 配置文件不存在，使用默认配置（已包含动态端口）
  envContent = defaultEnvContent;
  fs.writeFileSync(envPath, envContent);
  console.log(`📝 已生成默认配置文件: ${envPath}`);
}

// 读取全局配置文件
console.log(`📝 加载全局配置: ${envPath}`);
console.log(`💡 修改配置后重启服务即可生效`);

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
const publicDir = path.join(standaloneDir, 'public');
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
const serverPath = path.join(standaloneDir, 'server.js');
const serverArgs = [serverPath, '--host', host, '--port', port];

// 打印执行命令方便排查
console.log(`🔧 启动命令: node ${serverArgs.join(' ')}`);

const server = spawn('node', serverArgs, {
  cwd: standaloneDir,
  env: {
    ...process.env,
    PORT: port,
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
