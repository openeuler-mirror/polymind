#!/bin/bash
# 环境变量加载脚本，优先级：当前目录.env > ~/.polymind/.env

# 加载全局配置
if [ -f "$HOME/.polymind/.env" ]; then
  export $(cat "$HOME/.polymind/.env" | grep -v '^#' | xargs 2>/dev/null)
fi

# 加载本地配置（同名配置会覆盖全局）
if [ -f ".env" ]; then
  export $(cat .env | grep -v '^#' | xargs 2>/dev/null)
fi

# 执行传入的后续命令
exec "$@"
