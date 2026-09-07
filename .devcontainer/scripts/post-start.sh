#!/usr/bin/env bash
# Lightweight diagnostics on every container start.
set -euo pipefail
cd /workspaces/polymind

echo "--- PolyMind devcontainer status ---"
echo "Node.js: $(node --version)"
echo "pnpm:    $(pnpm --version)"

if [ -f .env ]; then
  echo ".env: present"
else
  echo ".env: MISSING — run post-create setup or create one from .env.example"
fi

if [ -d node_modules ]; then
  echo "node_modules: present"
else
  echo "node_modules: missing — run 'pnpm install' first"
fi

# Configure git safe directory for the workspace
git config --global --add safe.directory /workspaces/polymind 2>/dev/null || true

echo "Ready. Run 'pnpm dev' to start the development server."
