# 测试脚本说明

本目录包含用于测试前端与agentd后端服务集成的脚本。

## 脚本列表

### 1. test-agents-api.js
使用 Node.js 内置的 `http`/`https` 模块实现的测试脚本。

### 2. test-agents-api-fetch.js
使用现代 `fetch` API 实现的测试脚本（推荐）。

## 使用方法

### 方法一：使用默认配置
```bash
node scripts/test-agents-api-fetch.js
```

### 方法二：指定API URL
```bash
NEXT_PUBLIC_AGENTD_API_URL=http://your-server:port node scripts/test-agents-api-fetch.js
```

或者在Windows上：
```cmd
set NEXT_PUBLIC_AGENTD_API_URL=http://your-server:port && node scripts/test-agents-api-fetch.js
```

## 环境变量

- `NEXT_PUBLIC_AGENTD_API_URL`: agentd服务的API基础URL（默认：`http://localhost:18080`）

## 输出说明

测试脚本将输出：
- 请求状态和响应时间
- HTTP状态码和响应头
- 代理列表详情
- 错误信息（如果有）

## 故障排除

如果遇到连接错误，请检查：
1. agentd服务是否正在运行
2. API URL配置是否正确
3. 网络连接是否正常
4. 防火墙设置是否允许相应端口通信