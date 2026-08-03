# PolyMind DevContainer 开发环境

> ℹ️ English version: [README_EN.md](README_EN.md)

本目录包含 [VS Code Dev Containers](https://code.visualstudio.com/docs/devcontainers/containers) 配置文件，让你在容器化的开发环境中快速开始 PolyMind 开发。

## 前置条件

- [Docker](https://docs.docker.com/get-docker/) (Docker Desktop 或 Docker Engine)
- [VS Code](https://code.visualstudio.com/) + [Dev Containers 扩展](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

## 两种模式

打开项目后，VS Code 会提示选择开发容器模式：

### 模式 1：PolyMind (Frontend) — 默认推荐

**单容器方案**，仅包含前端开发所需的 Node.js + pnpm 环境。

- 🟢 **适用场景**：前端开发、UI 调整、组件开发
- 📦 **包含**：Node.js 24、pnpm 11、ESLint/Prettier/Tailwind CSS 扩展
- 🔗 **外部依赖**：agentd 和 witty-service 后端需要宿主机单独运行（或在 Compose 模式中启动）

### 模式 2：PolyMind (Full Stack + agentd + witty-service) — 进阶

**Docker Compose 方案**，编排前端 + 后端全栈服务。

- 🟡 **适用场景**：全栈调试、后端 API 联调
- 📦 **包含**：模式 1 所有内容 + agentd + witty-service 容器
- ⚠️ **前置条件**：需要 agentd 和 witty-service 仓库在本地同级目录

## 快速开始

```bash
# 1. 克隆仓库
git clone https://atomgit.com/openeuler/polymind.git
cd polymind

# 2. 用 VS Code 打开项目
code .

# 3. 点击右下角提示或按 F1 → "Dev Containers: Reopen in Container"
#    选择 "PolyMind (Frontend)" 模式
```

容器首次构建约需 1-2 分钟（后续启动使用缓存，秒级完成）。`postCreateCommand` 自动完成以下操作：
- 创建 `.env` 配置文件（基于 `.env.example` 模板）
- 执行 `pnpm install` 安装依赖
- 安装 Git Hooks（husky + commitlint）
- 显示 Node.js 和 pnpm 版本信息

启动开发服务器：

```bash
pnpm dev   # → http://localhost:3000
```

## 端口说明

| 端口 | 服务 | 说明 |
|------|------|------|
| 3000 | PolyMind Dev Server | `pnpm dev` 开发服务器（自动转发） |
| 3001 | PolyMind Production | `node bin/start.js` 生产模式 |
| 8000 | agentd API | 后端 API（模式 1 为宿主机服务，模式 2 为容器服务） |
| 8081 | witty-service | 技能市场后端（同上） |
| 18080 | agentd WebSocket | 后端 WebSocket（同上） |

## 环境变量

容器首次创建时，`.devcontainer/scripts/post-create.sh` 会自动生成 `.env` 文件。默认使用 `127.0.0.1` 绝对地址连接后端：

```
NEXT_PUBLIC_AGENTD_API_URL=http://127.0.0.1:8000
NEXT_PUBLIC_WS_URL=ws://127.0.0.1:8000/ws
NEXT_WITTYHUB_API_URL=http://127.0.0.1:8081
```

你可以按需修改 `.env` 配置。如果 `.env` 已存在，脚本不会覆盖。

## 缓存策略

项目使用两个命名卷来加速后续启动：

- `polymind_pnpm_store` — pnpm 全局包缓存（`/home/node/.local/share/pnpm`）
- `polymind_node_modules` — 项目依赖（`/workspaces/polymind/node_modules`）

这两个卷在容器重建后仍然保留，使 `pnpm install` 几乎瞬时完成。

## 故障排查

### 工作区不可写

如果在容器内遇到权限错误，运行一次：

```bash
sudo chown -R node:node /workspaces/polymind
```

这通常发生在 Linux 宿主机上（Docker Desktop for Mac/Windows 无此问题）。

### pnpm install 失败

如果依赖安装失败，尝试清理卷后重建：

```bash
# 在宿主机终端执行
docker volume rm polymind_pnpm_store polymind_node_modules
# 然后在 VS Code 中 Rebuild Container
```

### 后端服务不可用

模式 1 中，后端服务运行在宿主机上。确保：
- agentd 监听在 `127.0.0.1:8000`
- witty-service 监听在 `127.0.0.1:8081`

或使用模式 2（Docker Compose）启动完整后端服务。

### 国内网络加速

如在安装依赖时网络较慢，可配置国内镜像源：

```bash
pnpm config set registry https://registry.npmmirror.com
```

## 配置说明

- **Node.js 24**：与 CI（`release.yml`）保持一致
- **pnpm 11.17.0**：精确锁定版本，与 CI 一致
- **ESLint Flat Config**：通过 `eslint.useFlatConfig: true` 启用

## 更多信息

- [VS Code Dev Containers 文档](https://code.visualstudio.com/docs/devcontainers/containers)
- [Dev Container Features 参考](https://containers.dev/features)
- [PolyMind 项目 README](../README.md)
