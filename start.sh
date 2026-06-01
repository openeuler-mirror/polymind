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
section "0/4  启动前检查"

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

# ---------- host config ----------
section "1/4  网络配置"

# 按优先级确定 ALLOWED_ORIGINS: 环境变量 > 配置文件 > 交互输入
if [ -n "${ALLOWED_ORIGINS:-}" ]; then
  # 从环境变量获取（最高优先级，支持脚本化部署）
  log_info "使用环境变量中的 ALLOWED_ORIGINS: $ALLOWED_ORIGINS"
elif [ -f "$ENV_FILE" ] && grep -q '^ALLOWED_ORIGINS=' "$ENV_FILE" 2>/dev/null; then
  # 从配置文件读取（持久化配置）
  ALLOWED_ORIGINS=$(grep '^ALLOWED_ORIGINS=' "$ENV_FILE" | head -1 | cut -d'=' -f2-)
  if grep -q '^BACKEND_HOST=' "$ENV_FILE" 2>/dev/null; then
    BACKEND_HOST=$(grep '^BACKEND_HOST=' "$ENV_FILE" | head -1 | cut -d'=' -f2-)
  fi
  log_info "使用配置文件中的 ALLOWED_ORIGINS: $ALLOWED_ORIGINS"
elif [ -t 0 ]; then
  # 仅在交互式终端中提示输入
  echo ""
  echo "  请配置允许访问服务的IP地址"
  echo "  默认为本地访问 (127.0.0.1, localhost)"
  echo "  如果需要从外部访问, 请添加虚拟机IP"
  echo ""
  read -r -p "  请输入虚拟机IP地址 (留空则仅本地访问): " VM_HOST
  VM_HOST=$(echo "$VM_HOST" | tr -d ' ')

  ALLOWED_ORIGINS="127.0.0.1,localhost"
  if [ -n "$VM_HOST" ]; then
    ALLOWED_ORIGINS="$ALLOWED_ORIGINS,$VM_HOST"
    BACKEND_HOST="$VM_HOST"
  fi

  # 持久化到配置文件
  mkdir -p "$POLYMIND_DIR"
  if [ -f "$ENV_FILE" ] && grep -q '^ALLOWED_ORIGINS=' "$ENV_FILE" 2>/dev/null; then
    # 更新已有配置项
    grep -v '^ALLOWED_ORIGINS=' "$ENV_FILE" > "${ENV_FILE}.tmp"
    echo "ALLOWED_ORIGINS=$ALLOWED_ORIGINS" >> "${ENV_FILE}.tmp"
    mv "${ENV_FILE}.tmp" "$ENV_FILE"
  else
    # 添加新配置项
    echo "ALLOWED_ORIGINS=$ALLOWED_ORIGINS" >> "$ENV_FILE"
  fi
  log_info "允许访问的IP: $ALLOWED_ORIGINS"
  log_info "已保存到配置文件: $ENV_FILE"
  # 同步持久化 BACKEND_HOST
  if [ -n "${BACKEND_HOST:-}" ]; then
    if grep -q '^BACKEND_HOST=' "$ENV_FILE" 2>/dev/null; then
      grep -v '^BACKEND_HOST=' "$ENV_FILE" > "${ENV_FILE}.tmp"
      echo "BACKEND_HOST=$BACKEND_HOST" >> "${ENV_FILE}.tmp"
      mv "${ENV_FILE}.tmp" "$ENV_FILE"
    else
      echo "BACKEND_HOST=$BACKEND_HOST" >> "$ENV_FILE"
    fi
    log_info "后端主机: $BACKEND_HOST"
  fi
else
  # 非交互式环境，使用默认值
  ALLOWED_ORIGINS="127.0.0.1,localhost"
  log_info "非交互式环境，使用默认 ALLOWED_ORIGINS: $ALLOWED_ORIGINS"
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
section "2/4  启动后端"

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
section "3/4  启动前端"

log_info "启动前端 polymind (端口 $FRONTEND_PORT) ..."
ALLOWED_ORIGINS="$ALLOWED_ORIGINS" BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}" BACKEND_PORT="$BACKEND_PORT" FRONTEND_PORT="$FRONTEND_PORT" polymind --port "$FRONTEND_PORT" &
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
section "4/4  启动完成"

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
