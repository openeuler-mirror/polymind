# PolyMind DevContainer Development Environment

🌐 Language | [简体中文](README.md) | **English**

VS Code [Dev Containers](https://code.visualstudio.com/docs/devcontainers/containers) configuration for a one-click PolyMind development setup.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (Docker Desktop or Docker Engine)
- [VS Code](https://code.visualstudio.com/) + [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

## Mode

After opening the project, VS Code prompts you to choose a dev container mode:

### Mode 1: PolyMind (Frontend) — Default (Recommended)

**Single-container setup** with Node.js + pnpm for frontend development only.

- 🟢 **Best for**: Frontend development, UI work, component building
- 📦 **Includes**: Node.js 24, pnpm 11, ESLint/Prettier/Tailwind CSS extensions
- 🔗 **Architecture**: Uses `--network host` so the container shares the host network stack. Backend services (agentd, witty-service) running on the host are directly reachable at `127.0.0.1`.

## Quick Start

```bash
# 1. Clone
git clone https://atomgit.com/openeuler/polymind.git
cd polymind

# 2. Open in VS Code
code .

# 3. Click the bottom-right prompt or F1 → "Dev Containers: Reopen in Container"
#    Select "PolyMind (Frontend)" mode
```

The first build takes ~1–2 minutes (subsequent starts use cached layers). The `onCreateCommand` automatically:
- Fixes file ownership for Linux hosts (`updateRemoteUserUID`)
- Cleans stale `.next/` build cache
- Creates `.env` from `.env.example` template (if absent)
- Runs `pnpm install`
- Displays Node.js and pnpm version info

Start the dev server:

```bash
pnpm dev   # → http://localhost:3000
```

## Networking

The dev container uses `--network host` (`"runArgs": ["--network", "host"]` in `devcontainer.json`). This means:

```
Container shares the host's network stack:
  127.0.0.1:3000 → Next.js dev server (in container)
  127.0.0.1:8000 → agentd backend (on host)  ✅ reachable from container
  127.0.0.1:8081 → witty-service (on host)   ✅ reachable from container
```

The `.env` uses `127.0.0.1` for all backend URLs — this works correctly both from the browser (on the host) and from the Next.js server (inside the container).

## Ports

| Port | Service | Notes |
|------|---------|-------|
| 3000 | PolyMind Dev Server | `pnpm dev` |
| 3001 | PolyMind Production | `node bin/start.js` |
| 8000 | agentd API | Backend (host service) |
| 8081 | witty-service | Backend (host service) |
| 8000 | agentd WebSocket | Backend (host service) |

## Environment Variables

On first container creation, `.devcontainer/scripts/post-create.sh` generates `.env` with these defaults:

```
NEXT_PUBLIC_AGENTD_API_URL=http://127.0.0.1:8000
NEXT_PUBLIC_WS_URL=ws://127.0.0.1:8000/ws
NEXT_WITTYHUB_API_URL=http://127.0.0.1:8081
```

Edit `.env` as needed. Existing `.env` is never overwritten.

## Caching

Two named volumes persist across rebuilds:

- `polymind_pnpm_store` — global pnpm cache (`/home/node/.local/share/pnpm`)
- `polymind_node_modules` — project dependencies (`/workspaces/polymind/node_modules`)

This makes `pnpm install` nearly instant after the first build.

## Troubleshooting

### Workspace not writable (Permission denied)

**Symptom**: `EACCES: permission denied` during `pnpm install` or on file writes.

**Cause**: On Linux, bind mounts preserve host file ownership. The fix (`updateRemoteUserUID: true`) aligns the container user's UID to the host's.

**Fix** (if it still occurs):
```bash
sudo chown -R $(id -u):$(id -g) /workspaces/polymind
```

### Turbopack "Permission denied" reading .next/

**Symptom**: `TurbopackInternalError: reading file ... Permission denied (os error 13)`

**Cause**: `.next/` build cache was created with different ownership from a previous run.

**Fix**:
```bash
rm -rf .next
pnpm dev
```

The post-create script now cleans stale `.next/` automatically.

### Backend not responding from container

**Symptom**: Frontend works but API calls to agentd/witty-service timeout.

**Cause**: Without `--network host`, `127.0.0.1` inside the container points to the container's own loopback, not the host.

**Fix**: Already configured — `devcontainer.json` uses `"runArgs": ["--network", "host"]`. Rebuild the container if you're using an older config.

### Slow package downloads (China)

Configure a domestic registry mirror:

```bash
pnpm config set registry https://registry.npmmirror.com
```

## Toolchain Versions

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 24 | Matches CI (`release.yml`) |
| pnpm | 11.17.0 | Pinned, matches CI |
| Next.js | 16 | `>= 20.9.0` required per Next.js engines |

## References

- [VS Code Dev Containers Documentation](https://code.visualstudio.com/docs/devcontainers/containers)
- [Dev Container Features Reference](https://containers.dev/features)
- [PolyMind Project README](../README.md)
