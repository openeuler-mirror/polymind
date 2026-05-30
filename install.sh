#!/usr/bin/env bash
# ============================================================
# PolyMind 一键安装 & 启动脚本 (Linux / macOS)
# ============================================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ---------- helper ----------
log_info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_err()   { echo -e "${RED}[ERR]${NC}   $*"; }

section() {
  echo ""
  echo -e "${BOLD}============================================${NC}"
  echo -e "${BOLD}  $*${NC}"
  echo -e "${BOLD}============================================${NC}"
}

# ---------- check deps ----------
section "1/5  环境检测"

check_cmd() {
  if command -v "$1" &> /dev/null; then
    log_ok "$1 ($($1 --version 2>&1 | head -1))"
    return 0
  else
    log_err "$1 未安装"
    return 1
  fi
}

MISSING=0

check_cmd node   || MISSING=1
check_cmd npm    || MISSING=1
check_cmd python3 || check_cmd python || MISSING=1
check_cmd pip3   || check_cmd pip   || MISSING=1

if [ "$MISSING" -eq 1 ]; then
  echo ""
  log_err "请先安装缺少的依赖后重新运行本脚本"
  echo "  Node.js: https://nodejs.org/"
  echo "  Python:  https://www.python.org/downloads/"
  exit 1
fi

# ---------- mirror ----------
section "2/5  镜像源"

echo ""
echo "  检测到国内网络环境, 推荐使用国内镜像加速"
echo ""
read -r -p "  是否使用国内镜像源? [Y/n] " MIRROR_CHOICE
MIRROR_CHOICE=${MIRROR_CHOICE:-y}

USE_MIRROR=false
case "$MIRROR_CHOICE" in
  [yY]|[yY][eE][sS]|是)
    USE_MIRROR=true
    NPM_MIRROR="https://registry.npmmirror.com"
    PIP_MIRROR="https://repo.huaweicloud.com/repository/pypi/simple"
    log_info "npm 镜像:  $NPM_MIRROR"
    log_info "pip 镜像:  $PIP_MIRROR"
    ;;
  *)
    log_info "使用官方源"
    ;;
esac

# ---------- install packages ----------
section "3/5  安装依赖包"

# --- npm: polymind ---
if $USE_MIRROR; then
  NPM_INSTALL_CMD="npm install -g polymind --registry=$NPM_MIRROR"
else
  NPM_INSTALL_CMD="npm install -g polymind"
fi

log_info "安装前端包 polymind ..."
$NPM_INSTALL_CMD
log_ok "polymind 安装完成"

# --- pip: witty-service ---
if command -v pip3 &> /dev/null; then
  PIP_CMD=pip3
else
  PIP_CMD=pip
fi

if $USE_MIRROR; then
  PIP_INSTALL_CMD="$PIP_CMD install witty-service -i $PIP_MIRROR --trusted-host pypi.tuna.tsinghua.edu.cn"
else
  PIP_INSTALL_CMD="$PIP_CMD install witty-service"
fi

log_info "安装后端包 witty-service ..."
$PIP_INSTALL_CMD
log_ok "witty-service 安装完成"

# ---------- config ----------
section "4/5  生成配置"

POLYMIND_DIR="$HOME/.polymind"
ENV_FILE="$POLYMIND_DIR/.env"

mkdir -p "$POLYMIND_DIR"

if [ -f "$ENV_FILE" ]; then
  log_warn "配置文件已存在, 跳过生成"
  log_info "如需重新生成, 请先删除: rm $ENV_FILE"
else
  cat > "$ENV_FILE" << 'ENVEOF'
# PolyMind 全局配置文件
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
ENVEOF
  log_ok "配置文件已生成: $ENV_FILE"
fi

# ---------- start services ----------
section "5/5  启动服务"

# 启动后端
log_info "启动后端 witty-service (端口 8000) ..."
witty-service --port 8000 &
BACKEND_PID=$!
sleep 2

if kill -0 "$BACKEND_PID" 2>/dev/null; then
  log_ok "后端已启动  PID=$BACKEND_PID  http://127.0.0.1:8000"
else
  log_err "后端启动失败, 请检查日志"
  exit 1
fi

# 启动前端
log_info "启动前端 polymind (端口 3000) ..."
echo ""
polymind --port 3000 &
FRONTEND_PID=$!
sleep 2

if kill -0 "$FRONTEND_PID" 2>/dev/null; then
  log_ok "前端已启动  PID=$FRONTEND_PID  http://localhost:3000"
else
  log_err "前端启动失败, 请检查日志"
  kill "$BACKEND_PID" 2>/dev/null
  exit 1
fi

# ---------- done ----------
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  PolyMind 启动成功!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "  前端:  ${BOLD}http://localhost:3000${NC}"
echo -e "  后端:  ${BOLD}http://127.0.0.1:8000${NC}"
echo ""
echo -e "  后端 PID:  $BACKEND_PID"
echo -e "  前端 PID:  $FRONTEND_PID"
echo ""
echo -e "  停止服务:  ${YELLOW}kill $BACKEND_PID $FRONTEND_PID${NC}"
echo -e "  修改配置:  ${YELLOW}$ENV_FILE${NC}"
echo ""
