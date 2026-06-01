#!/usr/bin/env bash
# ============================================================
# PolyMind 启动脚本 (Linux / macOS)
# 需先运行 install.sh 完成安装和配置
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

# ---------- config ----------
POLYMIND_DIR="$HOME/.polymind"
ENV_FILE="$POLYMIND_DIR/.env"

DEFAULT_BACKEND_PORT="${BACKEND_PORT:-8000}"
DEFAULT_FRONTEND_PORT="${FRONTEND_PORT:-3000}"

# ---------- pre-check ----------
section "0/3  启动前检查"

if ! command -v witty-service &> /dev/null; then
  log_err "witty-service 未安装, 请先运行 install.sh"
  exit 1
fi
log_ok "witty-service 已就绪"

if ! command -v polymind &> /dev/null; then
  log_err "polymind 未安装, 请先运行 install.sh"
  exit 1
fi
log_ok "polymind 已就绪"

if [ -f "$ENV_FILE" ]; then
  log_ok "配置文件: $ENV_FILE"
else
  log_warn "配置文件不存在, 将使用默认配置"
fi

# 检测并选择可用端口
BACKEND_PORT=$(find_available_port "$DEFAULT_BACKEND_PORT" 8099)
FRONTEND_PORT=$(find_available_port "$DEFAULT_FRONTEND_PORT" 3099)

if [ -z "$BACKEND_PORT" ]; then
  log_err "后端端口 $DEFAULT_BACKEND_PORT-8099 全部被占用"
  exit 1
fi

if [ -z "$FRONTEND_PORT" ]; then
  log_err "前端端口 $DEFAULT_FRONTEND_PORT-3099 全部被占用"
  exit 1
fi

# 检查默认端口是否被占用
if [ "$BACKEND_PORT" != "$DEFAULT_BACKEND_PORT" ]; then
  log_warn "默认后端端口 $DEFAULT_BACKEND_PORT 被占用, 使用备用端口 $BACKEND_PORT"
fi

if [ "$FRONTEND_PORT" != "$DEFAULT_FRONTEND_PORT" ]; then
  log_warn "默认前端端口 $DEFAULT_FRONTEND_PORT 被占用, 使用备用端口 $FRONTEND_PORT"
fi

# ---------- start backend ----------
section "1/3  启动后端"

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

# ---------- start frontend ----------
section "2/3  启动前端"

log_info "启动前端 polymind (端口 $FRONTEND_PORT) ..."
BACKEND_PORT="$BACKEND_PORT" FRONTEND_PORT="$FRONTEND_PORT" polymind --port "$FRONTEND_PORT" &
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
section "3/3  启动完成"

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
