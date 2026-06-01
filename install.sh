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

# 检测端口是否被占用
check_port() {
  local port=$1
  if command -v ss &> /dev/null; then
    if ss -tuln | grep -q ":$port "; then
      return 1
    fi
  elif command -v lsof &> /dev/null; then
    if lsof -Pi ":$port" -sTCP:LISTEN -t &> /dev/null; then
      return 1
    fi
  elif command -v netstat &> /dev/null; then
    if netstat -tuln | grep -q ":$port "; then
      return 1
    fi
  else
    log_warn "无法检测端口状态 (lsof/ss/netstat 均未安装)"
    return 0
  fi
  return 0
}

# 查找可用端口
find_available_port() {
  local start_port=$1
  local end_port=$2
  for port in $(seq "$start_port" "$end_port"); do
    if check_port "$port"; then
      echo "$port"
      return 0
    fi
  done
  return 1
}

section() {
  echo ""
  echo -e "${BOLD}============================================${NC}"
  echo -e "${BOLD}  $*${NC}"
  echo -e "${BOLD}============================================${NC}"
}

# ---------- check deps ----------
section "1/4  环境检测"

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

check_cmd node     || MISSING=1
check_cmd pnpm     || MISSING=1
check_cmd python3  || check_cmd python || MISSING=1
check_cmd pip3     || check_cmd pip    || MISSING=1
check_cmd openclaw || MISSING=1

if [ "$MISSING" -eq 1 ]; then
  echo ""
  log_err "请先安装缺少的依赖后重新运行本脚本"
  echo "  Node.js:   https://nodejs.org/"
  echo "  Python:    https://www.python.org/downloads/"
  echo "  pnpm:      npm install -g pnpm"
  echo "  OpenClaw:  pnpm add -g openclaw"
  exit 1
fi

# ---------- mirror ----------
section "2/4  镜像源"

echo ""
echo "  检测到国内网络环境, 推荐使用国内镜像加速"
echo ""
read -r -p "  是否使用国内镜像源? [Y/n] " MIRROR_CHOICE
MIRROR_CHOICE=${MIRROR_CHOICE:-y}

USE_MIRROR=false
case "$MIRROR_CHOICE" in
  [yY]|[yY][eE][sS]|是)
    USE_MIRROR=true
    PNPM_MIRROR="https://mirrors.huaweicloud.com/repository/npm/"
    PIP_MIRROR="https://repo.huaweicloud.com/repository/pypi/simple"
    log_info "pnpm 镜像: $PNPM_MIRROR"
    log_info "pip 镜像:  $PIP_MIRROR"
    ;;
  *)
    log_info "使用官方源"
    ;;
esac

# ---------- install packages ----------
section "3/4  安装依赖包"

# --- pnpm: polymind ---
if $USE_MIRROR; then
  PNPM_INSTALL_CMD="pnpm add -g polymind --registry=$PNPM_MIRROR"
else
  PNPM_INSTALL_CMD="pnpm add -g polymind"
fi

log_info "安装前端包 polymind ..."
$PNPM_INSTALL_CMD
log_ok "polymind 安装完成"

# --- pip: witty-service ---
if command -v pip3 &> /dev/null; then
  PIP_CMD=pip3
else
  PIP_CMD=pip
fi

if $USE_MIRROR; then
  PIP_INSTALL_CMD="$PIP_CMD install witty-service -i $PIP_MIRROR --trusted-host repo.huaweicloud.com"
else
  PIP_INSTALL_CMD="$PIP_CMD install witty-service"
fi

log_info "安装后端包 witty-service ..."
$PIP_INSTALL_CMD
log_ok "witty-service 安装完成"


# ---------- start services ----------
section "4/4  启动服务"

# 检测并选择可用端口
BACKEND_PORT=$(find_available_port 8000 8099)
FRONTEND_PORT=$(find_available_port d 3099)

if [ -z "$BACKEND_PORT" ]; then
  log_err "后端端口 8000-8099 全部被占用"
  exit 1
fi

if [ -z "$FRONTEND_PORT" ]; then
  log_err "前端端口 3000-3099 全部被占用"
  exit 1
fi

# 检查默认端口是否被占用
if [ "$BACKEND_PORT" != "8000" ]; then
  log_warn "默认后端端口 8000 被占用, 使用备用端口 $BACKEND_PORT"
fi

if [ "$FRONTEND_PORT" != "3000" ]; then
  log_warn "默认前端端口 3000 被占用, 使用备用端口 $FRONTEND_PORT"
fi

# 启动后端
log_info "启动后端 witty-service (端口 $BACKEND_PORT) ..."
witty-service --port "$BACKEND_PORT" &
BACKEND_PID=$!
sleep 2

if kill -0 "$BACKEND_PID" 2>/dev/null; then
  log_ok "后端已启动  PID=$BACKEND_PID  http://127.0.0.1:$BACKEND_PORT"
else
  log_err "后端启动失败, 请检查日志"
  exit 1
fi

# 启动前端
log_info "启动前端 polymind (端口 $FRONTEND_PORT) ..."
echo ""
polymind --port "$FRONTEND_PORT" &
FRONTEND_PID=$!
sleep 2

if kill -0 "$FRONTEND_PID" 2>/dev/null; then
  log_ok "前端已启动  PID=$FRONTEND_PID  http://localhost:$FRONTEND_PORT"
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
echo -e "  前端:  ${BOLD}http://localhost:$FRONTEND_PORT${NC}"
echo -e "  后端:  ${BOLD}http://127.0.0.1:$BACKEND_PORT${NC}"
echo ""
echo -e "  后端 PID:  $BACKEND_PID"
echo -e "  前端 PID:  $FRONTEND_PID"
echo ""
echo -e "  停止服务:  ${YELLOW}kill $BACKEND_PID $FRONTEND_PID${NC}"
echo -e "  修改配置:  ${YELLOW}$ENV_FILE${NC}"
echo ""
