#!/usr/bin/env bash
# ============================================================
# PolyMind 启动脚本 (Linux / macOS)
# 负责配置加载、端口管理和服务启停
# 需先运行 install.sh 完成依赖安装
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

section() {
  echo ""
  echo -e "${BOLD}============================================${NC}"
  echo -e "${BOLD}  $*${NC}"
  echo -e "${BOLD}============================================${NC}"
}

# ---------- config ----------
POLYMIND_DIR="$HOME/.polymind"
ENV_FILE="$POLYMIND_DIR/.env"
PROFILE_FILE="$POLYMIND_DIR/.profile"

DEFAULT_BACKEND_PORT="${BACKEND_PORT:-8000}"
DEFAULT_FRONTEND_PORT="${FRONTEND_PORT:-3000}"

CMD_BACKEND="witty-service"
CMD_FRONTEND="polymind"

PID_FILE="$POLYMIND_DIR/runtime.pid"

# ---------- 命令行参数 ----------
ARG_STOP=false
ARG_STATUS=false

usage() {
  echo "用法: $0 [OPTIONS]"
  echo ""
  echo "选项:"
  echo "  --stop     停止所有运行中的 PolyMind 服务"
  echo "  --status   查看服务运行状态"
  echo "  -h, --help 显示此帮助信息"
  echo ""
  echo "示例:"
  echo "  $0                    # 启动服务"
  echo "  $0 --status           # 查看服务状态"
  echo "  $0 --stop             # 停止服务"
  exit 0
}

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --stop)   ARG_STOP=true ;;
      --status) ARG_STATUS=true ;;
      -h|--help) usage ;;
      *)
        log_err "未知参数: $1"
        usage
        ;;
    esac
    shift
  done
}

parse_args "$@"

# ---------- 端口管理 ----------
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
    return 0
  fi
  return 0
}

get_port_pid() {
  local port=$1
  if command -v ss &> /dev/null; then
    ss -tulnp | grep ":$port " | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1
  elif command -v lsof &> /dev/null; then
    lsof -Pi ":$port" -sTCP:LISTEN -t 2>/dev/null | head -1
  elif command -v netstat &> /dev/null; then
    netstat -tulnp 2>/dev/null | grep ":$port " | awk '{print $NF}' | sed 's/\/.*//' | head -1
  fi
}

kill_port_process() {
  local port=$1
  local pid
  pid=$(get_port_pid "$port")
  if [ -n "$pid" ]; then
    log_warn "端口 $port 被进程 PID=$pid 占用，正在终止..."
    kill "$pid" 2>/dev/null || true
    sleep 1
    if kill -0 "$pid" 2>/dev/null; then
      log_warn "进程未响应，强制终止..."
      kill -9 "$pid" 2>/dev/null || true
      sleep 1
    fi
    if check_port "$port"; then
      log_ok "端口 $port 已释放"
    else
      log_err "端口 $port 释放失败"
      return 1
    fi
  fi
  return 0
}

# ---------- PID 文件管理 ----------
save_pids() {
  mkdir -p "$POLYMIND_DIR"
  echo "BACKEND_PID=$BACKEND_PID" > "$PID_FILE"
  echo "FRONTEND_PID=$FRONTEND_PID" >> "$PID_FILE"
  echo "BACKEND_PORT=$BACKEND_PORT" >> "$PID_FILE"
  echo "FRONTEND_PORT=$FRONTEND_PORT" >> "$PID_FILE"
}

load_pids() {
  if [ -f "$PID_FILE" ]; then
    BACKEND_PID=$(grep '^BACKEND_PID=' "$PID_FILE" | cut -d'=' -f2)
    FRONTEND_PID=$(grep '^FRONTEND_PID=' "$PID_FILE" | cut -d'=' -f2)
    BACKEND_PORT=$(grep '^BACKEND_PORT=' "$PID_FILE" | cut -d'=' -f2)
    FRONTEND_PORT=$(grep '^FRONTEND_PORT=' "$PID_FILE" | cut -d'=' -f2)
  fi
}

# ---------- 状态查询 ----------
show_status() {
  echo ""
  echo -e "${BOLD}PolyMind 服务状态${NC}"
  echo ""

  load_pids

  local backend_ok=false
  local frontend_ok=false

  if [ -n "${BACKEND_PID:-}" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo -e "  后端 (witty-service):  ${GREEN}运行中${NC}  PID=$BACKEND_PID  http://127.0.0.1:${BACKEND_PORT:-8000}"
    backend_ok=true
  else
    echo -e "  后端 (witty-service):  ${RED}未运行${NC}"
  fi

  if [ -n "${FRONTEND_PID:-}" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    echo -e "  前端 (polymind):      ${GREEN}运行中${NC}  PID=$FRONTEND_PID  http://localhost:${FRONTEND_PORT:-3000}"
    frontend_ok=true
  else
    echo -e "  前端 (polymind):      ${RED}未运行${NC}"
  fi

  echo ""

  local backend_port="${BACKEND_PORT:-$DEFAULT_BACKEND_PORT}"
  local frontend_port="${FRONTEND_PORT:-$DEFAULT_FRONTEND_PORT}"

  # 如果 PID 文件不可靠，也检测端口
  if ! $backend_ok && ! check_port "$backend_port"; then
    local pid
    pid=$(get_port_pid "$backend_port")
    echo -e "  ${YELLOW}注意: 端口 $backend_port 被 PID=$pid 占用${NC}"
  fi
  if ! $frontend_ok && ! check_port "$frontend_port"; then
    local pid
    pid=$(get_port_pid "$frontend_port")
    echo -e "  ${YELLOW}注意: 端口 $frontend_port 被 PID=$pid 占用${NC}"
  fi
}

# ---------- 停止服务 ----------
stop_services() {
  section "停止 PolyMind 服务"

  load_pids

  local stopped=0

  if [ -n "${BACKEND_PID:-}" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    log_info "停止后端 (PID=$BACKEND_PID)..."
    kill "$BACKEND_PID" 2>/dev/null || true
    sleep 1
    if kill -0 "$BACKEND_PID" 2>/dev/null; then
      log_warn "后端未响应，强制终止..."
      kill -9 "$BACKEND_PID" 2>/dev/null || true
    fi
    log_ok "后端已停止"
    stopped=$((stopped + 1))
  else
    log_info "后端未在运行"
  fi

  if [ -n "${FRONTEND_PID:-}" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    log_info "停止前端 (PID=$FRONTEND_PID)..."
    kill "$FRONTEND_PID" 2>/dev/null || true
    sleep 1
    if kill -0 "$FRONTEND_PID" 2>/dev/null; then
      log_warn "前端未响应，强制终止..."
      kill -9 "$FRONTEND_PID" 2>/dev/null || true
    fi
    log_ok "前端已停止"
    stopped=$((stopped + 1))
  else
    log_info "前端未在运行"
  fi

  # 清理端口上的残留进程
  local backend_port="${BACKEND_PORT:-$DEFAULT_BACKEND_PORT}"
  local frontend_port="${FRONTEND_PORT:-$DEFAULT_FRONTEND_PORT}"

  if ! check_port "$backend_port"; then
    kill_port_process "$backend_port" || true
  fi
  if ! check_port "$frontend_port"; then
    kill_port_process "$frontend_port" || true
  fi

  rm -f "$PID_FILE"

  if [ "$stopped" -gt 0 ]; then
    echo ""
    log_ok "所有服务已停止"
  fi
}

# ---------- 激活隔离环境 ----------
activate_environment() {
  local _saved_path="$PATH"
  if [ -s "$PROFILE_FILE" ]; then
    source "$PROFILE_FILE"
    export PATH="$PATH:$_saved_path"
  else
    log_warn "隔离环境配置文件不存在: $PROFILE_FILE"
    log_warn "建议先运行 install.sh 以创建隔离环境"
  fi
}

# ---------- 预检查 ----------
run_precheck() {
  section "0/4  启动前检查"

  activate_environment

  local missing=0

  if ! command -v "$CMD_BACKEND" &> /dev/null; then
    log_err "$CMD_BACKEND 未安装，请先运行 install.sh"
    missing=1
  else
    log_ok "$CMD_BACKEND 已就绪"
  fi

  if ! command -v "$CMD_FRONTEND" &> /dev/null; then
    log_err "$CMD_FRONTEND 未安装，请先运行 install.sh"
    missing=1
  else
    log_ok "$CMD_FRONTEND 已就绪"
  fi

  if [ -f "$ENV_FILE" ]; then
    log_ok "配置文件: $ENV_FILE"
  else
    log_warn "配置文件不存在，将使用默认配置"
  fi

  if [ "$missing" -eq 1 ]; then
    exit 1
  fi
}

# ---------- 网络配置 ----------
configure_network() {
  section "1/4  网络配置"

  if [ -n "${ALLOWED_ORIGINS:-}" ]; then
    log_info "使用环境变量中的 ALLOWED_ORIGINS: $ALLOWED_ORIGINS"
  elif [ -f "$ENV_FILE" ] && grep -q '^BACKEND_HOST=' "$ENV_FILE" 2>/dev/null; then
    BACKEND_HOST=$(grep '^BACKEND_HOST=' "$ENV_FILE" | head -1 | cut -d'=' -f2-)
    ALLOWED_ORIGINS="127.0.0.1,localhost"
    if [ "$BACKEND_HOST" != "127.0.0.1" ] && [ "$BACKEND_HOST" != "localhost" ]; then
      ALLOWED_ORIGINS="$ALLOWED_ORIGINS,$BACKEND_HOST"
    fi
    log_info "根据 BACKEND_HOST ($BACKEND_HOST) 自动计算 ALLOWED_ORIGINS: $ALLOWED_ORIGINS"
  elif [ -t 0 ]; then
    echo ""
    echo "  请配置允许访问服务的IP地址"
    echo "  默认为本地访问 (127.0.0.1, localhost)"
    echo "  如果需要从外部访问, 请添加服务器/远程主机IP"
    echo ""
    read -r -p "  请输入服务器IP地址 (留空则仅本地访问): " VM_HOST
    VM_HOST=$(echo "$VM_HOST" | tr -d ' ')

    BACKEND_HOST="${VM_HOST:-127.0.0.1}"
    ALLOWED_ORIGINS="127.0.0.1,localhost"
    if [ -n "$VM_HOST" ]; then
      ALLOWED_ORIGINS="$ALLOWED_ORIGINS,$VM_HOST"
    fi

    export ALLOWED_ORIGINS
    export BACKEND_HOST
    log_info "允许访问的IP: $ALLOWED_ORIGINS"
  else
    BACKEND_HOST="127.0.0.1"
    ALLOWED_ORIGINS="127.0.0.1,localhost"
    log_info "非交互式环境，使用默认 ALLOWED_ORIGINS: $ALLOWED_ORIGINS"
  fi
}

# ---------- 端口准备 ----------
prepare_ports() {
  if ! check_port "$DEFAULT_BACKEND_PORT"; then
    kill_port_process "$DEFAULT_BACKEND_PORT" || exit 1
  fi
  BACKEND_PORT="$DEFAULT_BACKEND_PORT"

  if ! check_port "$DEFAULT_FRONTEND_PORT"; then
    kill_port_process "$DEFAULT_FRONTEND_PORT" || exit 1
  fi
  FRONTEND_PORT="$DEFAULT_FRONTEND_PORT"
}

# ---------- 启动后端 ----------
start_backend() {
  section "2/4  启动后端"

  log_info "启动后端 $CMD_BACKEND (端口 $BACKEND_PORT) ..."
  setsid $CMD_BACKEND --port "$BACKEND_PORT" > "$POLYMIND_DIR/backend.log" 2>&1 &
  BACKEND_PID=$!
  sleep 2

  if kill -0 "$BACKEND_PID" 2>/dev/null; then
    log_ok "后端已启动  PID=$BACKEND_PID  http://127.0.0.1:$BACKEND_PORT  (日志: $POLYMIND_DIR/backend.log)"
  else
    log_err "后端启动失败，请检查日志: $POLYMIND_DIR/backend.log"
    exit 1
  fi
}

# ---------- 启动前端 ----------
start_frontend() {
  section "3/4  启动前端"

  log_info "启动前端 $CMD_FRONTEND (端口 $FRONTEND_PORT) ..."
  ALLOWED_ORIGINS="$ALLOWED_ORIGINS" \
    BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}" \
    BACKEND_PORT="$BACKEND_PORT" \
    FRONTEND_PORT="$FRONTEND_PORT" \
    setsid $CMD_FRONTEND --port "$FRONTEND_PORT" > "$POLYMIND_DIR/frontend.log" 2>&1 &
  FRONTEND_PID=$!
  sleep 2

  if kill -0 "$FRONTEND_PID" 2>/dev/null; then
    log_ok "前端已启动  PID=$FRONTEND_PID  http://localhost:$FRONTEND_PORT  (日志: $POLYMIND_DIR/frontend.log)"
  else
    log_err "前端启动失败，请检查日志: $POLYMIND_DIR/frontend.log"
    kill "$BACKEND_PID" 2>/dev/null
    exit 1
  fi
}

# ---------- 完成 ----------
print_done() {
  section "4/4  启动完成"

  echo ""
  echo -e "  前端:  ${BOLD}http://localhost:$FRONTEND_PORT${NC}"
  echo -e "  后端:  ${BOLD}http://127.0.0.1:$BACKEND_PORT${NC}"
  echo ""
  echo -e "  后端 PID:  $BACKEND_PID"
  echo -e "  前端 PID:  $FRONTEND_PID"
  echo ""
  echo -e "  停止服务:  ${YELLOW}bash start.sh --stop${NC}"
  echo -e "  查看状态:  ${YELLOW}bash start.sh --status${NC}"
  echo -e "  修改配置:  ${YELLOW}$ENV_FILE${NC}"
  echo ""
}

# ---------- main ----------
main() {
  if $ARG_STATUS; then
    show_status
    exit 0
  fi

  if $ARG_STOP; then
    stop_services
    exit 0
  fi

  # 默认：启动服务流程
  run_precheck
  configure_network
  prepare_ports
  start_backend
  start_frontend
  save_pids
  print_done
}

main