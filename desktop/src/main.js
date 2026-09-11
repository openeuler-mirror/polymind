'use strict'
/**
 * PolyMind 桌面端主进程。只有**一种**产品形态：自包含 —— 用 app:// 托管
 * desktop/renderer/ 的静态导出，并把 /api/* 自己代理到本地后端（见 app-protocol.js /
 * net-proxy.js）。不依赖 nginx、不依赖 Node 服务端，RPM 只装一个 /usr/bin/polymind。
 *
 * 唯一例外是**开发期覆盖**：设了 POLYMIND_DESKTOP_URL 就改去加载那个地址（next dev 热迭代，
 * 或当远端薄壳用）。它不是第二种形态，只是"这次别加载本地产物"，权限策略、导航加固、代理与
 * 探活入口全部共用同一套代码。
 *
 * 本文件只留安全基线（清单见 README「六、已落地的安全基线」）+ 启动编排：诊断与冒烟器材已
 * 移到 diagnostic/，且生产路径不会 require 它们（见 NEEDS_DIAGNOSTICS）。
 */
const { app, BrowserWindow, shell, session, dialog } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const {
  registerAppScheme,
  installAppProtocol,
  ORIGIN: APP_ORIGIN,
  safeOrigin,
} = require('./app-protocol')
const { resolveRuntimeConfig } = require('./runtime-config')

// ---------------------------------------------------------------- 配置
/**
 * 静态站点根目录。不提供环境变量覆盖：polymind.spec 装出来的布局固定是 <app>/renderer
 * （desktop/src 与 desktop/renderer 同级拷贝），默认值就是唯一正确值。
 */
const RENDERER_DIR = path.join(__dirname, '..', 'renderer')
const API_TARGET = process.env.POLYMIND_DESKTOP_API_TARGET || 'http://127.0.0.1:8000'
const ENABLE_CSP = process.env.POLYMIND_DESKTOP_CSP === '1'

/** 开发期覆盖：设了就加载这个地址，而不是本地静态产物。唯一的"另一种加载方式"，不是形态开关。 */
const EXTERNAL_URL = process.env.POLYMIND_DESKTOP_URL || ''
const USE_EXTERNAL_URL = EXTERNAL_URL !== ''
const FORM = USE_EXTERNAL_URL ? 'external' : 'embedded'

const TARGET_URL = USE_EXTERNAL_URL ? EXTERNAL_URL : APP_ORIGIN + '/'
const TARGET_ORIGIN = safeOrigin(TARGET_URL)

/**
 * 探活目标 —— 两种加载方式要探的东西不一样，这是全文件唯一必要的分支。
 *   自包含：前端是本地静态文件，永远"在"；真正会挂的是后端 → 探 API_TARGET。
 *   外链覆盖：页面本身在远端，打不开就什么都谈不上 → 探 EXTERNAL_URL。
 * 两者都接受任意 HTTP 状态码 —— 能收到响应就说明端口后面有人。
 */
const HEALTH_TARGET = USE_EXTERNAL_URL ? EXTERNAL_URL : API_TARGET
const HEALTH_LABEL = USE_EXTERNAL_URL ? '前端前门' : '后端'

/** 写入 window.__APP_CONFIG__ 的运行时配置。 */
const RUNTIME_CONFIG = resolveRuntimeConfig(process.env, { logger: console })

/**
 * 探活总超时。默认 8s 而非 20s：启动期会先上屏一张"正在连接"的牌子（见 loadApp），
 * 这个值要回答的问题因此从"用户能忍多久"变成"什么时候该给出可操作提示"。
 */
const HEALTH_TIMEOUT_MS = Number(process.env.POLYMIND_DESKTOP_HEALTH_TIMEOUT || 8000)
const ALLOW_DEVTOOLS = process.env.POLYMIND_DESKTOP_DEVTOOLS === '1'

// 诊断开关（默认全关）。生产路径一个都不开。
const SMOKE = process.env.POLYMIND_DESKTOP_SMOKE === '1'
const TRACE = process.env.POLYMIND_DESKTOP_TRACE === '1'
const SAMPLE = process.env.POLYMIND_DESKTOP_SAMPLE === '1'
const SMOKE_SETTLE_MS = Number(process.env.POLYMIND_DESKTOP_SMOKE_SETTLE || 6000)
const SMOKE_OUT = process.env.POLYMIND_DESKTOP_SMOKE_OUT || path.join(__dirname, '..', 'smoke.png')
const TRANSPORT_PROBE = process.env.POLYMIND_DESKTOP_TRANSPORT_PROBE === '1'
const PROTOCOL_PROBE = process.env.POLYMIND_DESKTOP_PROTOCOL_PROBE === '1'

/** 已废弃开关的迁移提示：静默忽略会让人以为"设了还是 remote"。 */
if (process.env.POLYMIND_DESKTOP_MODE) {
  console.warn(
    '[desktop] POLYMIND_DESKTOP_MODE 已废弃：桌面端只有自包含一种形态。' +
      '需要加载外部前门请改用 POLYMIND_DESKTOP_URL。本次已忽略该变量。'
  )
}

// ---------------------------------------------------------------- 诊断器材（按需加载）
/**
 * 诊断/冒烟器材只在打开开关时才 require —— 为的是收敛**安全评审面**：那两百来行采集与
 * 报告代码过去常驻 main.js（约占三分之一篇幅），而生产运行时一个字节都不会执行到。
 * 出厂 RPM 走的就是下面 diagnosticsModule === null 这条分支。
 */
const NEEDS_DIAGNOSTICS = SMOKE || TRACE || SAMPLE
const diagnosticsModule = NEEDS_DIAGNOSTICS ? require('./diagnostic') : null
const diag = diagnosticsModule
  ? diagnosticsModule.createCollector({ trace: TRACE, sample: SAMPLE })
  : null
const runSmoke = diagnosticsModule ? diagnosticsModule.runSmoke : null
const writeUnreachableReport = diagnosticsModule ? diagnosticsModule.writeUnreachableReport : null

// 无头/CI 环境（无 GPU、容器内 /dev/shm 偏小）下的稳定性开关。
// 注意：以 root 运行时 Electron 会在 C++ 层直接拒绝启动，必须在命令行传 --no-sandbox
// （appendSwitch 太晚，检查发生在主进程 JS 执行之前）。生产环境绝不可用 --no-sandbox。
if (process.env.POLYMIND_DESKTOP_HEADLESS === '1') {
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-dev-shm-usage')
}

/**
 * 必须在 app ready 之前注册 scheme，且**无条件**注册、不按加载方式切换。
 *
 * 无条件的原因：collector.js 的 webRequest 过滤规则里要带上 app 协议的匹配模式，而 Electron
 * 要求"模式里的 scheme 必须已注册"，否则在 whenReady 链路里直接抛 "Wrong scheme type" ——
 * 表现就是"双击图标毫无反应"。让注册与加载方式解耦，这个坑就不存在了。
 */
registerAppScheme()

/** 需要放行的权限（其余一律默认拒绝）。 */
const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write', 'notifications', 'fullscreen'])

/** app:// 协议层统计；冒烟报告会带上（外链覆盖模式下恒为空转，报告里记 null）。 */
const protocolStats = {
  staticHits: 0,
  notFound: 0,
  pathRejected: 0,
  apiRequests: 0,
  apiUpstreamErrors: 0,
  // 上游无视 accept-encoding: identity（见 net-proxy.js）：>0 说明编码前提被打破
  apiEncodingMismatch: 0,
  configInjected: 0,
  configInjectFailed: 0,
  // 一份 index.html 里应有 2 处 window.__APP_CONFIG__ 赋值点（<head> 内联 + RSC payload），
  // 注入器会把两份一起改写；rewritten 长期小于 sites 就说明产物结构变了。
  configCopiesRewritten: 0,
  configCopiesStale: 0,
  telemetryBlocked: 0,
}

/** 只有 http/https 才允许交给系统浏览器。 */
function openExternalSafely(url) {
  let scheme = ''
  try {
    scheme = new URL(url).protocol
  } catch {
    scheme = ''
  }
  if (scheme !== 'https:' && scheme !== 'http:') {
    console.warn('[desktop] 拒绝打开非 http(s) 链接:', url)
    return false
  }
  shell.openExternal(url).catch(err => console.warn('[desktop] openExternal 失败:', err.message))
  return true
}

// ---------------------------------------------------------------- 单实例
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  // ⚠️ 必须硬退出，只调 app.quit() 不够：实测第二实例仍会跑完 whenReady 链路
  // （挂载 app:// → createWindow → loadURL），随后加载被 quit 打断、以 ERR_FAILED(-2)
  // 拒绝，触发 unhandledRejection → dialog.showErrorBox —— 用户双击第二次会看到错误弹窗
  // 加一个空窗口，且进程 12s 后仍未退出。app.exit() 不触发 before-quit，正适合"抢锁失败"。
  console.error('[desktop] 已有实例在运行；本次启动退出，第一实例已收到置前通知')
  app.exit(0)
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
}

// ---------------------------------------------------------------- 导航/新窗口加固
app.on('web-contents-created', (_event, contents) => {
  // 外链一律交给系统浏览器，绝不在 Electron 内新开窗口。
  contents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url)
    return { action: 'deny' }
  })

  // 站内导航放行，跨 origin 交给系统浏览器。
  // 注意不能用 URL.origin：app:// 属于非特殊 scheme，其 origin 是字符串 "null"（见 app-protocol.js）。
  contents.on('will-navigate', (event, url) => {
    if (diag) diag.noteNavigation(url, contents.getURL())
    if (safeOrigin(url) === TARGET_ORIGIN) return
    event.preventDefault()
    console.warn('[desktop] 已阻断跨 origin 导航:', url)
    openExternalSafely(url)
  })

  // 本壳不使用 <webview>，直接禁止，避免绕过上面两条。
  contents.on('will-attach-webview', event => {
    event.preventDefault()
    console.warn('[desktop] 已阻断 webview 挂载')
  })
})

// ---------------------------------------------------------------- 权限默认拒绝
/** 只有"当前窗口正在加载的那个 origin"才有资格申请权限（iframe、被换掉的页面一律不给）。 */
function isTrustedContents(webContents) {
  try {
    const url = webContents && typeof webContents.getURL === 'function' ? webContents.getURL() : ''
    if (!url) return false
    return safeOrigin(url) === TARGET_ORIGIN
  } catch {
    return false
  }
}

function installPermissionPolicy() {
  // 两道闸门：① 权限在白名单里；② 申请方确实是我们的页面。
  // 只做 ① 的话，任何被加载进来的页面都能拿到 notifications / fullscreen。
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    const allowed = ALLOWED_PERMISSIONS.has(permission) && isTrustedContents(wc)
    if (!allowed) {
      console.warn('[desktop] 权限请求被拒绝:', permission, wc && wc.getURL ? wc.getURL() : '')
    }
    callback(allowed)
  })
  session.defaultSession.setPermissionCheckHandler(
    (wc, permission) => ALLOWED_PERMISSIONS.has(permission) && isTrustedContents(wc)
  )
}

// ---------------------------------------------------------------- 健康探针
async function probeTarget(url) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS
  let lastError = 'unknown'
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(3000) })
      return { ok: true, status: res.status, url }
    } catch (err) {
      lastError = err && err.message ? err.message : String(err)
      await new Promise(r => setTimeout(r, 500))
    }
  }
  return { ok: false, error: lastError, url }
}
// ---------------------------------------------------------------- 窗口
let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#1a1a1a',
    title: 'PolyMind',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: false,
      devTools: ALLOW_DEVTOOLS,
      // 桌面端不应因后台失焦而节流派生任务
      backgroundThrottling: false,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    // -3 = ERR_ABORTED：我们自己主动切页（"正在连接"牌 → 真实页面）时也会触发，属于预期
    // 行为。混进失败证据里会把真正的加载失败淹掉。
    if (code === -3) {
      if (TRACE) console.log('[trace] 忽略主动中止的加载:', url)
      return
    }
    console.error('[desktop] 加载失败:', { code, desc, url, isMainFrame })
    if (diag) diag.recordFailedLoad({ code, desc, url, isMainFrame })
  })
  mainWindow.webContents.on('did-fail-provisional-load', (_e, code, desc, url, isMainFrame) =>
    console.error('[desktop] provisional 加载失败:', { code, desc, url, isMainFrame })
  )

  // 采集监听器必须在导航**之前**挂上，否则会漏掉启动期的 console 与请求失败。
  // 这里同时覆盖了 TRACE（导航事件）与 SAMPLE（每 400ms 采样）两种开关。
  if (diag) diag.attach(mainWindow.webContents)

  if (ALLOW_DEVTOOLS) mainWindow.webContents.openDevTools({ mode: 'detach' })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  return mainWindow
}

/**
 * 启动期先上屏的"正在连接"牌子：先本地加载这张牌子（几十毫秒）→ 窗口立刻可见 →
 * 后台探活 → 探活结果决定是换真实页面还是换离线提示页。
 * 牌子复用 offline.html 的 connecting 阶段，不额外维护第二个页面。
 */
const STARTED_AT = Date.now()

function showConnecting(win, target) {
  const t0 = Date.now()
  return win
    .loadFile(path.join(__dirname, 'offline.html'), {
      query: {
        phase: 'connecting',
        form: FORM,
        target,
        timeout: String(Math.round(HEALTH_TIMEOUT_MS / 1000)),
      },
    })
    .then(() =>
      // 这条日志是"双击没反应"这个老问题的量化答案：毫秒数就是用户从双击到看见反馈的等待时间。
      console.log(
        `[desktop] "正在连接"提示页已上屏：启动后 ${Date.now() - STARTED_AT}ms（本页耗时 ${Date.now() - t0}ms）`
      )
    )
    .catch(err => console.warn('[desktop] 连接提示页加载失败（继续走探活流程）:', err.message))
}

// ---------------------------------------------------------------- 冒烟自检的编排
// 采集与报告都在 diagnostic/ 里；本文件只负责"什么时候叫体检、拿到报告后怎么退出"。

/** 交给 diagnostic/smoke.js 的上下文。字段就是报告里需要的那几个静态值。 */
function buildSmokeContext(health) {
  return {
    collector: diag,
    health,
    form: FORM,
    target: TARGET_URL,
    apiTarget: API_TARGET,
    csp: ENABLE_CSP,
    runtimeConfig: RUNTIME_CONFIG,
    protocolStats,
    out: SMOKE_OUT,
    settleMs: SMOKE_SETTLE_MS,
    // 外链覆盖模式下没有走本地静态前端，配置注入计数天然为 0，不能据此判失败
    requireInjection: !USE_EXTERNAL_URL,
    transportProbe: TRANSPORT_PROBE,
    protocolProbe: PROTOCOL_PROBE,
  }
}

/** 冒烟模式：did-finish-load 之后再采集，避免抓到半成品页面。 */
function armSmoke(win, health) {
  win.webContents.once('did-finish-load', async () => {
    try {
      const code = await runSmoke(win, buildSmokeContext(health))
      if (code) process.exitCode = code
    } catch (err) {
      console.error('[desktop][smoke] 失败:', err)
      process.exitCode = 1
    } finally {
      // 必须用 app.exit(code) 而不是 app.quit()：实测 app.quit() **不会**把 process.exitCode
      // 带出去 —— 负向测试明明报告了 failures，进程仍以 0 退出，CI 会"假绿"。
      app.exit(process.exitCode || 0)
    }
  })
}

async function loadApp(win) {
  // ① 先给反馈，再决定去哪。
  await showConnecting(win, HEALTH_TARGET)

  // ② 探活。
  const health = await probeTarget(HEALTH_TARGET)
  if (!health.ok) {
    console.error(`[desktop] ${HEALTH_LABEL}不可达:`, HEALTH_TARGET, health.error)
    const query = { form: FORM, target: HEALTH_TARGET, reason: health.error }
    // 后端不可达时前端界面仍然能打开，但所有接口都会失败 —— 提前给出可操作的提示
    if (!USE_EXTERNAL_URL) {
      query.detail = '桌面端已就绪，静态前端不需要额外服务；请检查 witty-backend.service。'
    }
    await win.loadFile(path.join(__dirname, 'offline.html'), { query })
    return health
  }

  // ③ 探活通过才真正装载。冒烟处理器必须在这次导航**之前**挂上，
  //    否则 once('did-finish-load') 会挂到上面那张"正在连接"牌子上。
  if (SMOKE) armSmoke(win, health)
  await win.loadURL(TARGET_URL)
  return health
}

// ---------------------------------------------------------------- 生命周期
app.whenReady().then(async () => {
  installPermissionPolicy()

  // 自包含的前端前门。外链覆盖模式下不挂载：产物可能压根没构建（只想跑 next dev 看热更新），
  // 而且这份内容这次也不会被加载 —— 少一个"开发期必踩"的启动失败。
  if (!USE_EXTERNAL_URL) {
    try {
      installAppProtocol({
        rendererDir: RENDERER_DIR,
        apiTarget: API_TARGET,
        runtimeConfig: RUNTIME_CONFIG,
        enableCsp: ENABLE_CSP,
        stats: protocolStats,
      })
    } catch (err) {
      console.error('[desktop] app:// 挂载失败:', err.message)
      dialog.showErrorBox('PolyMind 桌面端启动失败', String(err.message))
      app.exit(1)
      return
    }
  }

  const win = createWindow()

  // 冒烟处理器由 loadApp 在"装载真实页面之前"挂上（见 armSmoke）。
  const health = await loadApp(win)
  if (SMOKE && !health.ok) {
    // 让截图仍然有信息量：先等离线页渲染完再截
    await new Promise(r => setTimeout(r, 1500))
    const image = await win.webContents.capturePage().catch(() => null)
    if (image) fs.writeFileSync(SMOKE_OUT, image.toPNG())
    writeUnreachableReport(SMOKE_OUT, {
      form: FORM,
      target: TARGET_URL,
      health,
      diagnostics: diag.state,
    })
    console.error('[desktop][smoke] 目标不可达:', health.error)
    app.exit(1)
    return
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) loadApp(createWindow())
  })
})

app.on('window-all-closed', () => {
  app.quit()
})

// 启动链路任何一环抛错都不该表现为"双击没反应"：直接退出并报错
process.on('unhandledRejection', reason => {
  console.error('[desktop] unhandledRejection:', reason)
  process.exitCode = 1
  if (SMOKE) app.exit(1)
  else dialog.showErrorBox('PolyMind 桌面端启动异常', String((reason && reason.stack) || reason))
})

// 未捕获异常不应静默死掉（桌面端最怕"没反应"）
process.on('uncaughtException', err => {
  console.error('[desktop] uncaughtException:', err)
  // 与 unhandledRejection 对齐：不设 exitCode 会让 CI / 冒烟"假绿"
  process.exitCode = 1
  if (SMOKE) app.exit(1)
  else dialog.showErrorBox('PolyMind 桌面端异常', String(err && err.stack ? err.stack : err))
})
