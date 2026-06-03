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
- [FAQ](#faq)
- [License](#license)
- [Support](#support)

## About the Project

PolyMind is a self-hosted AI Agent interaction platform with native agentd service integration. It combines AI chat, Agent workflow orchestration, and multi-model management into a complete, out-of-the-box solution.

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
| Backend Service | agentd (Python, distributed via witty-service) |
| Communication | HTTP REST + WebSocket + SSE |
| Build Output | Next.js Standalone |

### Installation

#### Method 1: One-Click Script Installation (Recommended for Non-Developers)

The project provides an `install.sh` script that automatically completes environment detection, dependency installation, and service startup.

**Prerequisites:**

| Dependency | Description | Installation |
|------------|-------------|--------------|
| Node.js | v22+ | [nodejs.org](https://nodejs.org/) |
| pnpm | Package manager | `npm install -g pnpm` |
| Python 3 | Backend runtime | [python.org](https://www.python.org/downloads/) |
| pip | Python package manager | Included with Python |
| OpenClaw | Agent adapter | `pnpm add -g openclaw@2026.5.7` |

**Installation Steps:**

1. Clone the repository:

```bash
git clone https://atomgit.com/openeuler/polymind.git
cd polymind
```

2. Run the installation script:

```bash
bash install.sh
```

The script will automatically:
- **Environment Detection** — Check if Node.js, pnpm, Python, pip, and OpenClaw are installed
- **Mirror Configuration** — Detect Chinese network environment and suggest Huawei Cloud mirrors
- **Network Configuration** — Interactive configuration for allowed IP addresses
- **Dependency Installation** — Install `polymind` frontend package via pnpm, `witty-service` backend via pip
- **Service Startup** — Detect available ports and start frontend/backend services

3. After installation, the script will output access addresses and process PIDs:

```
============================================
  PolyMind 启动成功!
============================================

  前端:  http://localhost:3000
  后端:  http://127.0.0.1:8000

  停止服务:  kill <BACKEND_PID> <FRONTEND_PID>
  修改配置:  ~/.polymind/.env
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
- Detect available ports and start frontend/backend services

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

#### Start with Environment Variables

Support for environment variable configuration, suitable for scripted deployment:

```bash
BACKEND_HOST=192.168.1.100 BACKEND_PORT=8000 FRONTEND_PORT=3000 polymind
```

## Configuration

PolyMind uses `~/.polymind/.env` as the global configuration file, which is automatically generated on first run. Changes take effect after restarting the service.

### Core Configuration

| Option | Description | Default |
|--------|-------------|---------|
| `NEXT_PUBLIC_AGENTD_API_URL` | agentd backend API URL | `http://127.0.0.1:8000` |
| `NEXT_PUBLIC_WS_URL` | WebSocket URL | `ws://127.0.0.1:8000/ws` |
| `NEXT_PUBLIC_API_TIMEOUT` | API timeout in milliseconds | `30000` |
| `NEXT_PUBLIC_AUTH_TOKEN` | API access token | `dev-token` |
| `NEXT_PUBLIC_APP_NAME` | Application name | `PolyMind` |
| `NEXT_PUBLIC_DEBUG` | Debug mode | `false` |

### Connection and Retry

| Option | Description | Default |
|--------|-------------|---------|
| `NEXT_PUBLIC_MAX_RECONNECT_ATTEMPTS` | Max WebSocket reconnect attempts | `5` |
| `NEXT_PUBLIC_RECONNECT_INTERVAL` | Reconnect interval in milliseconds | `3000` |

### Network and Access Control

| Option | Description | Default |
|--------|-------------|---------|
| `BACKEND_HOST` | Backend service host | `127.0.0.1` |
| `BACKEND_PORT` | Backend service port | `8000` |
| `FRONTEND_PORT` | Frontend service port | `3000` |
| `ALLOWED_ORIGINS` | Allowed origins (comma-separated) | `127.0.0.1,localhost` |

> **Note:** To access PolyMind from external machines, add the server IP to `ALLOWED_ORIGINS` and set `BACKEND_HOST` to the server's LAN IP address.

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
- **Network Isolation** — Restrict `ALLOWED_ORIGINS` to trusted IPs in production
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
├── install.sh              # One-click installation script
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
