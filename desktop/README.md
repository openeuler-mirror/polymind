# PolyMind 桌面端（Electron）

**只有一种形态：自包含。** 主进程用 `app://` 托管 `desktop/renderer/` 里的静态导出，
`/api` 由主进程自己代理，**不需要 nginx，也不需要 Node 服务端** —— RPM 只装一个可执行文件即可运行。

唯一的例外是**开发期覆盖**：设了 `POLYMIND_DESKTOP_URL` 就改去加载那个地址
（`next dev` 热迭代，或把桌面端当远端薄壳用）。它不是第二种形态，只是"这次别加载本地产物"，
权限策略、导航加固、代理与探活入口全部共用同一套代码。

| 加载方式 | 前端从哪来 | `/api` 怎么走 | 还需要 nginx / Node 吗 |
|---|---|---|---|
| **embedded**（默认） | 主进程用 `app://` 托管 `desktop/renderer/` 静态导出 | 主进程 `net.fetch` 自己代理 | **不需要** |
| **external**（`POLYMIND_DESKTOP_URL`） | 那个地址上的现成 Web 前门 | 由该前门自行代理 | 视前门而定 |

> `POLYMIND_DESKTOP_MODE` **已废弃**：早期 PoC 用它切换 remote / embedded 两种形态。之所以删掉，
> 是它带来的不是能力而是**默认值错位** —— RPM 发行的是自包含形态，而代码默认值却是 remote，
> 于是 `npm start` 指向的 `127.0.0.1:3000` 在装了 RPM 的机器上并不存在。现在设了它会被忽略并告警。

---

## 一、快速开始

### 默认：自包含

```bash
cd desktop
npm install                            # 受限网络下：export ELECTRON_MIRROR=https://cdn.npmmirror.com/binaries/electron/
npm run build:renderer                 # 前端静态导出 → desktop/renderer/（约 10.4 MiB / 159 个文件）
POLYMIND_AUTH_TOKEN=dev-token npm start
```

**不需要启动 nginx，也不需要启动 Next / `polymind.service`**，只需要 `witty-service` 在 8000 上。

### 开发期覆盖：加载外部前门

```bash
POLYMIND_DESKTOP_URL=http://127.0.0.1:3000 npm start
```

适合"改了前端想立刻看到效果、不想每次重跑 `build:renderer`"。
这种模式下**根本不会挂载 `app://`**，所以连 `build:renderer` 都不必先跑。

> 前置条件：目标地址必须是一个**已经带同源 `/api` 代理**的前门。
> 只跑 `next dev` 而没有 nginx 时，页面能打开但接口会 404 —— 壳会显示离线提示页而不是白屏。

---

## 二、自包含形态的架构

```
                 ┌─────────────────────── Electron 主进程 ───────────────────────┐
   Electron 窗口 │  app://polymind/            （app-protocol.js）              │
   （渲染进程）   │     ├─ 非 /api  → desktop/renderer/ 下的静态文件              │
        │        │     └─ /api/*   → net.fetch → http://127.0.0.1:8000/api 去掉  │
        └────────┼──────────────────────────────────────────────────────────────┘
                 └──────────────────────────────────────────────────────────────┘

   对比现状：浏览器 → nginx:3000 ─┬─ / ──→ Next standalone:3001
                                 └─ /api/ → witty-service:8000
```

一个 `app://` 处理器顶掉了现状里的 **nginx + Next 服务端**两层：静态资源出自 `desktop/renderer/`
（`next export` 产物，`/_next/static/*` 带内容哈希 → 长缓存）；`/api/*` 由主进程用 `net.fetch`
（Chromium 网络栈）转发到后端，语义对齐 `start.sh` 里的
`location /api/ { proxy_pass http://127.0.0.1:8000/; proxy_buffering off; }`；
运行时配置则在吐出 `index.html` 时改写内联的 `window.__APP_CONFIG__`，不再需要构建期烘焙。

### 为什么是 `app://` 而不是 `file://`

| | `file://` | `app://`（standard + secure） |
|---|---|---|
| origin | opaque（`null`） | `app://polymind` |
| `fetch()` 相对路径 | 不可用 | 可用 |
| `localStorage` / IndexedDB | 不可用 | 可用 |
| `isSecureContext` | `false`（`crypto.subtle`、剪贴板 API 全废） | `true` |
| SPA 路径回退 | 无 http 语义 | 与 http 一致 |
| 暴露真实文件系统路径 | 会 | 不会 |

---

## 三、环境变量

> 下面分两张表。**部署时真正要配的只有第一张的 2–3 个**；第二张是开发与排障用的，
> 生产路径上它们一个都不会被读到 —— 诊断器材在那些开关全关时**根本不会被 `require`**
> （见 `src/main.js` 的 `NEEDS_DIAGNOSTICS`）。

### 部署配置

| 变量 | 默认 | 说明 |
|------|------|------|
| `POLYMIND_DESKTOP_API_TARGET` | `http://127.0.0.1:8000` | **后端地址**。页面发往 `app://polymind/api/...` 的请求代理到这里；启动探活也探它 |
| `POLYMIND_DESKTOP_URL` | 空 | 设了就改去加载这个**外部前门**，不再用本地产物（见「一、快速开始」）。它是唯一的"另一种加载方式"，不是一个形态开关 |
| `POLYMIND_DESKTOP_HEALTH_TIMEOUT` | `8000` | 启动探活超时（ms）。探活期间窗口已经显示"正在连接"牌子，所以这个值决定的是"多久给出可操作提示"而非"用户要盯多久黑屏" |
| `POLYMIND_DESKTOP_CSP` | 关 | `1` 下发 CSP（见「已知边界」2） |

### 开发 / 排障

| 变量 | 默认 | 说明 |
|------|------|------|
| `POLYMIND_DESKTOP_DEVTOOLS` | 关 | `1` 打开 DevTools（生产不应开） |
| `POLYMIND_DESKTOP_HEADLESS` | 关 | `1` 关闭 GPU、改用 `/dev/shm` 兼容模式（CI/容器） |
| `POLYMIND_DESKTOP_SMOKE` | 关 | `1` 冒烟自检：加载后截图 + 采集控制台/失败请求，然后退出 |
| `POLYMIND_DESKTOP_SMOKE_SETTLE` | `6000` | 冒烟采集前的静置时间（ms） |
| `POLYMIND_DESKTOP_SMOKE_OUT` | `desktop/smoke.png` | 截图输出路径（同目录写一份 `.json` 报告） |
| `POLYMIND_DESKTOP_TRANSPORT_PROBE` | 关 | `1` 在页面内探测 REST / WS / SSE 三条链路（只读） |
| `POLYMIND_DESKTOP_PROTOCOL_PROBE` | 关 | `1` 在页面内验证 `app://` 各项语义 |
| `POLYMIND_DESKTOP_TRACE` | 关 | `1` 打印逐条协议请求与导航事件 |
| `POLYMIND_DESKTOP_SAMPLE` | 关 | `1` 每 400ms 采样一次页面状态（排查"页面何时变白/变错误页"） |

### 运行时前端配置（embedded 生效，无需重新构建）

| 变量 | 对应前端 key |
|------|--------------|
| `POLYMIND_API_URL` | `NEXT_PUBLIC_AGENTD_API_URL` |
| `POLYMIND_WS_URL` | `NEXT_PUBLIC_WS_URL` |
| `POLYMIND_API_TIMEOUT` | `NEXT_PUBLIC_API_TIMEOUT` |
| `POLYMIND_AUTH_TOKEN` | `NEXT_PUBLIC_AUTH_TOKEN` |
| `POLYMIND_APP_NAME` / `POLYMIND_APP_VERSION` | `NEXT_PUBLIC_APP_NAME` / `NEXT_PUBLIC_APP_VERSION` |
| `POLYMIND_DEBUG` / `POLYMIND_USE_MOCK_DATA` | 同名 `NEXT_PUBLIC_*` |
| `POLYMIND_MAX_RECONNECT_ATTEMPTS` / `POLYMIND_RECONNECT_INTERVAL` | 同名 `NEXT_PUBLIC_*` |
| `POLYMIND_WITTYHUB_API_URL` | `NEXT_WITTYHUB_API_URL` |
| `POLYMIND_DESKTOP_CONFIG_FILE` | 一个 JSON 文件，直接给出上面所有 key |
| `POLYMIND_DESKTOP_CONFIG_JSON` | 内联 JSON，同上（优先级低于单变量） |

> 这就是替代 `NEXT_PUBLIC_AUTH_TOKEN`「构建期烘焙」的那条路径：改 `/etc/polymind/polymind.env`
> 后**只需重启桌面端**，不必重新构建前端产物。

> ⚠️ **`POLYMIND_API_URL` 是个隐形开关，别随手填绝对地址。**
> 前端的 `api.baseUrl` 是 `getConfigValue('NEXT_PUBLIC_AGENTD_API_URL') || '/api'`，
> 也就是说**代理模式是靠"不设置这个变量"实现的** —— 空值 → 相对路径 `/api` →
> 被 `app://` 处理器截走交给主进程。一旦把它设成 `http://...`，整条代理链路就地失效：
> 请求由渲染进程直连后端，离开 `app://polymind` origin，CORS / 权限模型全变 ——
> 而日志里本来什么都不会说。桌面端现在会在启动时**显式告警**
> （`runtime-config.js: warnIfProxyBypassed`）。想改后端地址请用 `POLYMIND_DESKTOP_API_TARGET`。

---

## 四、自包含形态的实测结论（openEuler 25.09 / x86_64 / Electron 44.3.0）

跑真实后端（`witty-service` on :8000，**nginx 未启动**）：

| 项 | 结果 |
|---|---|
| 页面 origin / secure context | `app://polymind` / `isSecureContext: true`（`crypto.subtle`、`localStorage` 可用） |
| 真实 UI 渲染 | ✅ 冒烟自动截图 + JSON 报告（**不入库**，复现方式见下） |
| 运行时配置注入 | ✅ 只设了 `POLYMIND_AUTH_TOKEN`，页面 `__APP_CONFIG__` 即为其值（构建期烘焙值为空） |
| REST `GET /api/agents` | ✅ 200 / 6 个 agent / `x-polymind-desktop-proxy: 1` |
| POST 请求体透传 | ✅ 回显一致（`matched: true`） |
| **SSE 流式透传** | ✅ 用 SSE 替身测得 **9 个分块、间隔约 250ms**（证明协议层没有把响应整体缓冲） |
| 静态资源缓存头 | ✅ `/_next/static/*` → `max-age=31536000, immutable` |
| SPA 回退 | ✅ 无扩展名未知路径 → 200 `text/html` |
| 资源缺失 | ✅ 带扩展名的未知路径 → 404 |
| 路径逃逸 | ✅ 3 种 `%2e%2e%2f` / `..%2f` 变体全部 404，未读到 renderer 之外 |
| 未知 host | ✅ `app://not-polymind/...` → 404 |
| 遥测端点 | ✅ `/_vercel/insights/*` → 204，不外发 |
| 页面错误 / 加载失败 | ✅ 0 |

### 证据怎么复现

上面的结论都由 `POLYMIND_DESKTOP_SMOKE=1` 跑出来：截图落在 `POLYMIND_DESKTOP_SMOKE_OUT`
指定的路径，同名 `.json` 是结构化报告（origin / isSecureContext / configKeys /
`apiUpstreamErrors` / `pageErrors` / `failedRequests` / 协议层计数）：

```bash
cd desktop
POLYMIND_AUTH_TOKEN=dev-token POLYMIND_DESKTOP_SMOKE=1 \
POLYMIND_DESKTOP_PROTOCOL_PROBE=1 POLYMIND_DESKTOP_TRANSPORT_PROBE=1 \
POLYMIND_DESKTOP_SMOKE_OUT=/tmp/embedded.png \
xvfb-run -a --server-args="-screen 0 1440x900x24" ./node_modules/.bin/electron . --no-sandbox
```


**为什么必须用 SSE 替身**：真实后端在没有进行中的 Agent 运行时，SSE 会立刻结束，
"有没有被缓冲"看起来完全一样。替身每 250ms 吐一个事件，才能把这条链路验证到位：

```bash
npm run fixture                    # 另开一个终端，起在 127.0.0.1:18099
POLYMIND_DESKTOP_API_TARGET=http://127.0.0.1:18099 \
POLYMIND_DESKTOP_SMOKE=1 POLYMIND_DESKTOP_PROTOCOL_PROBE=1 \
POLYMIND_DESKTOP_SMOKE_OUT=/tmp/embedded-fixture.png \
xvfb-run -a --server-args="-screen 0 1440x900x24" ./node_modules/.bin/electron . --no-sandbox
```

> 替身只提供最小字段的 agent 对象，前端会在渲染时抛错并落到错误页 ——
> 这是**替身数据不全**导致的，不是协议层问题；协议层各项指标在同一次运行里依然全绿。

---

## 五、冒烟自检（无头环境）

```bash
# 需要 Xvfb（openEuler: dnf install -y xorg-x11-server-Xvfb）
cd desktop
POLYMIND_AUTH_TOKEN=dev-token \
POLYMIND_DESKTOP_SMOKE=1 POLYMIND_DESKTOP_HEADLESS=1 \
POLYMIND_DESKTOP_PROTOCOL_PROBE=1 POLYMIND_DESKTOP_TRANSPORT_PROBE=1 \
POLYMIND_DESKTOP_SMOKE_OUT=/tmp/polymind-smoke.png \
xvfb-run -a --server-args="-screen 0 1440x900x24" ./node_modules/.bin/electron . --no-sandbox
```

产出 `.png` 与 `.json`（含 protocol / transport / protocolStats / consoleLogs / failedRequests / pageErrors）。

**退出码即结论**（可以直接接 CI）：

| 退出码 | 含义 |
|---|---|
| `0` | 通过 |
| `1` | 目标不可达、页面判失败，或 `failures` 非空 |

当前唯一的硬失败项是**运行时配置注入失败/从未发生**（`configInjectFailed > 0` 或
`configInjected === 0`）：构建期 `NEXT_PUBLIC_*` 被刻意清空，注入失败时页面拿到的是空配置，
表现是"能打开但所有接口静默失败"，比直接报错难查得多，所以宁可让它红。

> 实现上必须用 `app.exit(code)`：实测 `app.quit()` **不会**把 `process.exitCode` 带出去 ——
> 负向测试明明报告了 `failures`，进程仍以 0 退出，CI 会假绿。

报告里所有字符串在落盘前都会过 `redactSecrets()`（`Bearer` / `token` / `password` /
URL 查询串里的凭据参数），所以就算渲染进程打印了凭据，也不会进证据文件。

> **`--no-sandbox` 只用于「以 root 运行的容器」**：Electron 在 C++ 层就会拒绝 root 无沙箱启动，
> 且该检查发生在主进程 JS 之前，`app.commandLine.appendSwitch` **无效**，只能走命令行参数。
> 生产环境绝不可使用。普通用户 + openEuler 默认的 unprivileged userns 即可正常沙箱运行
> （实测渲染进程 `Seccomp: 2` / `NoNewPrivs: 1`，日志无任何降级告警）。

---

## 六、已落地的安全基线

| 项 | 取值 | 依据 |
|----|------|------|
| `contextIsolation` | `true` | Electron 官方 security checklist |
| `nodeIntegration` | `false` | 同上 |
| `sandbox` | `true` | 同上（注意：与 `nodeIntegration:true` 互斥） |
| `nodeIntegrationInSubFrames` | `false` | 保证产物沙箱 iframe 拿不到 preload 暴露的对象 |
| `webviewTag` | `false` | 关闭 `<webview>`，避免绕过导航限制 |
| 新窗口 | `setWindowOpenHandler` → 一律 `deny` | 外链改走 `shell.openExternal` |
| 导航 | `will-navigate` + **origin 比较** | 不用 `startsWith`（`https://a.com.attacker.com` 可绕过） |
| 外链 scheme | 仅 `http/https` | 防 `file://`/`javascript:` 注入 |
| 权限 | 默认拒绝，仅放行 `clipboard-sanitized-write`/`notifications`/`fullscreen` | 官方默认是**自动批准**，必须显式收紧 |
| 单实例 | `requestSingleInstanceLock()` + 抢锁失败即 `app.exit(0)` | 避免多开导致的连接/状态错乱 |
| preload 暴露面 | 仅两个只读标量：`platform` / `isDesktopShell` | **不做能力桥**，原因见下方说明 |
| `/api` 代理 | 折叠前导斜杠 + 拒绝反斜杠 + 上游 origin/scheme 断言 | 防 `/api//evil.com/x` 协议相对 URL 越权 |
| `app://` 路径 | 解码后拒绝任何 `..` 段 + `path.relative` 二次校验 | 防目录穿越 |
| `app://` scheme 权限 | 不注册 `bypassCSP` / `allowServiceWorkers` | 前者会关掉 CSP |
| 权限 | 默认拒绝 + **按 origin 校验申请方** | 白名单之外，非本站页面/iframe 一律不给 |
| 遥测 | `/_vercel/insights/*` → 204 | 桌面端不外发遥测 |
| 运行时配置注入 | 失败即 500，**不降级** | 构建期 `NEXT_PUBLIC_*` 被清空，降级 = 静默不可用 |
| 日志落盘 | 统一过 `redactSecrets` 再写 | 渲染进程 console 会进证据文件，不能假设上游不打印凭据 |
| CSP | 默认**不开**，`POLYMIND_DESKTOP_CSP=1` 启用 | 内联脚本需 hash/nonce，见「已知边界」2 |

> ⚠️ **`origin` 判定有个坑**：`new URL('app://polymind/x').origin` 在 Node 里返回字符串
> `"null"`（URL 规范只给 http/https/ws/wss/ftp/file 这些"特殊 scheme"分配 tuple origin）。
> 所以 `safeOrigin()` 对非 http(s) 走手工拼 `scheme://host`，否则 `will-navigate` 的比较会永远失配。

> ⚠️ **preload 里拿不到 `shell`**：`sandbox: true` 下 `require('electron')` 只给 7 个模块
> （`contextBridge` / `crashReporter` / `ipcRenderer` / `nativeImage` / `sharedTexture` /
> `webFrame` / `webUtils`），**没有 `shell`**。早先版本在这里写了
> `const { shell } = require('electron')`，实测 `typeof shell === 'undefined'`，
> 调用时抛 `Cannot read properties of undefined (reading 'openExternal')`。
> 外链本来就走 `<a target="_blank">` → `setWindowOpenHandler` → `openExternalSafely()`，
> 因此该桥已删除；将来若真需要，正确做法是 `ipcRenderer.invoke` + 主进程
> `ipcMain.handle` 并在 handle 里校验 `event.senderFrame` 的 origin 与 scheme。

> ⚠️ **`/api` 代理不能直接 `new URL(suffix, apiTarget)`**：`/api//evil.com/x` 的 suffix
> 是 `//evil.com/x`，会被当成协议相对 URL，**origin 被整个替换**；`/api/\evil.com/x`
> 同理（特殊 scheme 下 `\` 等价 `/`）。实测后果不止 SSRF —— 主进程会代发任意请求、
> 把响应体回读给页面，并把页面的 `Authorization` 一并送到攻击者主机。
> 现在的三道闸门：① 拒绝反斜杠；② 前导斜杠只留一个；③ 上游 origin/scheme 断言。

---

## 七、目录

```
desktop/
├── build-renderer.mjs           # 静态导出 + 收集到 renderer/
├── package.json                 # 独立依赖，不污染前端 pnpm 依赖树
├── renderer/                    # （构建产物，gitignore）app:// 托管的静态站点
├── poc-evidence/                # （本地产物，gitignore）冒烟证据：截图 + JSON 报告
│                                #   复现命令见上
├── tools/
│   └── sse-fixture-server.mjs   # SSE 替身：验证代理是否真流式
└── src/
    ├── main.js                  # 主进程：窗口、导航/权限策略、探活、生命周期（安全基线都在这）
    ├── app-protocol.js          # app:// 协议：静态托管 + 运行时配置注入 + 路由
    ├── net-proxy.js             # /api/* → 后端（含 SSE 流式透传）
    ├── runtime-config.js        # 系统环境变量 → window.__APP_CONFIG__
    ├── public-env-keys.json     # 可注入页面的 key 白名单（前端/构建/运行时共用的唯一真相源）
    ├── preload.js               # 只暴露窄接口
    ├── offline.html             # 启动提示页：connecting（正在连接）/ offline（不可达）两态
    ├── diagnostic/              # 诊断与冒烟器材 —— 开关全关时**整个目录不会被 require**
    │   ├── redact.js            #   落盘前脱敏（唯一带"安全"性质的控件，单独成篇便于单独审）
    │   ├── collector.js         #   边跑边记：console / 失败请求 / 失败加载 / 页面采样 / 导航 trace
    │   ├── smoke.js             #   收尾出报告：截图 + 注入探针 + 判失败 + 写 JSON
    │   └── index.js             #   统一入口
    ├── transport-probe.js       # 注入页面的 REST/WS/SSE 只读探针
    └── protocol-probe.js        # 注入页面的 app:// 语义探针
`

> `diagnostic/` 之所以单独成目录，是为了**收敛安全评审面**：采集与报告代码曾被写在同一份
> `main.js` 里，而它在生产运行时一行都不会执行到。你的发行包里 `NEEDS_DIAGNOSTICS` 为假，
> `main.js` 走的就是不 `require` 这个目录的分支。``

对应的前端改动只有一处：`next.config.js` 增加 `POLYMIND_BUILD_TARGET=static` 开关
（默认仍是 `output: 'standalone'`，对现有部署零影响）。

---

## 八、已知边界（当前阶段刻意不做）

1. **WebSocket 不可用（规范层硬约束）**
   `new WebSocket()` 只接受 `http/https/ws/wss` 四种 scheme，而 `app://` 页面里的相对路径
   解析出的就是 `app:` scheme，**必然抛 SyntaxError**。实测：
   `The URL's scheme must be either 'http', 'https', 'ws', or 'wss'. 'app' is not allowed.`
   当前 `services/message-service.ts: connectForMessages()` **全仓无调用者**，所以不影响功能。
   将来若要用，必须让主进程再起一个真实的 `ws://127.0.0.1:<port>` 桥接端口，并把
   `NEXT_PUBLIC_WS_URL` 在运行时指过去。

2. **CSP 默认不开**
   实测开启后主流程 0 违规（页面正常渲染），策略带 `'unsafe-inline'`：
   next 会在 HTML 里内联多段 `<script>`，`script-src 'self'` 会直接把页面打死，
   要真正收紧必须配 hash/nonce。**尚未覆盖全部深路径流程**（产物预览、PDF、图片生成等），
   所以先做成 `POLYMIND_DESKTOP_CSP=1` 的选项，等流程走全再考虑默认开启。

3. **不打包后端、不托管后端起停**（后端是 Python + Docker + 多个 CLI 的复合体）。

4. **不做托盘/通知/自动更新/打包签名**（生产化阶段）。上游更新走 RPM 仓库，不用 electron-updater。

5. **`renderer/` 整份读进内存后再返回**
   站点共 10.4 MiB、单文件最大约 0.5 MiB，当前实现用 `readFile` 换取确定性；
   若将来资源变大，改成 `Readable.toWeb(createReadStream())` 即可。

6. **静态资源不支持 HTTP Range**（一律整文件 200）
   `app://` 处理器不解析 `Range`，实测带 `Range: bytes=0-9` 请求仍返回 `200` + 完整文件。
   当前**不影响产物预览/PDF/音视频**：这些走 `lib/artifacts.ts` 的鉴权 `fetch` + Blob URL
   （`URL.createObjectURL`，走 `/api` 代理，后端若支持 Range `content-range` 也会原样透传）。
   只有当将来有人把 `<video src="app://polymind/...">` / 静态 PDF 直接指到协议上才会踩到。

7. **`/api` 代理不透传 Cookie —— Chromium 层面的过滤，不是配置问题**
   Fetch 规范把 `Set-Cookie` 列为 forbidden response-header name，Chromium 因此把它
   **从 `Response.headers` 里整个摘掉**。实测（Electron 44，用 `tools/sse-fixture-server.mjs`
   的 `/multi-cookie` 路由，上游确实发了 3 条 `Set-Cookie`）：

   ```
   net.fetch('app://polymind/api/multi-cookie').headers.getSetCookie()  -> []        // 期望 3 条
                                            .headers.get('set-cookie')  -> null
   ```

   所以"代理吞掉多余的 Set-Cookie"这个担心在 Electron 里**不成立**：它一条都拿不到。
   今天用 Bearer token 鉴权，无症状；**若将来后端改用 Cookie 会话，桌面端会直接掉登录态**。
   届时的出路（都不在本次范围内）：
   * 用 `net.request` 替代 `net.fetch` —— ClientRequest 的 `response` 事件给的是原始头，
     `set-cookie` 是可读的数组；或
   * 走 `session.defaultSession.cookies` 在主进程里自己维护会话。

   `net-proxy.js` 里保留了 `getSetCookie()` + `append()` 的正确写法：哪天换运行时
   （或 Electron 放开过滤）它自动就是对的，但现在**不能**当成"Cookie 已经通了"。

8. **后端压缩响应会被 Chromium 直接判失败（不是我们剥头造成的乱码）**
   代理显式声明 `accept-encoding: identity`，并据此剥掉 `content-encoding` /
   `content-length`。实测若上游无视该声明仍回压缩体，**Chromium 在 `net.fetch` 那一层就
   以 `ERR_CONTENT_DECODING_FAILED` 失败**（用 fixture 的 `/forbidden-encoding` 路由复现），
   响应根本到不了代理手里。因此这一条被单独识别成 502 +
   `detail: 上游响应体编码与本代理不符`，并计入 `apiEncodingMismatch` ——
   目的是别把它笼统报成"后端不可达"，把排查方向指错。
