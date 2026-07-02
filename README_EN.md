# PolyMind

🌐 Language | [简体中文](README.md) | **English**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![npm version](https://img.shields.io/npm/v/polymind.svg)](https://www.npmjs.com/package/polymind)

A self-hosted AI Agent interaction platform with native agentd service integration. PolyMind combines AI chat, Agent workflow orchestration, and multi-model management into a complete, out-of-the-box solution that allows you to build your own AI Agent environment without complex configuration.

## Table of Contents

- [About the Project](#about-the-project)
  - [Features](#features)
  - [Technology Stack](#technology-stack)
  - [Installation](#installation)
  - [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Local Development](#local-development)
- [License](#license)
- [Support](#support)

### Features

- 🧩 **Native agentd Integration** — Manage the complete lifecycle of Agents (create, sandbox run, pause/resume) through the agentd service, supporting multiple Adapters like OpenCode, OpenClaw, and Claude Code
- 💬 **Smart Conversations** — Persistent multi-conversation management with Markdown rendering, code highlighting, mathematical formulas (KaTeX), and flowcharts (Mermaid) support
- 🛠️ **Skill Marketplace** — Built-in skill repository management with support for installing from marketplace and uploading custom skill packages
- 🔧 **Multi-Model Management** — Unified configuration and switching between different AI model providers
- 📌 **Resizable Workspace** — Adjustable split-panel layout for simultaneous viewing of chat and tool panels
- 🔐 **Secure Authentication** — Token-based authentication mechanism to secure API endpoint access
- 🚀 **Out-of-the-Box** — Distributed as a standalone npm package, install and start with one command

### Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend Framework | Next.js 16 + React 19 |
| Language | TypeScript 5.7 |
| UI Components | shadcn/ui + Radix UI |
| Styling | Tailwind CSS 4 |
| State Management | Zustand 5 |
| Charts | Recharts |

### Installation

#### Method 1: One-Click Script Installation (Recommended for Non-Developers)

The project provides an `install-local.sh` script that automatically completes environment detection, dependency installation, and environment isolation, suitable for non-developers to quickly deploy.

**Installation Steps:**

1. Clone the repository:

```bash
git clone https://atomgit.com/openeuler/polymind.git
cd polymind
```

2. Run the installation script:

```bash
bash install-local.sh
```

The script will automatically:
- **Environment Detection** — Check OS, architecture, and if Node.js, pnpm, Python, pip are installed
- **Mirror Configuration** — Automatically configure Huawei Cloud mirrors for faster downloads
- **Environment Isolation** — Create Python virtual environment and generate isolated environment profile
- **Dependency Installation** — Install `polymind` frontend and `openclaw` via pnpm, `witty-service` backend via pip
- **Installation Verification** — Verify all components are correctly installed

3. After installation, the script will output an installation summary:

```
============================================
  PolyMind 安装完成!
============================================

  安装目录:  ~/.polymind
  环境配置:  ~/.polymind/.profile
  应用配置:  ~/.polymind/.env
  安装日志:  ~/.polymind/install.log

  启动服务:  bash start.sh
```

#### Method 2: npm Package Installation

If you have already deployed the agentd backend service, you can install only the frontend:

```bash
npm install -g polymind
# or
pnpm add -g polymind
# or
yarn global add polymind
```

### Quick Start

#### Start with start.sh

After installation, use the `start.sh` script to start the service (no need to reinstall dependencies):

```bash
bash start.sh
```

The script will automatically:
- Check if `polymind` and `witty-service` are installed
- Load persisted configuration from `~/.polymind/.env`
- Interactively configure allowed IP addresses (supports local and remote access)
- Detect available ports and start frontend/backend services

`start.sh` also supports the following management commands:

```bash
bash start.sh --status    # View service running status
bash start.sh --stop      # Stop all running services
```

#### Start via CLI

If you have installed polymind globally, you can use the command line directly:

```bash
# Default port
polymind

# Specify port
polymind --port 8080

# Specify bind address
polymind --host 0.0.0.0 --port 8080
```


## Configuration

PolyMind uses `~/.polymind/.env` as the global configuration file, which is automatically generated on first run.

### Core Configuration

| Option | Description | Default |
|--------|-------------|---------|
| `NEXT_PUBLIC_AGENTD_API_URL` | agentd backend API URL | `http://127.0.0.1:8000` |
| `NEXT_PUBLIC_WS_URL` | WebSocket URL | `ws://127.0.0.1:8000/ws` |
| `NEXT_PUBLIC_API_TIMEOUT` | API timeout in milliseconds | `120000` |
| `NEXT_PUBLIC_AUTH_TOKEN` | API access token | `dev-token` |
| `NEXT_PUBLIC_APP_NAME` | Application name | `PolyMind` |
| `NEXT_PUBLIC_DEBUG` | Debug mode | `false` |

### Connection and Retry

| Option | Description | Default |
|--------|-------------|---------|
| `NEXT_PUBLIC_MAX_RECONNECT_ATTEMPTS` | Max WebSocket reconnect attempts | `5` |
| `NEXT_PUBLIC_RECONNECT_INTERVAL` | Reconnect interval in milliseconds | `3000` |

### Insight Observability

- The `Monitoring` panel reads data from the aggregated `/insight/*` endpoints exposed by `witty-service`.
- The `polymind` frontend does not require extra Insight-specific environment variables and does not connect to raw `witty-insight` directly.
- If the monitoring panel is unavailable, first check whether Insight integration is enabled in `witty-service` and whether it can reach `witty-insight`.

## Deployment

### Testing Environment

Suitable for integration testing and feature validation:

```bash
# Build production package
pnpm run build

# Start with built artifacts
pnpm run start
```

### Production Environment

**Method 1: npm Global Installation (Recommended)**

```bash
# Global installation
pnpm add -g polymind

# Start service
polymind --host 0.0.0.0 --port 3000
```

**Method 2: Build from Source**

```bash
# Clone and build
git clone https://atomgit.com/openeuler/polymind.git
cd polymind
pnpm install
pnpm run build

# Start
pnpm run start
```

### Production Notes

- **Authentication Token** — Always change the default `NEXT_PUBLIC_AUTH_TOKEN` to a strong random string
- **Reverse Proxy** — Deploy Nginx or similar reverse proxy in front of PolyMind with HTTPS
- **Process Management** — Use systemd or PM2 for process management and automatic restarts

## Local Development

### Environment Setup

```bash
# 1. Clone repository
git clone https://atomgit.com/openeuler/polymind.git
cd polymind

# 2. Install dependencies
pnpm install

# 3. Modify .env configuration if needed

# 4. Start development server
pnpm run dev
```

### Common Development Commands

| Command | Description |
|---------|-------------|
| `pnpm run dev` | Start development server with hot reload |
| `pnpm run build` | Build production package |
| `pnpm run start` | Start with built artifacts |
| `pnpm run lint` | Run ESLint |
| `pnpm run test` | Run Jest tests |

### Project Structure

```
polymind/
├── app/                    # Next.js App Router pages
│   ├── config/             # Application configuration
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Main page
├── bin/                    # CLI entry (start.js)
├── components/             # React components
│   ├── chat/               # Chat-related components
│   ├── settings/           # Settings page components
│   ├── tool-panel/         # Tool panels (Agent, CVE, Backport)
│   └── ui/                 # shadcn/ui base components
├── docs/                   # Design docs and API specs
├── hooks/                  # Custom React Hooks
├── lib/                    # Utility functions and types
├── services/               # API services
│   ├── agent-service.ts    # Agent management
│   ├── session-service.ts  # Session management
│   ├── message-service.ts  # Message service
│   ├── skill-service.ts    # Skill management
│   ├── model-service.ts    # Model management
│   ├── cve-service.ts      # CVE service
│   └── patchflow-agent-service.ts  # Patchflow Agent
├── scripts/                # Build and installation helper scripts
├── install-local.sh        # One-click installation script
├── start.sh                # One-click start script
└── packaging/              # Packaging scripts
```

### Contribution Workflow

1. Fork this repository
2. Create feature branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -m 'Add some AmazingFeature'`
4. Push to branch: `git push origin feature/your-feature`
5. Open a Pull Request

### Development Guidelines

- **Code Style** — Follow ESLint configuration, run `pnpm run lint` before committing
- **Commit Messages** — Use semantic commit messages (e.g., `feat:`, `fix:`, `docs:`, `refactor:`)
- **Type Safety** — Use TypeScript type system, avoid `any`
- **Component Standards** — Follow shadcn/ui conventions for UI components
- **Test Coverage** — Write unit tests (Jest) for new features

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

## Support

- **Issue Reporting** — Submit issues on [AtomGit Issues](https://atomgit.com/openeuler/polymind/issues)
- **Feature Requests** — Welcome to contribute via Issues or Pull Requests
- **Project Home** — [https://atomgit.com/openeuler/polymind](https://atomgit.com/openeuler/polymind)
