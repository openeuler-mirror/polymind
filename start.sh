#!/usr/bin/env bash
# ============================================================
# PolyMind 启动脚本 (Linux / macOS)
# 负责配置加载、端口管理和服务启停
# 需先运行 install-local.sh 完成依赖安装
# ============================================================
set -e

HOST_OS="$(uname -s)"
if [ "$HOST_OS" = "Darwin" ]; then
  # Homebrew 安装的命令通常位于这些目录，优先于系统自带版本
  export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:$PATH"
fi

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

# 默认以当前用户运行 nginx：监听端口均大于 1024，配置/日志/pid/临时目录都在 $POLYMIND_DIR 下，
# 无需 root。仅当当前用户执行失败且 sudo 可免密使用时才提权，避免因用户不在 sudoers 而直接失败。
nginx_cmd() {
  if [ "$(id -u)" -eq 0 ]; then
    nginx "$@"
    return $?
  fi

  local output rc=0
  output=$(nginx "$@" 2>&1) || rc=$?
  if [ "$rc" -eq 0 ]; then
    [ -n "$output" ] && echo "$output"
    return 0
  fi

  if command -v sudo &> /dev/null && sudo -n true 2>/dev/null; then
    sudo -n nginx "$@"
    return $?
  fi

  echo "$output"
  return "$rc"
}

# macOS 没有 setsid，用 nohup 让进程脱离终端
launch_detached() {
  if command -v setsid &> /dev/null; then
    setsid "$@"
  else
    nohup "$@"
  fi
}

pid_alive() {
  local pid=$1
  kill -0 "$pid" 2>/dev/null || sudo -n kill -0 "$pid" 2>/dev/null
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
PROFILE_FILE="$POLYMIND_DIR/.profile"

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
NEXTJS_UPSTREAM_PORT="${NEXTJS_UPSTREAM_PORT:-3001}"

CMD_BACKEND="witty-service"
CMD_FRONTEND="polymind"

PID_FILE="$POLYMIND_DIR/runtime.pid"
NGINX_DIR="$POLYMIND_DIR/nginx"
NGINX_CONF_TEMPLATE="$NGINX_DIR/nginx.conf.template"
NGINX_CONF="$NGINX_DIR/nginx.conf"

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

# 查找占用端口的进程；普通用户看不到 root 进程的 PID 时，自动用 sudo 重查
find_port_pid() {
  local port=$1
  local pid
  pid=$(get_port_pid "$port")
  if [ -z "$pid" ] && ! check_port "$port"; then
    if command -v ss &> /dev/null; then
      pid=$(sudo -n ss -tulnp 2>/dev/null | grep ":$port " | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1)
    elif command -v lsof &> /dev/null; then
      pid=$(sudo -n lsof -Pi ":$port" -sTCP:LISTEN -t 2>/dev/null | head -1)
    elif command -v netstat &> /dev/null; then
      pid=$(sudo -n netstat -tulnp 2>/dev/null | grep ":$port " | awk '{print $NF}' | sed 's/\/.*//' | head -1)
    fi
  fi
  echo "$pid"
}

kill_port_process() {
  local port=$1
  local pid
  pid=$(find_port_pid "$port")
  if [ -n "$pid" ]; then
    log_warn "端口 $port 被进程 PID=$pid 占用，正在终止..."
    kill "$pid" 2>/dev/null || sudo -n kill "$pid" 2>/dev/null || true
    sleep 1
    if pid_alive "$pid"; then
      log_warn "进程未响应，强制终止..."
      kill -9 "$pid" 2>/dev/null || sudo -n kill -9 "$pid" 2>/dev/null || true
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
  echo "NGINX_PID=$NGINX_PID" >> "$PID_FILE"
  echo "BACKEND_PORT=$BACKEND_PORT" >> "$PID_FILE"
  echo "FRONTEND_PORT=$FRONTEND_PORT" >> "$PID_FILE"
}

load_pids() {
  if [ -f "$PID_FILE" ]; then
    BACKEND_PID=$(grep '^BACKEND_PID=' "$PID_FILE" | cut -d'=' -f2)
    FRONTEND_PID=$(grep '^FRONTEND_PID=' "$PID_FILE" | cut -d'=' -f2)
    NGINX_PID=$(grep '^NGINX_PID=' "$PID_FILE" | cut -d'=' -f2)
    BACKEND_PORT=$(grep '^BACKEND_PORT=' "$PID_FILE" | cut -d'=' -f2)
    FRONTEND_PORT=$(grep '^FRONTEND_PORT=' "$PID_FILE" | cut -d'=' -f2)
  fi
}

# ---------- nginx 管理 ----------
generate_nginx_config() {
  if [ ! -f "$NGINX_CONF_TEMPLATE" ]; then
    log_err "nginx 配置模板不存在: $NGINX_CONF_TEMPLATE"
    log_err "请重新运行 install-local.sh 生成模板"
    return 1
  fi

  sed \
    -e "s|{{POLYMIND_DIR}}|$POLYMIND_DIR|g" \
    -e "s|{{FRONTEND_PORT}}|$FRONTEND_PORT|g" \
    -e "s|{{BACKEND_PORT}}|$BACKEND_PORT|g" \
    -e "s|{{NEXTJS_UPSTREAM_PORT}}|$NEXTJS_UPSTREAM_PORT|g" \
    "$NGINX_CONF_TEMPLATE" > "$NGINX_CONF"

  # 显式设置 nginx worker 用户
  # 普通用户启动 nginx 时该指令会被忽略并产生告警，仅在 root 启动时写入
  local tmp_conf="$NGINX_CONF.tmp"
  if [ "$(id -u)" -eq 0 ]; then
    { echo "user $(whoami);"; cat "$NGINX_CONF"; } > "$tmp_conf" && mv "$tmp_conf" "$NGINX_CONF"
  fi

  # 兜底修复旧版模板：确保 error_log/pid 指向用户目录，避免写入系统路径
  if ! grep -q '^error_log' "$NGINX_CONF"; then
    { echo "error_log $POLYMIND_DIR/nginx/error.log;"; cat "$NGINX_CONF"; } > "$tmp_conf" && mv "$tmp_conf" "$NGINX_CONF"
  fi
  if ! grep -q '^pid ' "$NGINX_CONF"; then
    { echo "pid $POLYMIND_DIR/nginx/nginx.pid;"; cat "$NGINX_CONF"; } > "$tmp_conf" && mv "$tmp_conf" "$NGINX_CONF"
  fi

  # 创建 nginx 临时目录（非 root 运行时必需）
  mkdir -p "$NGINX_DIR/tmp/client_body" "$NGINX_DIR/tmp/proxy" "$NGINX_DIR/tmp/fastcgi" "$NGINX_DIR/tmp/uwsgi" "$NGINX_DIR/tmp/scgi"

  log_ok "nginx 配置已生成: $NGINX_CONF"
}

start_nginx() {
  generate_nginx_config || return 1

  log_info "测试 nginx 配置..."
  if ! nginx_cmd -t -c "$NGINX_CONF" 2>&1; then
    log_err "nginx 配置测试失败"
    return 1
  fi

  log_info "启动 nginx (端口 $FRONTEND_PORT)..."
  nginx_cmd -c "$NGINX_CONF"
  sleep 1

  NGINX_PID=$(cat "$NGINX_DIR/nginx.pid" 2>/dev/null || true)
  if [ -n "$NGINX_PID" ] && pid_alive "$NGINX_PID"; then
    log_ok "nginx 已启动  PID=$NGINX_PID  端口=$FRONTEND_PORT"
    return 0
  else
    log_err "nginx 启动失败"
    return 1
  fi
}

stop_nginx() {
  log_info "停止 nginx..."

  local pid
  if [ -f "$NGINX_DIR/nginx.pid" ]; then
    pid=$(cat "$NGINX_DIR/nginx.pid" 2>/dev/null || true)
  fi
  if [ -z "$pid" ]; then
    pid=$(find_port_pid "$FRONTEND_PORT")
  fi

  if [ -n "$pid" ] && pid_alive "$pid"; then
    nginx_cmd -c "$NGINX_CONF" -s quit 2>/dev/null || true
    sleep 1
    if pid_alive "$pid"; then
      kill -TERM "$pid" 2>/dev/null || sudo -n kill -TERM "$pid" 2>/dev/null || true
      sleep 1
      if pid_alive "$pid"; then
        kill -9 "$pid" 2>/dev/null || sudo -n kill -9 "$pid" 2>/dev/null || true
      fi
    fi
    log_ok "nginx 已停止 (PID=$pid)"
  else
    log_info "nginx 未在运行"
  fi
  rm -f "$NGINX_DIR/nginx.pid"
}

# ---------- 状态查询 ----------
show_status() {
  echo ""
  echo -e "${BOLD}PolyMind 服务状态${NC}"
  echo ""

  load_pids

  if [ -n "${BACKEND_PID:-}" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo -e "  后端 (witty-service):  ${GREEN}运行中${NC}  PID=$BACKEND_PID  http://127.0.0.1:${BACKEND_PORT:-8000}"
  else
    echo -e "  后端 (witty-service):  ${RED}未运行${NC}"
  fi

  if [ -n "${FRONTEND_PID:-}" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    echo -e "  前端 (polymind):      ${GREEN}运行中${NC}  PID=$FRONTEND_PID  内部端口=${NEXTJS_UPSTREAM_PORT:-3001}"
  else
    echo -e "  前端 (polymind):      ${RED}未运行${NC}"
  fi

  if [ -n "${NGINX_PID:-}" ] && pid_alive "$NGINX_PID"; then
    echo -e "  代理 (nginx):         ${GREEN}运行中${NC}  PID=$NGINX_PID  端口=${FRONTEND_PORT:-3000}"
  else
    echo -e "  代理 (nginx):         ${RED}未运行${NC}"
  fi

  echo ""

  local backend_port="${BACKEND_PORT:-8000}"
  local frontend_port="${FRONTEND_PORT:-3000}"
  local nextjs_port="${NEXTJS_UPSTREAM_PORT:-3001}"

  if [ -z "${BACKEND_PID:-}" ] && ! check_port "$backend_port"; then
    echo -e "  ${YELLOW}注意: 端口 $backend_port 被占用${NC}"
  fi
  if [ -z "${NGINX_PID:-}" ] && ! check_port "$frontend_port"; then
    echo -e "  ${YELLOW}注意: 端口 $frontend_port 被占用${NC}"
  fi
  if [ -z "${FRONTEND_PID:-}" ] && ! check_port "$nextjs_port"; then
    echo -e "  ${YELLOW}注意: 端口 $nextjs_port 被占用${NC}"
  fi
}

# ---------- 停止服务 ----------
stop_services() {
  section "停止 PolyMind 服务"

  load_pids

  if [ -n "${FRONTEND_PID:-}" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    log_info "停止前端 (PID=$FRONTEND_PID)..."
    kill "$FRONTEND_PID" 2>/dev/null || true
    sleep 1
    kill -0 "$FRONTEND_PID" 2>/dev/null && kill -9 "$FRONTEND_PID" 2>/dev/null || true
    log_ok "前端已停止"
  else
    log_info "前端未在运行"
  fi

  if [ -n "${BACKEND_PID:-}" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    log_info "停止后端 (PID=$BACKEND_PID)..."
    kill "$BACKEND_PID" 2>/dev/null || true
    sleep 1
    kill -0 "$BACKEND_PID" 2>/dev/null && kill -9 "$BACKEND_PID" 2>/dev/null || true
    log_ok "后端已停止"
  else
    log_info "后端未在运行"
  fi

  stop_nginx

  # 清理端口残留
  local ports=("$BACKEND_PORT" "$FRONTEND_PORT" "$NEXTJS_UPSTREAM_PORT")
  for p in "${ports[@]}"; do
    if ! check_port "$p"; then
      kill_port_process "$p" || true
    fi
  done

  rm -f "$PID_FILE"
  log_ok "所有服务已停止"
}

# ---------- 环境激活 ----------
activate_environment() {
  local _saved_path="$PATH"
  if [ -s "$PROFILE_FILE" ]; then
    source "$PROFILE_FILE"
    export PATH="$PATH:$_saved_path"
  else
    log_warn "隔离环境配置文件不存在: $PROFILE_FILE"
    log_warn "建议先运行 install-local.sh 以创建隔离环境"
  fi
}

# ---------- 预检查 ----------
run_precheck() {
  section "0/4  启动前检查"

  activate_environment

  local missing=0

  if ! command -v "$CMD_BACKEND" &> /dev/null; then
    log_err "$CMD_BACKEND 未安装，请先运行 install-local.sh"
    missing=1
  else
    log_ok "$CMD_BACKEND 已就绪"
  fi

  if ! command -v "$CMD_FRONTEND" &> /dev/null; then
    log_err "$CMD_FRONTEND 未安装，请先运行 install-local.sh"
    missing=1
  else
    log_ok "$CMD_FRONTEND 已就绪"
  fi

  if ! command -v nginx &> /dev/null; then
    log_err "nginx 未安装，请先运行 install-local.sh"
    missing=1
  else
    log_ok "nginx $(nginx -v 2>&1 | cut -d'/' -f2) 已就绪"
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

  if [ -f "$ENV_FILE" ] && grep -q '^BACKEND_HOST=' "$ENV_FILE" 2>/dev/null; then
    BACKEND_HOST=$(grep '^BACKEND_HOST=' "$ENV_FILE" | head -1 | cut -d'=' -f2-)
  else
    BACKEND_HOST="127.0.0.1"
  fi

  log_info "nginx 反向代理模式（同源访问，无需 CORS）"
  log_info "后端地址: $BACKEND_HOST:$BACKEND_PORT"
}

# ---------- 端口准备 ----------
prepare_ports() {
  if ! check_port "$BACKEND_PORT"; then
    kill_port_process "$BACKEND_PORT" || exit 1
  fi
  if ! check_port "$FRONTEND_PORT"; then
    kill_port_process "$FRONTEND_PORT" || exit 1
  fi
  if ! check_port "$NEXTJS_UPSTREAM_PORT"; then
    kill_port_process "$NEXTJS_UPSTREAM_PORT" || exit 1
  fi
}

# ---------- 启动后端 ----------
start_backend() {
  section "2/4  启动后端"

  log_info "启动后端 $CMD_BACKEND (端口 $BACKEND_PORT) ..."
  launch_detached $CMD_BACKEND --host 127.0.0.1 --port "$BACKEND_PORT" > "$POLYMIND_DIR/backend.log" 2>&1 < /dev/null &
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

  log_info "启动前端 $CMD_FRONTEND (内部端口 $NEXTJS_UPSTREAM_PORT) ..."

  BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}" \
    BACKEND_PORT="$BACKEND_PORT" \
    FRONTEND_PORT="$FRONTEND_PORT" \
    launch_detached $CMD_FRONTEND --port "$NEXTJS_UPSTREAM_PORT" --host "127.0.0.1" > "$POLYMIND_DIR/frontend.log" 2>&1 < /dev/null &
  FRONTEND_PID=$!
  sleep 2

  if kill -0 "$FRONTEND_PID" 2>/dev/null; then
    log_ok "前端已启动  PID=$FRONTEND_PID  内部端口=$NEXTJS_UPSTREAM_PORT"
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
  echo -e "  访问地址:  ${BOLD}http://localhost:$FRONTEND_PORT${NC}"
  echo -e "  代理模式:  ${GREEN}nginx 反向代理${NC}"
  echo -e "    /      → Next.js (127.0.0.1:$NEXTJS_UPSTREAM_PORT)"
  echo -e "    /api/* → witty-service (127.0.0.1:$BACKEND_PORT)"
  echo ""
  echo -e "  nginx PID:  $NGINX_PID"
  echo -e "  后端 PID:   $BACKEND_PID"
  echo -e "  前端 PID:   $FRONTEND_PID"
  echo ""
  echo -e "  停止服务:  ${YELLOW}bash start.sh --stop${NC}"
  echo -e "  查看状态:  ${YELLOW}bash start.sh --status${NC}"
  echo -e "  修改配置:  ${YELLOW}$ENV_FILE${NC}"
  echo ""
}

# ---------- 系统检查 ----------
check_supported_os() {
  case "$HOST_OS" in
    Linux*|Darwin*) ;;
    *)
      log_err "当前系统 $HOST_OS 不受支持，start.sh 仅支持 Linux 和 macOS"
      log_err "Windows 请使用 WSL2 运行，或按 README 方式二安装前端后自行启动"
      exit 1
      ;;
  esac
}

# ---------- main ----------
main() {
  check_supported_os

  if $ARG_STATUS; then
    show_status
    exit 0
  fi

  if $ARG_STOP; then
    stop_services
    exit 0
  fi

  # 启动服务流程
  run_precheck
  configure_network
  prepare_ports
  start_backend
  start_nginx || {
    log_err "nginx 启动失败"
    kill "$BACKEND_PID" 2>/dev/null
    exit 1
  }
  start_frontend
  save_pids
  print_done
}

main
