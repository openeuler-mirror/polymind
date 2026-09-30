# PolyMind DevContainer 开发环境

> ℹ️ English version: [README_EN.md](README_EN.md)

本目录包含 [VS Code Dev Containers](https://code.visualstudio.com/docs/devcontainers/containers) 配置文件，让你在容器化的开发环境中快速开始 PolyMind 开发。

## 前置条件

- [Docker](https://docs.docker.com/get-docker/) (Docker Desktop 或 Docker Engine)
- [VS Code](https://code.visualstudio.com/) + [Dev Containers 扩展](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

## 模式

打开项目后，VS Code 会提示选择开发容器模式：

### 模式 1：PolyMind (Frontend) — 默认推荐

**单容器方案**，仅包含前端开发所需的 Node.js + pnpm 环境。

- 🟢 **适用场景**：前端开发、UI 调整、组件开发
- 📦 **包含**：Node.js 24、pnpm 11、ESLint/Prettier/Tailwind CSS 扩展
- 🔗 **外部依赖**：agentd 和 witty-service 后端需要宿主机单独运行

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

容器首次构建约需 1-2 分钟（后续启动使用缓存，秒级完成）。`onCreateCommand` 自动完成以下操作：
- 修复工作区文件权限（Linux 宿主机）
- 修复两个命名卷挂载点的权限（避免 `pnpm install` 因 EACCES 失败）
- 清理残留的 `.next/` 构建缓存
- 基于 `.env.example` 模板创建 `.env` 配置文件
- 启用仓库自带的 Git 提交钩子并预热 hook 环境（容器内 `core.hooksPath=.githooks`）
- 执行 `pnpm install` 安装依赖（pnpm 内置网络自动重试）
- 显示 Node.js、pnpm 与 pre-commit 版本信息

启动开发服务器：

```bash
pnpm dev   # → http://localhost:3000
```

## Git 提交钩子（pre-commit）

容器内**不执行** `pre-commit install`：它会把 hook 写进 bind-mount 进容器的宿主机 `.git/hooks`，并把容器内的解释器路径写进宿主机仓库。容器改用仓库自带的 `.githooks/`：

- **构建期**由 [Dockerfile](Dockerfile) 预装 `pre-commit` 到系统路径（只装本体，不注册钩子），同时预装 Go 工具链（`GOPROXY` 默认国内源）供 gitleaks 钩子构建
- **post-create** 在容器内设置全局 `core.hooksPath=.githooks`（落在容器内 `~/.gitconfig`，不写宿主机工作区），并执行 `pre-commit install-hooks` 预热 hook 环境
- **钩子脚本**是仓库 tracked 的 [.githooks/pre-commit](../.githooks/pre-commit) 与 [.githooks/commit-msg](../.githooks/commit-msg)，分别执行 `pre-commit run` 与 `pre-commit run --hook-stage commit-msg`（commitlint 校验提交信息）

效果：容器内 `git commit` 自动检查暂存文件，检查项与宿主机同源（同一份 [.pre-commit-config.yaml](../.pre-commit-config.yaml)），宿主机 `.git/hooks` 不会被容器改写——`core.hooksPath` 设置后 pre-commit 会主动拒绝 `install`，容器内误执行也改不动宿主机 `.git`。

宿主机上想用同一套钩子，在仓库根执行一次即可（撤销：`git config --unset core.hooksPath`）：

```bash
git config core.hooksPath .githooks
```

## 端口说明

| 端口 | 服务 | 说明 |
|------|------|------|
| 3000 | PolyMind Dev Server | `pnpm dev` 开发服务器（自动转发） |
| 3001 | PolyMind Production | `node bin/start.js` 生产模式 |
| 8000 | agentd / witty-service | 后端 API 与 WebSocket（宿主机服务） |

## 环境变量

容器首次创建时，`.devcontainer/scripts/post-create.sh` 会自动生成 `.env` 文件。默认使用 `127.0.0.1` 绝对地址连接后端：

```
NEXT_PUBLIC_AGENTD_API_URL=http://127.0.0.1:8000
NEXT_PUBLIC_WS_URL=ws://127.0.0.1:8000/ws
NEXT_WITTYHUB_API_URL=https://skillhub.openeuler.org
```

你可以按需修改 `.env` 配置。如果 `.env` 已存在，脚本不会覆盖。

## 缓存策略

项目使用两个命名卷来加速后续启动：

- `polymind_pnpm_store` — pnpm 全局包缓存（`/home/node/.local/share/pnpm`）
- `polymind_node_modules` — 项目依赖（`/workspaces/polymind/node_modules`）

这两个卷在容器重建后仍然保留，使 `pnpm install` 几乎瞬时完成。

Dockerfile 会预先以 `node` 用户创建这两个挂载点，因此新建的卷天然具备正确属主；早期版本创建的 root 属主卷由 `post-create.sh` 自动修复。

## 镜像源配置

构建镜像默认使用国内镜像源，可在 `devcontainer.json` 的 `build.args` 中覆盖：

| Build Arg | 默认值 | 说明 |
|-----------|--------|------|
| `APT_MIRROR` | `http://mirrors.huaweicloud.com` | Debian 软件源根地址（含协议，不带结尾斜杠）。置空则保留上游 `deb.debian.org`；若该镜像不可达，构建会自动回退到上游 |
| `NPM_REGISTRY` | `https://registry.npmmirror.com` | npm/pnpm/corepack 仓库地址，写入容器内 `~/.npmrc` |
| `PIP_INDEX_URL` | `https://pypi.tuna.tsinghua.edu.cn/simple` | PyPI 源地址，用于构建阶段预装 pre-commit；不可达时构建会失败，改换源后 Rebuild Container 即可 |

说明：

- Debian slim 基础镜像不含 CA 证书，因此 `APT_MIRROR` **仅支持 http**；apt 通过 Debian GPG 签名校验包的完整性。
- pnpm 在构建阶段就已预热到 `COREPACK_HOME`，首次 `pnpm install` 无需再从网络下载 pnpm 自身。
- pre-commit 同样在构建阶段预装到系统路径（`/usr/local/bin/pre-commit`），驱动仓库自带的 `.githooks/` 钩子（见「Git 提交钩子」）——它只作为钩子的执行器，注册由容器内 `core.hooksPath` 完成。`PIP_INDEX_URL` 会以环境变量形式带入容器，便于容器内补装。
- gitleaks 钩子（`.pre-commit-config.yaml`）为 `language: golang`，镜像内已预装 Go 工具链，模块下载走 `GOPROXY=https://goproxy.cn,direct`。
- 如需改用其它镜像（如 `http://mirrors.aliyun.com`、`http://mirrors.tuna.tsinghua.edu.cn`），直接修改 `build.args` 后 Rebuild Container 即可。

## 故障排查

### 工作区不可写

如果在容器内遇到权限错误，运行一次：

```bash
sudo chown -R node:node /workspaces/polymind
```

这通常发生在 Linux 宿主机上（Docker Desktop for Mac/Windows 无此问题）。

### pnpm install 失败

`post-create.sh` 会自动修复两个命名卷的属主，pnpm 自带网络重试（`--fetch-retries=5`），正常情况下无需手工干预。

如果仍然失败，先看报错类型：

- **权限类（EACCES / Permission denied）**：清理旧卷后重建（旧版本创建的卷属主为 root）。

  ```bash
  # 在宿主机终端执行
  docker volume rm polymind_pnpm_store polymind_node_modules
  # 然后在 VS Code 中 Rebuild Container
  ```

- **网络类（ETIMEDOUT / ECONNRESET / 404）**：检查 `NPM_REGISTRY` 指向的镜像是否可达，或在 `devcontainer.json` 的 `build.args` 中改换镜像源后 Rebuild Container。

### Git 提交钩子未生效

`pre-commit` 在镜像构建阶段预装到 `/usr/local/bin`，`post-create.sh` 再把容器内 `core.hooksPath` 指向仓库自带的 `.githooks`。逐项确认：

```bash
command -v pre-commit && pre-commit --version
git config --show-origin core.hooksPath   # 期望：file:/home/node/.gitconfig  .githooks
ls -l .githooks/                          # 需有可执行的 pre-commit 与 commit-msg
```

若 `pre-commit` 缺失（镜像过旧，或构建时 PyPI 源不可达），在容器内补装一次即可：

```bash
pip install --user --break-system-packages -i "$PIP_INDEX_URL" pre-commit
```

若 `core.hooksPath` 被覆盖（例如手动替换了容器内的 `~/.gitconfig`），重设即可：

```bash
git config --global core.hooksPath .githooks
```

### 宿主机 `git commit` 报 `No module named pre_commit`

旧版 `post-create.sh` 用 `pre-commit install` 把容器内的解释器路径写进了宿主机 `.git/hooks`（随 bind mount 落盘）。钩子如今由 `.githooks/` 接管，清掉残留即可（`pre-commit uninstall` 只删除 pre-commit 自己写入的脚本，并会还原 `*.legacy`）：

```bash
pre-commit uninstall -t pre-commit -t commit-msg
```

### git commit 报 `Failed to connect to 127.0.0.1:7897`

VS Code 默认把**客户端**（Windows/macOS）的 `~/.gitconfig` 复制进容器（`dev.containers.copyGitConfig`）。若客户端配了本地代理（如 Clash 的 `http.proxy=http://127.0.0.1:7897`），而容器以 `--network host` 共享**虚机**的网络，该地址指向虚机自身而非客户端，pre-commit 拉取 hook 仓库时就会连接被拒。

`post-create.sh` 会探测这个代理是否可达，不可达时自动清理 `http.proxy` / `https.proxy`。手工处理：

```bash
git config --global --unset http.proxy && git config --global --unset https.proxy
```

若确实需要代理（例如 hooks 走 GitHub），请把容器内的代理地址改成**虚机可达**的地址（如客户端的局域网 IP），而不是 `127.0.0.1`。

### `bash: warning: setlocale: LC_ALL: cannot change locale (en_US.UTF-8)`

slim 镜像只带 `C` / `C.UTF-8`，该告警表示 bash 找不到 `en_US.UTF-8`，不影响提交。忽略即可，或在容器内改用可用 locale：

```bash
export LC_ALL=C.UTF-8
```

### Debian 软件源缓慢或连接失败

镜像构建已默认切换到国内镜像源，并在镜像不可达时自动回退到 `deb.debian.org`。如需更换，修改 `devcontainer.json` 的 `build.args.APT_MIRROR` 后 Rebuild Container 即可。

### 后端服务不可用

确保后端（agentd / witty-service）运行在宿主机上，默认监听 `127.0.0.1:8000`。

验证容器到宿主机服务的连通性：

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8000/healthz
```

## 配置说明

- **Node.js 24**：与 CI（`release.yml`）保持一致
- **pnpm 11.17.0**：版本写死在 Dockerfile，与 CI 一致；构建阶段预热到 `COREPACK_HOME`，首次安装不再联网下载 pnpm
- **pre-commit**：构建阶段预装（不注册钩子），驱动仓库自带的 `.githooks/` 提交钩子（检查项见 `.pre-commit-config.yaml`）
- **Go**：随系统包安装，供 gitleaks 钩子（`language: golang`）构建，`GOPROXY` 默认走国内源
- **ESLint Flat Config**：通过 `eslint.useFlatConfig: true` 启用
- **apt / npm / PyPI 镜像源**：见上文「镜像源配置」，可通过 `build.args` 覆盖

## 更多信息

- [VS Code Dev Containers 文档](https://code.visualstudio.com/docs/devcontainers/containers)
- [Dev Container Features 参考](https://containers.dev/features)
- [PolyMind 项目 README](../README.md)
