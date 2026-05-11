# polymind

🌐 Language | [简体中文](README.md) | **English**

Self-hosted AI agent interaction platform with native agentd service integration.

## Features

- 💬 Real-time AI chat with persistent multi-conversation management
- 🧩 Native agentd service API integration for custom agent workflows
- 📌 Resizable split-panel workspace for flexible usage scenarios
- 🔐 Token-based authentication to secure API endpoint access
- 🚀 Out-of-the-box deployment as a standalone npm package

## Installation

```bash
npm install polymind
# or
pnpm add polymind
# or
yarn add polymind
```

## Quick Start

After installation, you can start the service directly:

```bash
polymind start
```

## Configuration

You can configure polymind via environment variables or configuration object:

| Option                       | Description                         | Default                  |
| ---------------------------- | ----------------------------------- | ------------------------ |
| `PORT`                       | Port number to run the service      | 3000                     |
| `NEXT_PUBLIC_AUTH_TOKEN`     | Authentication token for API access | dev-token                |
| `NEXT_PUBLIC_AGENTD_API_URL` | Agent daemon service API endpoint   | <https://localhost:8000> |

## Deployment

### Production

```bash
polymind build
polymind start
```

### Development (Source Code)
For local development when working with the source code:
```bash
pnpm install
pnpm run dev
```

## License

MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any issues or have questions, please [open an issue](https://atomgit.com/openeuler/polymind/issues) on AtomGit.
