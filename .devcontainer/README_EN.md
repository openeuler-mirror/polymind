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
- Repairs ownership of the two named-volume mount points (prevents `pnpm install` from failing with EACCES)
- Cleans stale `.next/` build cache
- Creates `.env` from `.env.example` template (if absent)
- Enables the repo's tracked Git commit hooks and pre-warms hook environments (container-global `core.hooksPath=.githooks`)
- Runs `pnpm install` (with pnpm's built-in network retries)
- Displays Node.js, pnpm and pre-commit version info

Start the dev server:

```bash
pnpm dev   # → http://localhost:3000
```

## Git Commit Hooks (pre-commit)

`pre-commit install` is deliberately **not** run inside the container: it would write into the host's `.git/hooks` (bind-mounted into the container) and bake container-side interpreter paths into the host checkout. Instead:

- The [Dockerfile](Dockerfile) preinstalls `pre-commit` into the system path at build time (tool only, no hook registration), along with a Go toolchain (`GOPROXY` defaults to a China mirror) for the gitleaks hook
- post-create sets a container-global `core.hooksPath=.githooks` (stored in `~/.gitconfig` inside the container, never in the host working tree) and runs `pre-commit install-hooks` to pre-warm hook environments
- The hook scripts are the repo-tracked [.githooks/pre-commit](../.githooks/pre-commit) and [.githooks/commit-msg](../.githooks/commit-msg), running `pre-commit run` and `pre-commit run --hook-stage commit-msg` (commitlint validates the commit message)

Result: `git commit` inside the container checks staged files against the same [.pre-commit-config.yaml](../.pre-commit-config.yaml) the host uses, and the host's `.git/hooks` is never rewritten by the container — once `core.hooksPath` is set, pre-commit refuses to `install` at all.

To use the same hooks on the host, run this once in the repo root (undo with `git config --unset core.hooksPath`):

```bash
git config core.hooksPath .githooks
```

## Networking

The dev container uses `--network host` (`"runArgs": ["--network", "host"]` in `devcontainer.json`). This means:

```
Container shares the host's network stack:
  127.0.0.1:3000 → Next.js dev server (in container)
  127.0.0.1:8000 → agentd / witty-service backend (on host)  ✅ reachable from container
```

The `.env` uses `127.0.0.1` for all backend URLs — this works correctly both from the browser (on the host) and from the Next.js server (inside the container).

## Ports

| Port | Service | Notes |
|------|---------|-------|
| 3000 | PolyMind Dev Server | `pnpm dev` |
| 3001 | PolyMind Production | `node bin/start.js` |
| 8000 | agentd / witty-service | Backend API and WebSocket (host service) |

## Environment Variables

On first container creation, `.devcontainer/scripts/post-create.sh` generates `.env` with these defaults:

```
NEXT_PUBLIC_AGENTD_API_URL=http://127.0.0.1:8000
NEXT_PUBLIC_WS_URL=ws://127.0.0.1:8000/ws
NEXT_WITTYHUB_API_URL=https://skillhub.openeuler.org
```

Edit `.env` as needed. Existing `.env` is never overwritten.

## Caching

Two named volumes persist across rebuilds:

- `polymind_pnpm_store` — global pnpm cache (`/home/node/.local/share/pnpm`)
- `polymind_node_modules` — project dependencies (`/workspaces/polymind/node_modules`)

This makes `pnpm install` nearly instant after the first build.

The Dockerfile pre-creates both mount points owned by `node`, so newly created volumes inherit the correct ownership. Root-owned volumes created by older revisions are repaired automatically by `post-create.sh`.

## Registry mirrors

The image is built against China-friendly mirrors by default. Override them via `build.args` in `devcontainer.json`:

| Build arg | Default | Notes |
|-----------|---------|-------|
| `APT_MIRROR` | `http://mirrors.huaweicloud.com` | Debian mirror base URL (scheme included, no trailing slash). Empty keeps upstream `deb.debian.org`; if the mirror is unreachable the build falls back to upstream automatically |
| `NPM_REGISTRY` | `https://registry.npmmirror.com` | npm/pnpm/corepack registry, written to the container's `~/.npmrc` |
| `PIP_INDEX_URL` | `https://pypi.tuna.tsinghua.edu.cn/simple` | PyPI index used to preinstall pre-commit at build time; if unreachable the build fails — switch mirrors and rebuild |

Notes:

- Debian slim images ship no CA bundle, so `APT_MIRROR` **must use http**; apt still verifies packages with the Debian GPG key.
- pnpm is warmed into `COREPACK_HOME` at build time, so the first `pnpm install` never has to download pnpm itself.
- pre-commit is preinstalled into the system path (`/usr/local/bin/pre-commit`) at build time and drives the repo's tracked `.githooks/` hooks (see "Git Commit Hooks") — it is only the hook runner; registration is done by the container-global `core.hooksPath`. `PIP_INDEX_URL` is exported into the container so pre-commit can be reinstalled there if needed.
- The gitleaks hook (`.pre-commit-config.yaml`) uses `language: golang`; the image ships a Go toolchain and downloads modules via `GOPROXY=https://goproxy.cn,direct`.
- To switch mirrors (e.g. `http://mirrors.aliyun.com`, `http://mirrors.tuna.tsinghua.edu.cn`), edit `build.args` and rebuild the container.

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

Verify connectivity to host services from inside the container (the backend listens on 8000 by default):

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8000/healthz
```

### pnpm install fails

`post-create.sh` repairs the ownership of both named volumes, and pnpm retries network requests natively (`--fetch-retries=5`), so manual intervention is normally unnecessary.

If it still fails, check the error class:

- **Permission errors (EACCES / Permission denied)**: drop the volumes created by an older revision (they are root-owned) and rebuild.

  ```bash
  docker volume rm polymind_pnpm_store polymind_node_modules
  ```

- **Network errors (ETIMEDOUT / ECONNRESET / 404)**: check that `NPM_REGISTRY` is reachable, or switch mirrors in `devcontainer.json` → `build.args` and rebuild.

### git commit fails with `Failed to connect to 127.0.0.1:7897`

VS Code copies the **client's** (Windows/macOS) `~/.gitconfig` into the container by default (`dev.containers.copyGitConfig`). If the client has a local proxy configured (e.g. Clash at `http.proxy=http://127.0.0.1:7897`) while the container runs with `--network host` (sharing the **VM's** network), that address points at the VM itself, not the client — so pre-commit fails with connection refused when it fetches hook repositories.

`post-create.sh` probes whether that proxy is reachable and drops `http.proxy` / `https.proxy` when it is not. Manual fix:

```bash
git config --global --unset http.proxy && git config --global --unset https.proxy
```

If you really need a proxy (e.g. hooks hosted on GitHub), point the container at an address reachable **from the VM** (such as the client's LAN IP) instead of `127.0.0.1`.

### `bash: warning: setlocale: LC_ALL: cannot change locale (en_US.UTF-8)`

The slim image only ships `C` / `C.UTF-8`; the warning means bash cannot find `en_US.UTF-8` and does not affect commits. Ignore it, or use an available locale:

```bash
export LC_ALL=C.UTF-8
```

### Debian mirror slow or unreachable

The image already builds against a domestic mirror and falls back to `deb.debian.org` automatically when the mirror is unreachable. To change it, edit `build.args.APT_MIRROR` in `devcontainer.json` and rebuild.

### Git hooks not active

`pre-commit` is preinstalled into `/usr/local/bin` at build time, and `post-create.sh` points the container-global `core.hooksPath` at the repo's tracked `.githooks`. Check each piece:

```bash
command -v pre-commit && pre-commit --version
git config --show-origin core.hooksPath   # expect: file:/home/node/.gitconfig  .githooks
ls -l .githooks/                          # pre-commit and commit-msg must be executable
```

If `pre-commit` is missing (older image, or the PyPI mirror was unreachable during the build), install it once inside the container:

```bash
pip install --user --break-system-packages -i "$PIP_INDEX_URL" pre-commit
```

If `core.hooksPath` was overwritten (e.g. you replaced the container's `~/.gitconfig`), set it again:

```bash
git config --global core.hooksPath .githooks
```

### Host `git commit` fails with `No module named pre_commit`

Older `post-create.sh` versions used `pre-commit install`, which wrote container-side interpreter paths into the host's `.git/hooks` (through the bind mount). The hooks now live in `.githooks/`; remove the leftovers (pre-commit's `uninstall` only deletes scripts pre-commit itself wrote, restoring any `*.legacy`):

```bash
pre-commit uninstall -t pre-commit -t commit-msg
```

## Toolchain Versions

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 24 | Matches CI (`release.yml`) |
| pnpm | 11.17.0 | Pinned, matches CI; warmed into `COREPACK_HOME` at build time |
| pre-commit | latest | Preinstalled at build time (no hook registration); runs the repo's tracked `.githooks/` hooks (see `.pre-commit-config.yaml`) |
| Go | distro package | Ships in the image for the gitleaks hook (`language: golang`); `GOPROXY` defaults to a China mirror |
| Next.js | 16 | `>= 20.9.0` required per Next.js engines |
| apt / npm / PyPI mirrors | — | See "Registry mirrors"; override via `build.args` |

## References

- [VS Code Dev Containers Documentation](https://code.visualstudio.com/docs/devcontainers/containers)
- [Dev Container Features Reference](https://containers.dev/features)
- [PolyMind Project README](../README.md)
