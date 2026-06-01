#!/bin/bash
set -e

echo "=================================="
echo "PolyMind 自动化构建脚本"
echo "=================================="

# 支持npm包构建模式
if [ "$1" = "npm" ]; then
  echo "🔨 构建npm发布包..."
  pnpm build
  
  echo "📦 复制静态资源到运行目录..."
  # 复制public静态资源目录到standalone运行目录
  cp -r public .next/standalone/
  # 复制前端构建静态资源到standalone运行目录
  cp -r .next/static .next/standalone/.next/
  
  npm pack
  echo "✅ npm包构建完成: polymind-*.tgz"
  echo "📦 可以直接发布到npm仓库或者本地安装测试"
  exit 0
fi