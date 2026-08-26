#!/usr/bin/env bash
# ============================================================
# PolyMind 一键安装脚本 (Linux)
# 负责依赖检测、环境隔离和所有软件包的安装
# 安装完成后请使用 start.sh 启动服务
# ============================================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ---------- helper ----------
log_info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_err()   { echo -e "${RED}[ERR]${NC}   $*"; }
log_step()  { echo -e "${DIM}[..]${NC}  $*"; }
log_detail(){ echo -e "      $*"; }

section() {
  echo ""
  echo -e "${BOLD}============================================${NC}"
  echo -e "${BOLD}  $*${NC}"
  echo -e "${BOLD}============================================${NC}"
}

banner() {
  echo ""
  echo -e "${BOLD}  PolyMind 一键安装${NC}"
  echo ""
}

# ---------- config ----------
POLYMIND_DIR="$HOME/.polymind"
ENV_FILE="$POLYMIND_DIR/.env"
PROFILE_FILE="$POLYMIND_DIR/.profile"
INSTALL_LOG="$POLYMIND_DIR/install.log"

# 最低版本要求
REQUIRED_NODE_MAJOR=22
REQUIRED_PNPM_MAJOR=11
REQUIRED_PYTHON_MINOR=11

# 默认镜像源
DEFAULT_PNPM_MIRROR="https://mirrors.huaweicloud.com/repository/npm/"
DEFAULT_PIP_MIRROR="https://repo.huaweicloud.com/repository/pypi/simple"

# Docker 配置
DEFAULT_DOCKER_REGISTRY_MIRRORS=(
  "https://ghcr.1ms.run"
  "https://ghcr.nju.edu.cn"
)
DOCKER_DAEMON_CONFIG="/etc/docker/daemon.json"

# OpenCode 版本
REQUIRED_OPENCODE_VERSION="1.17.20"

# Docker 镜像
DOCKER_IMAGE_BASE="ghcr.io/openwitty/witty-agent-server"
DOCKER_IMAGE_TAGS=("openclaw" "opencode")

# ---------- 命令行参数 ----------
ARG_VERBOSE=false
ARG_PNPM_MIRROR=""
ARG_PIP_MIRROR=""

usage() {
  echo "用法: $0 [OPTIONS]"
  echo ""
  echo "选项:"
  echo "  --pnpm-mirror URL  自定义 pnpm 镜像地址"
  echo "  --pip-mirror URL   自定义 pip 镜像地址"
  echo "  --verbose          显示详细输出"
  echo "  -h, --help         显示此帮助信息"
  echo ""
  echo "示例:"
  echo "  $0                                    # 默认安装（使用国内镜像）"
  exit 0
}

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --pnpm-mirror)      ARG_PNPM_MIRROR="$2"; shift ;;
      --pip-mirror)       ARG_PIP_MIRROR="$2"; shift ;;
      --verbose)          ARG_VERBOSE=true ;;
      -h|--help)          usage ;;
      *)
        log_err "未知参数: $1"
        usage
        ;;
    esac
    shift
  done
}

parse_args "$@"

# ---------- 工具函数 ----------

extract_version() {
  local raw="$1"
  echo "$raw" | grep -oP '\d+\.\d+\.\d+' 2>/dev/null | head -1 || echo "$raw" | grep -oP '\d+\.\d+' 2>/dev/null | head -1 || echo "0.0.0"
}

extract_major_version() {
  extract_version "$1" | cut -d'.' -f1
}

extract_minor_version() {
  extract_version "$1" | cut -d'.' -f2
}

version_gte() {
  local v1 v2
  v1=$(extract_version "$1")
  v2="$2"
  if [ "$v1" = "0.0.0" ]; then
    return 1
  fi
  local oldest
  oldest=$(printf '%s\n%s\n' "$v2" "$v1" | sort -V | head -1)
  [ "$oldest" = "$v2" ]
}

get_os() {
  case "$(uname -s)" in
    Linux*)  echo "linux" ;;
    *)       echo "unknown" ;;
  esac
}

get_arch() {
  uname -m
}

# 验证命令可执行
verify_cmd() {
  local cmd=$1
  local name=$2
  if command -v "$cmd" &> /dev/null; then
    log_ok "$name: $(command -v "$cmd")"
    return 0
  else
    log_err "$name 验证失败: 命令不可执行"
    return 1
  fi
}

# ---------- Phase 0: 系统环境探测 ----------
run_phase_0() {
  section "0/4  系统环境探测"

  local os arch
  os=$(get_os)
  arch=$(get_arch)

  log_info "操作系统: $os"
  log_info "架构: $arch"

  if [ "$os" = "unknown" ]; then
    log_err "不支持的操作系统: $(uname -s)"
    exit 1
  fi

  log_info "安装目录: $POLYMIND_DIR"

  mkdir -p "$POLYMIND_DIR"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] PolyMind 安装开始" > "$INSTALL_LOG"
}

# ---------- 镜像源配置 ----------
setup_mirror() {
  PNPM_MIRROR="$DEFAULT_PNPM_MIRROR"
  PIP_MIRROR="$DEFAULT_PIP_MIRROR"

  if [ -n "$ARG_PNPM_MIRROR" ]; then
    PNPM_MIRROR="$ARG_PNPM_MIRROR"
  fi

  if [ -n "$ARG_PIP_MIRROR" ]; then
    PIP_MIRROR="$ARG_PIP_MIRROR"
  fi

  log_info "pnpm 镜像: $PNPM_MIRROR"
  log_info "pip 镜像:  $PIP_MIRROR"
}

# ---------- Phase 1: 运行时依赖安装 ----------
install_node() {
  log_step "安装 Node.js $REQUIRED_NODE_MAJOR LTS (通过 nvm 隔离)..."

  local nvm_dir="$POLYMIND_DIR/nvm"
  export NVM_DIR="$nvm_dir"

  if [ -s "$nvm_dir/nvm.sh" ]; then
    log_info "nvm 已存在，跳过nvm安装"
  else
    if ! command -v git &> /dev/null; then
      log_err "未找到 git，请先安装: apt install git / yum install git"
      return 1
    fi

    log_step "下载 nvm..."

    mkdir -p "$nvm_dir"

    local nvm_installed=false

    log_detail "尝试: Gitee 镜像"
    if git clone --depth 1 "https://gitee.com/mirrors/nvm" "$nvm_dir" 2>> "$INSTALL_LOG"; then
      nvm_installed=true
    fi

    if ! $nvm_installed; then
      log_detail "尝试: GitHub 官方"
      if git clone --depth 1 "https://github.com/nvm-sh/nvm.git" "$nvm_dir" 2>> "$INSTALL_LOG"; then
        nvm_installed=true
      fi
    fi

    if ! $nvm_installed; then
      log_err "nvm 下载失败，所有源均不可达"
      log_info "请手动安装 Node.js >= ${REQUIRED_NODE_MAJOR}"
      log_info "  nvm: https://github.com/nvm-sh/nvm"
      log_info "  或设置代理后重试: export https_proxy=http://proxy:port && bash install.sh"
      return 1
    fi
  fi

  export NVM_NODEJS_ORG_MIRROR="https://npmmirror.com/mirrors/node"
  [ -s "$nvm_dir/nvm.sh" ] && . "$nvm_dir/nvm.sh"

  unset npm_config_prefix

  log_step "安装 Node.js $REQUIRED_NODE_MAJOR LTS..."
  nvm install "$REQUIRED_NODE_MAJOR" 2>> "$INSTALL_LOG" || {
    log_err "Node.js 安装失败"
    return 1
  }
  nvm use "$REQUIRED_NODE_MAJOR" 2>> "$INSTALL_LOG"
  nvm alias default "$REQUIRED_NODE_MAJOR" 2>> "$INSTALL_LOG"

  local installed_version
  installed_version=$(node --version 2>&1)
  local major
  major=$(extract_major_version "$installed_version")
  if [ "$major" -ge "$REQUIRED_NODE_MAJOR" ] 2>/dev/null; then
    log_ok "Node.js ${installed_version} 安装成功"
    NODE_CMD="node"
    NPM_CMD="npm"
    return 0
  else
    log_err "Node.js 安装后版本检查失败"
    return 1
  fi
}

install_pnpm() {
  log_step "检查 pnpm (要求 >= ${REQUIRED_PNPM_MAJOR})..."

  export PNPM_HOME="$POLYMIND_DIR/pnpm"
  export npm_config_prefix="$POLYMIND_DIR/pnpm"
  mkdir -p "$PNPM_HOME/bin"

  local system_pnpm_ok=false

  if command -v pnpm &> /dev/null; then
    local existing_version major
    existing_version=$(pnpm --version 2>&1)
    major=$(extract_major_version "$existing_version")
    if [ "$major" -ge "$REQUIRED_PNPM_MAJOR" ] 2>/dev/null; then
      system_pnpm_ok=true
      log_ok "pnpm $existing_version (系统已有, 满足要求)"
    fi
  fi

  if $system_pnpm_ok; then
    if [ ! -x "$PNPM_HOME/bin/pnpm" ]; then
      ln -sf "$(command -v pnpm)" "$PNPM_HOME/bin/pnpm"
    fi
  else
    log_step "安装 pnpm 到隔离环境..."
    npm install -g pnpm --registry="$PNPM_MIRROR" --prefix "$PNPM_HOME" 2>> "$INSTALL_LOG" || {
      log_err "pnpm 安装失败"
      return 1
    }
  fi

  export PATH="$PNPM_HOME/bin:$PATH"

  if command -v pnpm &> /dev/null; then
    local installed_version
    installed_version=$(pnpm --version 2>&1)
    log_ok "pnpm ${installed_version} 隔离环境就绪"
    return 0
  else
    log_err "pnpm 安装后验证失败"
    return 1
  fi
}

install_python_and_pip() {
  log_step "检查 Python3 (要求 >= 3.${REQUIRED_PYTHON_MINOR})..."

  local found_python=false

  if command -v python3 &> /dev/null; then
    local v
    v=$(python3 --version 2>&1)
    local minor
    minor=$(extract_minor_version "$v")
    if [ "$minor" -ge "$REQUIRED_PYTHON_MINOR" ] 2>/dev/null; then
      PYTHON_CMD="python3"
      found_python=true
      log_ok "Python3 $v (将用于创建隔离 venv)"
    fi
  fi

  if ! $found_python && command -v python &> /dev/null; then
    local v
    v=$(python --version 2>&1)
    local minor
    minor=$(extract_minor_version "$v")
    if [ "$minor" -ge "$REQUIRED_PYTHON_MINOR" ] 2>/dev/null; then
      PYTHON_CMD="python"
      found_python=true
      log_ok "Python3 $v (将用于创建隔离 venv)"
    fi
  fi

  if ! $found_python; then
    log_err "未找到 Python >= 3.${REQUIRED_PYTHON_MINOR}"
    log_info "请先手动安装 Python >= 3.${REQUIRED_PYTHON_MINOR}"
    log_detail "Ubuntu/Debian: sudo apt install python3 python3-pip python3-venv"
    log_detail "CentOS/RHEL:  sudo dnf install python3 python3-pip"
    return 1
  fi

  log_step "检查 pip3..."
  if command -v pip3 &> /dev/null; then
    log_ok "pip3 已存在: $(pip3 --version 2>&1 | head -1)"
    PIP_CMD="pip3"
  elif command -v pip &> /dev/null; then
    log_ok "pip 已存在: $(pip --version 2>&1 | head -1)"
    PIP_CMD="pip"
  else
    log_step "安装 pip..."
    $PYTHON_CMD -m ensurepip --upgrade 2>> "$INSTALL_LOG" || {
      log_err "pip 安装失败"
      return 1
    }
    PIP_CMD="pip3"
    log_ok "pip 安装成功"
  fi

  return 0
}

# ---------- nginx 安装 ----------
install_nginx() {
  log_step "检查 nginx..."

  if command -v nginx &> /dev/null; then
    local nginx_ver
    nginx_ver=$(nginx -v 2>&1 | cut -d'/' -f2)
    log_ok "nginx ${nginx_ver} 已安装: $(command -v nginx)"
    NGINX_CMD="nginx"
    return 0
  fi

  log_warn "nginx 未安装，尝试自动安装..."

  if command -v apt-get &> /dev/null; then
    log_step "apt-get install nginx..."
    sudo apt-get update -qq && sudo apt-get install -y -qq nginx 2>> "$INSTALL_LOG" || {
      log_warn "apt-get 安装失败"
      return 2
    }
  elif command -v yum &> /dev/null; then
    log_step "yum install nginx..."
    sudo yum install -y nginx 2>> "$INSTALL_LOG" || {
      log_warn "yum 安装失败"
      return 2
    }
  elif command -v dnf &> /dev/null; then
    log_step "dnf install nginx..."
    sudo dnf install -y nginx 2>> "$INSTALL_LOG" || {
      log_warn "dnf 安装失败"
      return 2
    }
  else
    log_warn "未找到包管理器，无法自动安装 nginx"
    return 2
  fi

  if command -v nginx &> /dev/null; then
    log_ok "nginx 安装成功: $(nginx -v 2>&1 | cut -d'/' -f2)"
    NGINX_CMD="nginx"
    return 0
  else
    log_warn "nginx 安装后验证失败"
    return 2
  fi
}

setup_nginx() {
  local nginx_dir="$POLYMIND_DIR/nginx"
  mkdir -p "$nginx_dir"

  log_step "生成 nginx 配置模板..."

  cat > "$nginx_dir/nginx.conf.template" << 'NGINXEOF'
worker_processes auto;
error_log {{POLYMIND_DIR}}/nginx/error.log;
pid {{POLYMIND_DIR}}/nginx/nginx.pid;

events {
    worker_connections 1024;
}

http {
    default_type application/octet-stream;

    access_log {{POLYMIND_DIR}}/nginx/access.log;

    # 使用用户目录存放临时文件（避免非 root 运行时权限错误）
    client_body_temp_path {{POLYMIND_DIR}}/nginx/tmp/client_body;
    proxy_temp_path {{POLYMIND_DIR}}/nginx/tmp/proxy;
    fastcgi_temp_path {{POLYMIND_DIR}}/nginx/tmp/fastcgi;
    uwsgi_temp_path {{POLYMIND_DIR}}/nginx/tmp/uwsgi;
    scgi_temp_path {{POLYMIND_DIR}}/nginx/tmp/scgi;

    server {
        listen {{FRONTEND_PORT}};
        server_name _;

        # 健康检查端点
        location /health {
            return 200 "OK";
            add_header Content-Type text/plain;
        }

        # API 代理到后端（去掉 /api 前缀）
        # 处理 REST、SSE 流、WebSocket 升级
        location /api/ {
            proxy_pass http://127.0.0.1:{{BACKEND_PORT}}/;
            proxy_http_version 1.1;

            # WebSocket 支持
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";

            # 标准代理头
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # SSE 流支持（关键）
            proxy_buffering off;
            proxy_cache off;
            chunked_transfer_encoding on;

            # 长超时支持 SSE/WS
            proxy_read_timeout 86400s;
            proxy_send_timeout 86400s;
        }

        # 前端代理到 Next.js
        location / {
            proxy_pass http://127.0.0.1:{{NEXTJS_UPSTREAM_PORT}};
            proxy_http_version 1.1;

            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
NGINXEOF

  log_ok "nginx 配置模板已生成: $nginx_dir/nginx.conf.template"
}

# ---------- Docker 安装 ----------
install_docker() {
  log_step "检查 Docker..."

  if command -v docker &> /dev/null; then
    local docker_ver
    docker_ver=$(docker --version 2>&1 | cut -d' ' -f3 | tr -d ',')
    log_ok "Docker ${docker_ver} 已安装: $(command -v docker)"
    return 0
  fi

  log_warn "Docker 未安装，正在自动安装..."

  local docker_installed=false

  # ---------- 策略1: 包管理器安装（国内用户首选，不依赖外部URL） ----------
  if command -v dnf &> /dev/null; then
    # dnf 系 (openEuler / Fedora / RHEL 8+ / CentOS 8+)
    # 先尝试系统仓库中的 docker（openEuler 可能在 EPOL 中）
    log_step "尝试: dnf install docker (系统仓库)..."
    if sudo dnf install -y docker 2>> "$INSTALL_LOG"; then
      docker_installed=true
    else
      log_warn "系统仓库未找到 docker，尝试添加 Docker CE 仓库..."
      # 添加 Docker CE 官方仓库（使用阿里云镜像）
      if sudo dnf config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo 2>> "$INSTALL_LOG"; then
        log_step "尝试: dnf install docker-ce (Docker CE 仓库)..."
        sudo dnf install -y docker-ce 2>> "$INSTALL_LOG" && docker_installed=true
      fi
      # 如果 dnf config-manager 不存在，直接用 curl + tee
      if ! $docker_installed; then
        log_step "尝试: 手动添加 Docker CE 仓库并安装..."
        sudo tee /etc/yum.repos.d/docker-ce.repo > /dev/null << 'DOCKERCEREPO'
[docker-ce-stable]
name=Docker CE Stable
baseurl=https://mirrors.aliyun.com/docker-ce/linux/centos/$releasever/$basearch/stable
enabled=1
gpgcheck=1
gpgkey=https://mirrors.aliyun.com/docker-ce/linux/centos/gpg
DOCKERCEREPO
        sudo dnf install -y docker-ce 2>> "$INSTALL_LOG" && docker_installed=true
      fi
    fi

  elif command -v yum &> /dev/null; then
    # yum 系 (RHEL 7 / CentOS 7)
    log_step "尝试: yum install docker (系统仓库)..."
    if sudo yum install -y docker 2>> "$INSTALL_LOG"; then
      docker_installed=true
    else
      log_warn "系统仓库未找到 docker，尝试添加 Docker CE 仓库..."
      sudo yum-config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo 2>> "$INSTALL_LOG" || true
      if [ ! -f /etc/yum.repos.d/docker-ce.repo ]; then
        sudo tee /etc/yum.repos.d/docker-ce.repo > /dev/null << 'DOCKERCEREPO'
[docker-ce-stable]
name=Docker CE Stable
baseurl=https://mirrors.aliyun.com/docker-ce/linux/centos/$releasever/$basearch/stable
enabled=1
gpgcheck=1
gpgkey=https://mirrors.aliyun.com/docker-ce/linux/centos/gpg
DOCKERCEREPO
      fi
      log_step "尝试: yum install docker-ce..."
      sudo yum install -y docker-ce 2>> "$INSTALL_LOG" && docker_installed=true
    fi

  elif command -v apt-get &> /dev/null; then
    # apt 系 (Debian / Ubuntu)
    log_step "尝试: apt-get install docker.io..."
    if sudo apt-get update -qq && sudo apt-get install -y -qq docker.io 2>> "$INSTALL_LOG"; then
      docker_installed=true
    else
      # 尝试 Docker CE
      log_warn "docker.io 安装失败，尝试添加 Docker CE 仓库..."
      if command -v curl &> /dev/null; then
        curl -fsSL --connect-timeout 10 --max-time 30 https://mirrors.aliyun.com/docker-ce/linux/ubuntu/gpg | sudo apt-key add - 2>> "$INSTALL_LOG" || true
        sudo add-apt-repository "deb [arch=$(dpkg --print-architecture)] https://mirrors.aliyun.com/docker-ce/linux/ubuntu $(lsb_release -cs 2>/dev/null || echo 'stable') stable" 2>> "$INSTALL_LOG" || true
        sudo apt-get update -qq && sudo apt-get install -y -qq docker-ce 2>> "$INSTALL_LOG" && docker_installed=true
      fi
    fi
  fi

  # ---------- 策略2: 官方便捷脚本（兜底，尝试验证性降级） ----------
  if ! $docker_installed && ! command -v docker &> /dev/null; then
    if command -v curl &> /dev/null; then
      log_step "包管理器均失败，尝试: Docker 官方便捷脚本..."
      # 使用 --connect-timeout 和 --max-time 避免长时间卡死
      if curl -fsSL --connect-timeout 10 --max-time 120 https://get.docker.com 2>> "$INSTALL_LOG" | sh -s docker --mirror Aliyun 2>> "$INSTALL_LOG"; then
        docker_installed=true
      else
        log_warn "官方便捷脚本执行失败（网络不可达或脚本错误）"
      fi
    fi
  fi

  # ---------- 安装后验证 ----------
  if command -v docker &> /dev/null; then
    local installed_version
    installed_version=$(docker --version 2>&1 | cut -d' ' -f3 | tr -d ',')
    log_ok "Docker ${installed_version} 安装成功"
    return 0
  else
    log_err "Docker 安装失败：所有安装策略均未成功"
    log_info "请手动安装 Docker:"
    log_info "  RHEL/CentOS/openEuler: sudo dnf install -y docker"
    log_info "  或访问: https://docs.docker.com/engine/install/"
    return 1
  fi
}

# ---------- Docker 配置 ----------
configure_docker() {
  log_step "配置 Docker..."

  # 配置 registry-mirrors（国内镜像加速器）
  if [ -f "$DOCKER_DAEMON_CONFIG" ]; then
    log_info "daemon.json 已存在，跳过覆盖（如需更新请手动编辑: $DOCKER_DAEMON_CONFIG）"
  else
    log_step "写入镜像加速器配置..."

    sudo mkdir -p "$(dirname "$DOCKER_DAEMON_CONFIG")"

    # 构建 mirrors JSON 数组
    local mirrors_json=""
    for mirror in "${DEFAULT_DOCKER_REGISTRY_MIRRORS[@]}"; do
      if [ -n "$mirrors_json" ]; then
        mirrors_json+=",
    "
      fi
      mirrors_json+="    \"$mirror\""
    done

    sudo tee "$DOCKER_DAEMON_CONFIG" > /dev/null << DOCKEREOF
{
  "registry-mirrors": [
${mirrors_json}
  ],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
DOCKEREOF
    log_ok "镜像加速器已配置: $DOCKER_DAEMON_CONFIG"
  fi

  # 将当前用户加入 docker 组
  if ! groups "$USER" 2>/dev/null | grep -q docker; then
    log_step "将用户 $USER 加入 docker 组..."
    sudo groupadd -f docker 2>> "$INSTALL_LOG" || true
    if sudo usermod -aG docker "$USER" 2>> "$INSTALL_LOG"; then
      log_warn "已将当前用户加入 docker 组（需重新登录终端或执行 newgrp docker 后生效）"
    else
      log_warn "将用户 $USER 加入 docker 组失败，请手动执行: sudo usermod -aG docker $USER"
    fi
  else
    log_info "用户已在 docker 组中，跳过"
  fi

  # 启动 Docker 守护进程
  log_step "启动 Docker 服务..."
  if command -v systemctl &> /dev/null; then
    sudo systemctl enable docker 2>> "$INSTALL_LOG" || true
    sudo systemctl start docker 2>> "$INSTALL_LOG" || {
      log_err "Docker 服务启动失败 (systemctl)"
      return 1
    }
  elif command -v service &> /dev/null; then
    sudo service docker start 2>> "$INSTALL_LOG" || {
      log_err "Docker 服务启动失败 (service)"
      return 1
    }
  else
    log_err "无法启动 Docker 服务（未找到 systemctl 或 service）"
    return 1
  fi

  # 等待 Docker 守护进程就绪
  log_step "等待 Docker 守护进程就绪..."
  local max_wait=30
  local waited=0
  while ! sudo docker info &> /dev/null; do
    sleep 1
    waited=$((waited + 1))
    if [ "$waited" -ge "$max_wait" ]; then
      log_err "Docker 守护进程启动超时 (${max_wait}s)"
      return 1
    fi
  done

  log_ok "Docker 服务已启动并正常运行"

  # 校验当前会话能否直接访问 Docker（组成员变更需重新登录/newgrp 才生效）
  if docker info &> /dev/null; then
    log_ok "当前用户可直接使用 Docker"
  else
    log_warn "Docker 守护进程已启动，但当前会话无访问权限"
    log_warn "请重新登录终端或执行: newgrp docker"
    log_warn "然后运行: bash start.sh"
  fi
}

# ---------- Docker 镜像预拉取 ----------
pull_docker_images() {
  log_step "预拉取 Docker 镜像..."

  local pull_failed=0

  for tag in "${DOCKER_IMAGE_TAGS[@]}"; do
    local image="${DOCKER_IMAGE_BASE}:${tag}"
    log_detail "拉取: $image"

    if sudo docker pull "$image" 2>> "$INSTALL_LOG"; then
      log_ok "$image 拉取成功"
    else
      log_err "$image 拉取失败"
      pull_failed=$((pull_failed + 1))
    fi
  done

  if [ "$pull_failed" -gt 0 ]; then
    log_err "共 $pull_failed 个镜像拉取失败，请检查网络或 Docker 配置"
    return 1
  fi

  log_ok "所有 Docker 镜像拉取完成"
}

# ---------- Phase 2: 环境隔离初始化 ----------
setup_isolation() {
  section "2/4  环境隔离初始化"

  mkdir -p "$POLYMIND_DIR/bin"

  local venv_dir="$POLYMIND_DIR/python/venv"

  log_step "创建 Python 虚拟环境: $venv_dir"
  if [ ! -d "$venv_dir" ]; then
    $PYTHON_CMD -m venv "$venv_dir" 2>> "$INSTALL_LOG" || {
      log_err "Python 虚拟环境创建失败"
      return 1
    }
  else
    log_info "虚拟环境已存在，跳过创建"
  fi

  local site_packages
  site_packages=$(find "$venv_dir" -type d -name "site-packages" 2>/dev/null | head -1)
  if [ -n "$site_packages" ]; then
    log_ok "Python 虚拟环境就绪"
  else
    log_err "Python 虚拟环境异常"
    return 1
  fi

  PYTHON_BIN_DIR="$venv_dir/bin"
  PIP_ACTIVE="$venv_dir/bin/pip"

  log_step "生成环境配置文件..."

  cat > "$PROFILE_FILE" << 'ENVEOF'
export POLYMIND_DIR="$HOME/.polymind"
export NVM_DIR="$POLYMIND_DIR/nvm"
export PNPM_HOME="$POLYMIND_DIR/pnpm"

_POLYMIND_SYSTEM_PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

_polymind_activate() {
  unset npm_config_prefix
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" 2>/dev/null
  export npm_config_prefix="$POLYMIND_DIR/pnpm"
  export PATH="$POLYMIND_DIR/bin:$PNPM_HOME/bin:$PATH"
  export PATH="$PATH:$_POLYMIND_SYSTEM_PATH"
ENVEOF

  if [ -n "$PYTHON_BIN_DIR" ]; then
    echo "  export PATH=\"$venv_dir/bin:\$PATH\"" >> "$PROFILE_FILE"
  fi

  cat >> "$PROFILE_FILE" << 'ENVEOF'
}

_polymind_deactivate() {
  unset POLYMIND_DIR
  unset NVM_DIR
  unset PNPM_HOME
  unset npm_config_prefix
}

_polymind_activate

ENVEOF

  log_ok "环境配置文件已生成: $PROFILE_FILE"
}

# ---------- Phase 3: 应用包安装 ----------
run_with_log() {
  local log_file="$1"
  shift
  tail -n 0 -f "$log_file" 2>/dev/null &
  local tail_pid=$!
  "$@" >> "$log_file" 2>&1
  local ec=$?
  sleep 0.5
  kill $tail_pid 2>/dev/null || true
  wait $tail_pid 2>/dev/null || true
  return $ec
}

# ---------- OpenCode CLI 安装 ----------
install_opencode_cli() {
  log_step "安装 opencode-ai ..."

  # pnpm 11 默认拦截依赖的 postinstall 脚本（allowBuilds），
  # opencode-ai 的原生二进制正是由 postinstall 生成，必须显式放行。
  run_with_log "$INSTALL_LOG" pnpm add -g --allow-build=opencode-ai "opencode-ai@${REQUIRED_OPENCODE_VERSION}" --registry="$PNPM_MIRROR" || {
    log_err "opencode-ai 安装失败"
    return 1
  }

  local installed_ver
  installed_ver=$(opencode --version 2>&1)
  if [ "$installed_ver" = "$REQUIRED_OPENCODE_VERSION" ]; then
    log_ok "opencode-ai ${installed_ver} 安装完成（含原生二进制）"
  else
    log_err "opencode-ai 安装异常: 期望 ${REQUIRED_OPENCODE_VERSION}, 实际 ${installed_ver}"
    log_info "postinstall 可能未执行，可手动修复: pnpm add -g --allow-build=opencode-ai opencode-ai@${REQUIRED_OPENCODE_VERSION}"
    return 1
  fi
}

install_app_packages() {
  section "3/4  应用包安装"

  local _saved_path="$PATH"
  source "$PROFILE_FILE"
  export PATH="$PATH:$_saved_path"
  export npm_config_prefix="$POLYMIND_DIR/pnpm"

  log_step "安装 polymind (前端)..."

  run_with_log "$INSTALL_LOG" pnpm add -g polymind@1.1.5 --registry="$PNPM_MIRROR" || {
    log_err "polymind 安装失败"
    return 1
  }

  log_ok "polymind 安装完成"

  log_step "安装 witty-service (后端)..."

  run_with_log "$INSTALL_LOG" $PIP_ACTIVE install witty-service==0.10.1  -i "$PIP_MIRROR" --trusted-host "$(echo "$PIP_MIRROR" | awk -F/ '{print $3}')" || {
    log_err "witty-service 安装失败"
    return 1
  }

  log_ok "witty-service 安装完成"

  log_step "安装 openclaw ..."

  run_with_log "$INSTALL_LOG" pnpm add -g "openclaw@2026.6.10" --registry="$PNPM_MIRROR" || {
    log_err "openclaw 安装失败"
    return 1
  }

  log_ok "openclaw 安装完成"

  install_opencode_cli || {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: opencode-ai 安装失败" >> "$INSTALL_LOG"
    return 1
  }
}

# ---------- Phase 4: 安装验证 ----------
verify_installation() {
  section "4/4  安装验证"

  local _saved_path="$PATH"
  source "$PROFILE_FILE" 2>/dev/null || true
  export PATH="$PATH:$_saved_path"

  local errors=0

  echo ""

  # Node.js
  if command -v node &> /dev/null; then
    local v
    v=$(node --version 2>&1)
    log_ok "Node.js    ${v}"
  else
    log_err "Node.js    未找到"
    errors=$((errors + 1))
  fi

  # pnpm
  if command -v pnpm &> /dev/null; then
    local v
    v=$(pnpm --version 2>&1)
    log_ok "pnpm       ${v}"
  else
    log_err "pnpm       未找到"
    errors=$((errors + 1))
  fi

  # Python3
  if command -v python3 &> /dev/null; then
    local v
    v=$(python3 --version 2>&1)
    log_ok "Python3    ${v#Python }"
  elif command -v python &> /dev/null; then
    local v
    v=$(python --version 2>&1)
    log_ok "Python3    ${v#Python }"
  else
    log_err "Python3    未找到"
    errors=$((errors + 1))
  fi

  # pip
  if command -v pip3 &> /dev/null; then
    local v
    v=$(pip3 --version 2>&1 | head -1)
    log_ok "pip        ${v}"
  elif command -v pip &> /dev/null; then
    local v
    v=$(pip --version 2>&1 | head -1)
    log_ok "pip        ${v}"
  else
    log_err "pip        未找到"
    errors=$((errors + 1))
  fi

  # polymind
  if command -v polymind &> /dev/null; then
    log_ok "polymind   $(command -v polymind)"
  else
    log_err "polymind   未找到"
    errors=$((errors + 1))
  fi

  # witty-service
  if command -v witty-service &> /dev/null; then
    log_ok "witty-svc  $(command -v witty-service)"
  else
    log_err "witty-svc  未找到"
    errors=$((errors + 1))
  fi

  # openclaw
  if command -v openclaw &> /dev/null; then
    log_ok "openclaw   $(command -v openclaw)"
  else
    log_err "openclaw   未找到"
    errors=$((errors + 1))
  fi

  # opencode
  if command -v opencode &> /dev/null; then
    log_ok "opencode   $(command -v opencode)"
  else
    log_err "opencode   未找到"
    errors=$((errors + 1))
  fi

  # Docker
  if command -v docker &> /dev/null; then
    local docker_ver
    docker_ver=$(docker --version 2>&1 | cut -d' ' -f3 | tr -d ',')
    log_ok "Docker     ${docker_ver}"
  else
    log_err "Docker     未找到"
    errors=$((errors + 1))
  fi

  # nginx
  if command -v nginx &> /dev/null; then
    local nginx_ver
    nginx_ver=$(nginx -v 2>&1 | cut -d'/' -f2)
    log_ok "nginx      ${nginx_ver}（反向代理）"
  else
    log_err "nginx      未找到"
    errors=$((errors + 1))
  fi

  echo ""

  if [ "$errors" -eq 0 ]; then
    return 0
  else
    log_err "共 $errors 项验证失败，请检查日志: $INSTALL_LOG"
    return 1
  fi
}

# ---------- 输出安装摘要 ----------
print_summary() {
  echo ""
  echo -e "${GREEN}${BOLD}============================================${NC}"
  echo -e "${GREEN}${BOLD}  PolyMind 安装完成!${NC}"
  echo -e "${GREEN}${BOLD}============================================${NC}"
  echo ""
  echo -e "  安装目录:  ${BOLD}$POLYMIND_DIR${NC}"
  echo -e "  环境配置:  ${BOLD}$PROFILE_FILE${NC}"
  echo -e "  应用配置:  ${BOLD}$ENV_FILE${NC}"
  echo -e "  安装日志:  ${BOLD}$INSTALL_LOG${NC}"
  echo ""
  echo -e "  启动服务:  ${BOLD}bash start.sh${NC}"
  echo ""
  echo -e "  手动激活环境:"
  echo -e "    ${DIM}source $PROFILE_FILE${NC}"
  echo ""
  if command -v docker &> /dev/null && ! docker info &> /dev/null; then
    echo -e "  ${YELLOW}${BOLD}⚠ Docker 用户组:${NC}"
    echo -e "    Docker 守护进程已启动，但当前会话无访问权限"
    echo -e "    请重新登录终端使其生效，或执行: ${BOLD}newgrp docker${NC}"
    echo -e "    然后运行: ${BOLD}bash start.sh${NC}"
    echo ""
  fi
}

# ---------- main ----------
main() {
  banner

  # Phase 0
  run_phase_0

  # 镜像策略
  setup_mirror

  # Phase 1
  section "1/4  运行时依赖安装"

  install_node || {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: Node.js 安装失败" >> "$INSTALL_LOG"
    exit 1
  }

  install_pnpm || {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: pnpm 安装失败" >> "$INSTALL_LOG"
    exit 1
  }

  install_python_and_pip || {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: Python/pip 安装失败" >> "$INSTALL_LOG"
    exit 1
  }

  # nginx 安装（必须）
  install_nginx || {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: nginx 安装失败" >> "$INSTALL_LOG"
    log_err "nginx 安装失败，PolyMind 需要 nginx 作为反向代理"
    log_info "请手动安装 nginx 后重新运行 install.sh"
    exit 1
  }

  # 生成 nginx 配置模板
  setup_nginx

  # Docker 安装（必须）
  install_docker || {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: Docker 安装失败" >> "$INSTALL_LOG"
    log_err "Docker 安装失败，PolyMind 需要 Docker 作为沙箱运行时"
    log_info "请手动安装 Docker 后重新运行 install.sh"
    exit 1
  }

  # Docker 配置（镜像加速、用户组、守护进程）
  configure_docker || {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: Docker 配置失败" >> "$INSTALL_LOG"
    exit 1
  }

  # 预拉取沙箱镜像
  pull_docker_images || {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: Docker 镜像拉取失败" >> "$INSTALL_LOG"
    exit 1
  }

  # Phase 2
  setup_isolation || {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: 环境隔离初始化失败" >> "$INSTALL_LOG"
    exit 1
  }

  # Phase 3
  install_app_packages || {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: 应用包安装失败" >> "$INSTALL_LOG"
    exit 1
  }

  # Phase 4
  verify_installation || {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: 安装验证失败" >> "$INSTALL_LOG"
    exit 1
  }

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] PolyMind 安装成功" >> "$INSTALL_LOG"

  print_summary
}

main
