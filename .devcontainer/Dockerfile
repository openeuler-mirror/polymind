FROM node:24-slim

# 镜像源，默认值适用于国内网络，可通过 --build-arg 覆盖（见 devcontainer.json 的 build.args）
#   APT_MIRROR   Debian 源地址，含协议、不带结尾斜杠；置空则保持上游源。
#   NPM_REGISTRY npm/pnpm/corepack 源地址
#   PIP_INDEX_URL PyPI 源地址，用于预装 pre-commit；会以环境变量形式传入容器
#   GO_VERSION    Go 工具链版本（gitleaks 钩子用）
#   GO_MIRROR     Go tarball 下载镜像
# 另有 GOPROXY（Go 模块代理，国内默认 goproxy.cn）以 ENV 固化，供 gitleaks 钩子构建使用
ARG APT_MIRROR=http://mirrors.huaweicloud.com
ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
ARG GO_VERSION=1.26.8
ARG GO_MIRROR=https://mirrors.aliyun.com/golang

ENV DEBIAN_FRONTEND=noninteractive \
    NEXT_TELEMETRY_DISABLED=1 \
    npm_config_registry=${NPM_REGISTRY} \
    COREPACK_NPM_REGISTRY=${NPM_REGISTRY} \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    COREPACK_HOME=/opt/corepack \
    PIP_INDEX_URL=${PIP_INDEX_URL} \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    GOPROXY=https://goproxy.cn,direct

# 1. 切换 apt 源并安装系统包；镜像不可达时自动回退到 deb.debian.org，不中断构建
#    locales 用于生成 en_US.UTF-8：VS Code 内置 Git 扩展对每个 git 子进程强制注入
#    LC_ALL/LANG=en_US.UTF-8（优先级高于容器环境变量，容器侧无法覆盖），镜像里若
#    没有该 locale，仓库钩子（#!/bin/bash）启动时会打印 setlocale 警告
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    set -eux; \
    sources=/etc/apt/sources.list.d/debian.sources; \
    if [ -n "${APT_MIRROR}" ] && [ -f "$sources" ]; then \
      sed -i \
        -e "s#http://deb.debian.org/debian-security#${APT_MIRROR}/debian-security#g" \
        -e "s#http://deb.debian.org/debian#${APT_MIRROR}/debian#g" \
        "$sources"; \
    fi; \
    if ! apt-get update -o Acquire::Retries=3 -o Acquire::http::Timeout=30; then \
      echo "[devcontainer] WARN: ${APT_MIRROR} unreachable, reverting to deb.debian.org"; \
      sed -i -e "s#${APT_MIRROR}#http://deb.debian.org#g" "$sources"; \
      apt-get update -o Acquire::Retries=3 -o Acquire::http::Timeout=30; \
    fi; \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        git \
        curl \
        sudo \
        python3 \
        python3-pip \
        build-essential \
        locales; \
    echo "en_US.UTF-8 UTF-8" > /etc/locale.gen; \
    locale-gen; \
    rm -rf /var/lib/apt/lists/*

# 2. 安装官方 Go 工具链到 /usr/local/go（gitleaks 钩子需要 ≥1.21 才能解析其 go.mod 的
#    `go 1.23.0`/`toolchain` 指令；Debian 源的 golang 仅 1.19，故不用 apt 安装）。
#    符号链接放 /usr/local/bin（PATH 中先于 /usr/bin），对 root 与 node 用户均生效
RUN curl -fsSL "${GO_MIRROR}/go${GO_VERSION}.linux-amd64.tar.gz" -o /tmp/go.tgz \
    && tar -C /usr/local -xzf /tmp/go.tgz \
    && rm /tmp/go.tgz \
    && ln -sf /usr/local/go/bin/go /usr/local/bin/go \
    && ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt \
    && go version

# 3. 预装 pre-commit（Git 提交钩子执行器）。只装本体，**不执行 `pre-commit install`**：后者会覆写
#    bind-mount 进容器的宿主机 .git/hooks。钩子由仓库 tracked 的 .githooks/ 提供；
#    上一步的 Go 工具链 + GOPROXY 供 gitleaks 钩子（language: golang）构建使用
RUN pip install --no-cache-dir --break-system-packages pre-commit \
    && pre-commit --version

# 4. 预建命名卷的挂载点。Docker 用镜像目录的属主初始化新卷，以 node 身份创建可避免
#    root 属主卷导致 pnpm install 报 EACCES（旧卷由 post-create.sh 修复）
RUN mkdir -p /home/node/.local/share/pnpm /workspaces/polymind/node_modules \
    && chown -R node:node /home/node /workspaces

# 5. node 用户免密 sudo
RUN printf 'node ALL=(ALL) NOPASSWD:ALL\n' > /etc/sudoers.d/node \
    && chmod 0440 /etc/sudoers.d/node

# 6. 写入用户级 .npmrc 指定 npm 源（pnpm 不读 npm_config_registry 环境变量）
RUN printf 'registry=%s\n' "${NPM_REGISTRY}" > /home/node/.npmrc \
    && chown node:node /home/node/.npmrc

# 7. 构建阶段预装 pnpm，避免首次 pnpm install 再联网下载 pnpm 自身
#    版本需与 package.json 的 packageManager 保持一致
RUN corepack enable pnpm \
    && corepack install -g "pnpm@11.17.0" \
    && chown -R node:node "${COREPACK_HOME}"
