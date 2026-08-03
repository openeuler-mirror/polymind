#!/usr/bin/env bash
# PolyMind devcontainer first-run setup. Idempotent — safe on every container creation.
set -euo pipefail
cd /workspaces/polymind

echo "=== PolyMind devcontainer: post-create setup ==="

# 1. Fix workspace ownership on Linux hosts where bind mounts preserve host UIDs.
if [ ! -w . ]; then
  echo "[fix] Workspace not writable — adjusting ownership..."
  sudo chown -R "$(id -u):$(id -g)" /workspaces/polymind 2>/dev/null || {
    echo "WARNING: Could not adjust workspace ownership."
    echo "Run manually:  sudo chown -R node:node /workspaces/polymind"
  }
fi

# 2. Clean stale build cache (.next/) that may have wrong ownership from prior runs.
if [ -d .next ] && [ ! -w .next ]; then
  echo "[fix] Removing stale .next/ with wrong ownership..."
  sudo rm -rf .next 2>/dev/null || rm -rf .next 2>/dev/null || true
fi
# Also clean .next/cache/ which Next.js uses for persistent caching
if [ -d .next ]; then
  rm -rf .next/cache 2>/dev/null || true
fi

# 3. Create a dev-ready .env if absent (never overwrite user config).
if [ ! -f .env ]; then
  cat > .env << 'EOF'
NEXT_PUBLIC_AGENTD_API_URL=http://127.0.0.1:8000
NEXT_PUBLIC_WS_URL=ws://127.0.0.1:8000/ws
NEXT_PUBLIC_API_TIMEOUT=120000
NEXT_PUBLIC_MAX_RETRY_ATTEMPTS=3
NEXT_PUBLIC_RECONNECT_INTERVAL=3000
NEXT_PUBLIC_MAX_RECONNECT_ATTEMPTS=5
NEXT_WITTYHUB_API_URL=http://127.0.0.1:8081
NEXT_PUBLIC_AUTH_TOKEN=dev-token
EOF
  echo "[ok] Created .env from devcontainer template (see .env.example for all options)"
else
  echo "[ok] .env already exists — keeping existing configuration"
fi

# 4. Install dependencies.
pnpm install

# 5. Verify toolchain parity with CI.
echo "--- Toolchain versions ---"
node --version
pnpm --version

echo ""
echo "PolyMind devcontainer ready. Run:  pnpm dev"
