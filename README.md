# polymind

🌐 语言选择 | [English](README_EN.md) | **简体中文**

原生集成agentd服务的自托管AI Agent交互平台。

## 功能特性
- 💬 支持持久化多会话管理的实时AI聊天
- 🧩 原生agentd服务API集成，支持自定义Agent工作流
- 📌 可调整大小的分面板工作区，适配多种使用场景
- 🔐 基于Token的身份认证，保障API接口访问安全
- 🚀 作为独立npm包提供，开箱即用

## 安装
```bash
npm install polymind
# 或
pnpm add polymind
# 或
yarn add polymind
```

## 快速开始
安装完成后，可直接启动服务：
```bash
polymind start
```

## 配置
可通过环境变量或配置对象配置polymind：

| 选项                         | 描述                 | 默认值                    |
| ---------------------------- | -------------------- | ------------------------- |
| `PORT`                       | 服务运行端口         | 3000                      |
| `NEXT_PUBLIC_AUTH_TOKEN`     | API访问认证Token     | dev-token                 |
| `NEXT_PUBLIC_AGENTD_API_URL` | Agent daemon服务API地址 | <https://localhost:8000> |

## 部署
### 生产环境
```bash
polymind build
polymind start
```

### 开发模式（源码开发）
如果直接基于源码进行本地开发：
```bash
pnpm install
pnpm run dev
```

## 许可证
MIT 许可证 - 查看 [LICENSE](LICENSE) 文件获取详细信息。

## 支持
如果遇到问题或有疑问，请在 [AtomGit](https://atomgit.com/openeuler/polymind/issues) 上提交Issue。
