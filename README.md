# PolyMind

🌐 语言选择 | [English](README_EN.md) | **简体中文**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![npm version](https://img.shields.io/npm/v/polymind.svg)](https://www.npmjs.com/package/polymind)

原生集成 agentd 服务的自托管 AI Agent 交互平台。PolyMind 将 AI 对话、Agent 工作流编排与多模型管理融为一体，提供开箱即用的完整解决方案，让你无需复杂配置即可搭建专属的 AI Agent 运行环境。

## 目录

- [项目介绍](#项目介绍)
   - [功能特性](#功能特性)
   - [技术架构](#技术架构)
   - [安装指南](#安装指南)
   - [快速开始](#快速开始)
- [配置说明](#配置说明)
- [部署流程](#部署流程)
- [本地开发](#本地开发)
- [许可证](#许可证)
- [支持与反馈](#支持与反馈)

### 功能特性

- 🧩 **原生 agentd 集成** — 通过 agentd 服务管理 Agent 的完整生命周期（创建、沙箱运行、暂停/恢复），支持 OpenCode、OpenClaw、Claude Code 等多种 Adapter
- 💬 **智能对话** — 持久化多会话管理，支持 Markdown 渲染、代码高亮、数学公式（KaTeX）、流程图（Mermaid）等富文本展示
- 🛠️ **技能市场** — 内置技能仓库管理，支持从市场安装、上传自定义技能包，为 Agent 注入专业能力
- 🔧 **多模型管理** — 统一配置和切换不同 AI 模型提供商，灵活适配业务需求
- 📌 **分面板工作区** — 可调整大小的分面板布局，同时查看对话与工具面板，适配多种使用场景
- 🔐 **安全认证** — 基于 Token 的身份认证机制，保障 API 接口访问安全
- 🚀 **开箱即用** — 作为独立 npm 包分发，一条命令完成安装和启动

### 技术架构

| 层级 | 技术栈 |
|------|--------|
| 前端框架 | Next.js 16 + React 19 |
| 语言 | TypeScript 5.7 |
| UI 组件 | shadcn/ui + Radix UI |
| 样式方案 | Tailwind CSS 4 |
| 状态管理 | Zustand 5 |
| 图表可视化 | Recharts |

### 安装指南

#### 方式一：一键脚本安装（推荐非开发人员使用）

项目提供了 `install.sh` 脚本，自动完成环境检测、依赖安装和环境隔离，适合非开发人员快速部署。

**前置条件：**

| 依赖 | 说明 | 安装方式 |
|------|------|----------|
| Node.js | v22+ | [nodejs.org](https://nodejs.org/) |
| pnpm | 包管理器 | `npm install -g pnpm` |
| Python 3 | 后端运行时 | [python.org](https://www.python.org/downloads/) |
| pip | Python 包管理器 | 随 Python 一同安装 |

**安装步骤：**

1. 克隆仓库：

```bash
git clone https://atomgit.com/openeuler/polymind.git
cd polymind
```

2. 运行安装脚本：

```bash
bash install.sh
```

脚本将自动执行以下操作：
- **环境检测** — 检查操作系统、架构，以及 Node.js、pnpm、Python、pip 是否已安装
- **镜像源配置** — 自动配置华为云镜像加速下载
- **环境隔离初始化** — 创建 Python 虚拟环境，生成独立的环境配置文件
- **依赖安装** — 通过 pnpm 安装 `polymind` 前端包和 `openclaw`，通过 pip 安装 `witty-service` 后端包
- **安装验证** — 验证所有组件是否正确安装

3. 安装完成后，脚本会输出安装摘要：

```
============================================
  PolyMind 安装完成!
============================================

  安装目录:  ~/.polymind
  环境配置:  ~/.polymind/.profile
  应用配置:  ~/.polymind/.env
  安装日志:  ~/.polymind/install.log

  启动服务:  bash start.sh
```

#### 方式二：npm 包安装

如果已自行部署 agentd 后端服务，可仅安装前端：

```bash
npm install -g polymind
# 或
pnpm add -g polymind
# 或
yarn global add polymind
```

### 快速开始

#### 通过 start.sh 启动

完成安装后，使用 `start.sh` 脚本启动服务（无需重新安装依赖）：

```bash
bash start.sh
```

脚本会自动：
- 检查 `polymind` 和 `witty-service` 是否已安装
- 加载 `~/.polymind/.env` 中的持久化配置
- 交互式配置允许访问的 IP 地址（支持本地和远程访问）
- 检测可用端口并启动前后端服务

`start.sh` 还支持以下管理命令：

```bash
bash start.sh --status    # 查看服务运行状态
bash start.sh --stop      # 停止所有运行中的服务
```

#### 通过 CLI 启动

如果已全局安装 polymind，可直接使用命令行：

```bash
# 默认端口启动
polymind

# 指定端口
polymind --port 8080

# 指定绑定地址
polymind --host 0.0.0.0 --port 8080
```

#### 环境变量启动

支持通过环境变量控制启动参数，适合脚本化部署：

```bash
BACKEND_HOST=192.168.1.100 BACKEND_PORT=8000 FRONTEND_PORT=3000 polymind
```

## 配置说明

PolyMind 使用 `~/.polymind/.env` 作为全局配置文件，首次运行时自动生成。修改配置后重启服务即可生效。

### 核心配置项

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `NEXT_PUBLIC_AGENTD_API_URL` | agentd 后端 API 地址 | `http://127.0.0.1:8000` |
| `NEXT_PUBLIC_WS_URL` | WebSocket 连接地址 | `ws://127.0.0.1:8000/ws` |
| `NEXT_PUBLIC_API_TIMEOUT` | API 请求超时时间（毫秒） | `30000` |
| `NEXT_PUBLIC_AUTH_TOKEN` | API 访问认证 Token | `dev-token` |
| `NEXT_PUBLIC_APP_NAME` | 应用名称 | `PolyMind` |
| `NEXT_PUBLIC_DEBUG` | 调试模式 | `false` |

### 连接与重试配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `NEXT_PUBLIC_MAX_RECONNECT_ATTEMPTS` | WebSocket 最大重连次数 | `5` |
| `NEXT_PUBLIC_RECONNECT_INTERVAL` | 重连间隔（毫秒） | `3000` |

### 网络与访问控制

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `BACKEND_HOST` | 后端服务主机地址 | `127.0.0.1` |
| `BACKEND_PORT` | 后端服务端口 | `8000` |
| `FRONTEND_PORT` | 前端服务端口 | `3000` |
| `ALLOWED_ORIGINS` | 允许访问的来源（逗号分隔） | `127.0.0.1,localhost` |

> **提示：** 如需从外部机器访问 PolyMind，请将 `ALLOWED_ORIGINS` 添加服务器 IP，并将 `BACKEND_HOST` 设为服务器的局域网 IP 地址。

## 部署流程

### 测试环境

适用于集成测试和功能验证：

```bash
# 构建生产包
pnpm run build

# 使用构建产物启动
pnpm run start
```

### 生产环境

**方式一：npm 全局安装（推荐）**

```bash
# 全局安装
pnpm add -g polymind

# 启动服务
polymind --host 0.0.0.0 --port 3000
```

**方式二：从源码构建**

```bash
# 克隆并构建
git clone https://atomgit.com/openeuler/polymind.git
cd polymind
pnpm install
pnpm run build

# 启动
pnpm run start
```

### 生产环境注意事项

- **认证 Token** — 务必修改 `NEXT_PUBLIC_AUTH_TOKEN` 默认值，使用强随机字符串
- **网络隔离** — 生产环境建议将 `ALLOWED_ORIGINS` 限制为可信 IP，避免未授权访问
- **反向代理** — 推荐在 PolyMind 前部署 Nginx 等反向代理，配置 HTTPS 证书
- **进程管理** — 建议使用 systemd 或 PM2 管理服务进程，实现自动重启

## 本地开发

### 环境搭建

```bash
# 1. 克隆仓库
git clone https://atomgit.com/openeuler/polymind.git
cd polymind

# 2. 安装依赖
pnpm install

# 3. 根据需要修改 .env 中的配置

# 4. 启动开发服务器
pnpm run dev
```

### 常用开发命令

| 命令 | 说明 |
|------|------|
| `pnpm run dev` | 启动开发服务器（热重载） |
| `pnpm run build` | 构建生产包 |
| `pnpm run start` | 使用构建产物启动服务 |
| `pnpm run lint` | 运行 ESLint 代码检查 |
| `pnpm run test` | 运行 Jest 测试 |

### 项目结构

```
polymind/
├── app/                    # Next.js App Router 页面
│   ├── config/             # 应用配置管理
│   ├── layout.tsx          # 根布局
│   └── page.tsx            # 主页面
├── bin/                    # CLI 入口（start.js）
├── components/             # React 组件
│   ├── chat/               # 对话相关组件
│   ├── settings/           # 设置页面组件
│   ├── tool-panel/         # 工具面板（Agent、CVE、Backport）
│   └── ui/                 # shadcn/ui 基础组件
├── docs/                   # 设计文档与 API 规范
├── hooks/                  # 自定义 React Hooks
├── lib/                    # 工具函数与类型定义
├── services/               # API 服务层
│   ├── agent-service.ts    # Agent 管理
│   ├── session-service.ts  # 会话管理
│   ├── message-service.ts  # 消息服务
│   ├── skill-service.ts    # 技能管理
│   ├── model-service.ts    # 模型管理
│   ├── cve-service.ts      # CVE 漏洞服务
│   └── patchflow-agent-service.ts  # Patchflow Agent
├── scripts/                # 构建/安装辅助脚本
├── install.sh              # 一键安装脚本
├── start.sh                # 一键启动脚本
└── packaging/              # 打包发布脚本
```

### 代码贡献流程

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feature/your-feature`
3. 提交更改：`git commit -m 'Add your feature'`
4. 推送分支：`git push origin feature/your-feature`
5. 提交 Pull Request

### 开发规范

- **代码风格** — 遵循 ESLint 配置，提交前运行 `pnpm run lint` 检查
- **提交规范** — 使用语义化提交信息（如 `feat:`、`fix:`、`docs:`、`refactor:`）
- **类型安全** — 充分利用 TypeScript 类型系统，避免使用 `any`
- **组件规范** — UI 组件基于 shadcn/ui 规范，保持与现有组件风格一致
- **测试覆盖** — 新增功能需编写对应的单元测试（Jest）


## 许可证

本项目基于 [MIT 许可证](LICENSE) 开源。

## 支持与反馈

- **问题反馈** — 请在 [AtomGit Issues](https://atomgit.com/openeuler/polymind/issues) 提交
- **功能建议** — 欢迎通过 Issue 或 Pull Request 参与
- **项目主页** — [https://atomgit.com/openeuler/polymind](https://atomgit.com/openeuler/polymind)
