'use strict'
/**
 * app:// 协议 —— 自包含形态的"前端前门"（对比 file:// 的取舍见 README「二 › 为什么是 app:// 而不是 file://」）。
 * 非 /api → desktop/renderer/ 下的静态文件；/api/* → 主进程 net.fetch 转发（见 net-proxy.js）。
 *
 * 安全要点：路径解码后含 '..' 段一律 404，最终路径必须落在 renderer 根目录内
 * （path.relative 二次校验）；不注册 bypassCSP / allowServiceWorkers。
 */
const { protocol } = require('electron')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { proxyApiRequest } = require('./net-proxy')

const SCHEME = 'app'
const HOST = 'polymind'
/** app://polymind —— 页面 origin。 */
const ORIGIN = `${SCHEME}://${HOST}`
/** app:// 命名空间下被代理到后端的路径前缀（对齐现状 nginx 的 location /api/）。 */
const API_PREFIX = '/api'

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.wasm': 'application/wasm',
}

/**
 * 可选 CSP，默认**不启用**：next 会在 HTML 里内联多段 <script>（含 window.__APP_CONFIG__
 * 与 RSC 引导），script-src 'self' 会直接把页面打死，要真正收紧必须配 hash/nonce。
 * 这里的策略带 'unsafe-inline'，价值只在堵外部脚本注入 + 禁掉 object/embed，属纵深防御。
 */
const DEFAULT_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "frame-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "object-src 'self' blob:",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

/**
 * 计算 origin。不能用 new URL(url).origin：URL 规范里只有 http/https/ws/wss/ftp/file
 * 这些"特殊 scheme"才有 tuple origin，其余一律返回字符串 "null"（实测
 * new URL('app://polymind/x').origin === 'null'），会让 will-navigate 的比较永远失配。
 */
function safeOrigin(url) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.origin
    if (!parsed.host) return parsed.protocol
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    return null
  }
}

/** 必须在 app ready 之前调用（Electron 要求 scheme 注册早于 ready）。 */
function registerAppScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true, // 让 app://polymind/a/b 具备 http 式路径/相对路径语义与 origin
        secure: true, // isSecureContext=true：crypto.subtle、剪贴板、Service Worker 等的前提
        supportFetchAPI: true, // 页面里 fetch('/api/...') 与 EventSource 才能指向本 scheme
        corsEnabled: true, // 让 CORS 规则照常参与（同源时不影响）
        stream: true, // 允许流式响应 —— SSE 必需
      },
    },
  ])
}

/** 扫描 JS 对象字面量的结束花括号（识别字符串与转义）。不能用 /\{[^}]*\}/：配置值里出现 '}' 就会提前收尾。 */
function findObjectLiteralEnd(source, start) {
  let depth = 0
  let quote = null
  let escaped = false
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i]
    if (quote) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      continue
    }
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return i + 1
    }
  }
  return -1
}

/** 只认赋值点 `window.__APP_CONFIG__ =`：读取点（`window.__APP_CONFIG__?.[key]`）不能被当成赋值点。 */
const CONFIG_ASSIGN_RE = /window\.__APP_CONFIG__\s*=/g

/** 同一份配置字面量最多可能被嵌套转义几层（实测 Next 16 的 RSC flight payload 是 2 层）。 */
const MAX_ESCAPE_LEVELS = 3

/** 按 JS 字符串字面量 / RSC flight payload 的规则转义一层：\ → \\，" → \"。 */
function escapeOnce(text) {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** 连转 levels 层。level=0 即原文；level=2 时 `"` 会变成 \\\"（3 个反斜杠 + 引号）。 */
function escapeLevels(text, levels) {
  let out = text
  for (let i = 0; i < levels; i += 1) out = escapeOnce(out)
  return out
}

/** 统计产物里有几个"赋值点"（每个赋值点对应一份配置副本）。 */
function countAssignmentSites(html) {
  return (html.match(CONFIG_ASSIGN_RE) || []).length
}

/**
 * 把 index.html 里**所有** `window.__APP_CONFIG__ = {...}` 副本整体替换为运行时配置。
 *
 * 静态导出产物里有**两份**同一份字面量：① <head> 里真正会执行的那段 <script>；
 * ② React RSC flight payload（`self.__next_f.push([1,"..."])`）里
 * `dangerouslySetInnerHTML.__html` 的那份副本，已被逐层转义。只改 ① 时页面当下能跑，
 * 但产物里留着一份与运行时不一致的配置 —— 哪天 React 因 hydrate 不匹配重建那个节点，
 * 页面就退回"能打开、接口全静默失败"。与其依赖"② 恰好不会被执行"，不如让两份一致。
 *
 * @returns {{html: string, injected: boolean, reason?: string, replacements?: number,
 *            levels?: number[], sites?: number, stale?: number}}
 */
function injectRuntimeConfig(html, config) {
  const sites = countAssignmentSites(html)
  if (sites === 0) return { html, injected: false, reason: 'assignment-not-found', sites: 0 }

  const assignAt = html.search(CONFIG_ASSIGN_RE)
  const braceAt = html.indexOf('{', assignAt)
  if (braceAt === -1) return { html, injected: false, reason: 'no-object-literal', sites }
  const end = findObjectLiteralEnd(html, braceAt)
  if (end === -1) return { html, injected: false, reason: 'unterminated-object', sites }

  /** 构建期烘焙的那份原文，当作"模板"去识别其余被转义的副本。 */
  const baked = html.slice(braceAt, end)
  const json = JSON.stringify(config || {}).replace(/</g, '\\u003c') // 防止 </script> 提前闭合

  let out = html.slice(0, braceAt) + json + html.slice(end)
  let replacements = 1
  const levels = [0]

  // 其余副本 = 同一份原文被逐层转义后的样子，逐层试（同一层里若有多份也会一起换掉）。
  // baked 里连引号都没有（例如 {}）时跳过：那种串在 HTML 里到处都是，split/join 会误伤。
  if (baked.length >= 8 && baked.includes('"')) {
    for (let level = 1; level <= MAX_ESCAPE_LEVELS; level += 1) {
      const from = escapeLevels(baked, level)
      const parts = out.split(from)
      if (parts.length === 1) continue
      replacements += parts.length - 1
      levels.push(level)
      out = parts.join(escapeLevels(json, level))
    }
    // 同层还剩别的副本（理论上不会）：一并换掉
    const rest = out.split(baked)
    if (rest.length > 1) {
      replacements += rest.length - 1
      levels.push(0)
      out = rest.join(json)
    }
  }

  return {
    html: out,
    injected: true,
    replacements,
    levels,
    sites,
    /** 没能改写的副本数：>0 说明产物结构变了（多半是 Next 升级改了转义层数），必须显式报出来。 */
    stale: sites - replacements,
  }
}

/** 把 app:// 的路径映射到 renderer 根目录下的真实文件。返回 null 表示路径不合法（逃逸/非法编码），调用方应 404。 */
function resolveAssetPath(root, pathname) {
  let decoded
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (decoded.includes('\0')) return null
  // 解码后再判 '..'：%2e%2e%2f 这类编码绕过必须在解码之后才看得见
  if (decoded.split('/').includes('..')) return null
  const candidate = path.join(root, path.posix.normalize(decoded))
  const rel = path.relative(root, candidate)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null
  return candidate
}

function mimeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
}

/** 拼进 HTML 的动态片段一律转义：不依赖"上游 URL 解析层恰好编码过"这种前提。 */
function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
  )
}

const ERROR_PAGE_STYLE = 'font:14px/1.6 system-ui;padding:32px;color:#ddd;background:#1a1a1a'

function notFound(reason) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>404</title>` +
      `<body style="${ERROR_PAGE_STYLE}">` +
      `<h2>404 · app:// 未命中</h2><p>${escapeHtml(reason)}</p></body>`,
    {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    }
  )
}

/**
 * 运行时配置注入失败页。**不降级放行**：build-renderer.mjs 会刻意清空全部 NEXT_PUBLIC_*，
 * 注入一旦失败，页面拿到的是空配置（后端地址、token 全空），表现是"能打开、但所有接口
 * 静默失败"——比直接报错难查得多。这里宁可 500，把问题钉在启动阶段。
 */
function configInjectionFailed(reason) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>500</title>` +
      `<body style="${ERROR_PAGE_STYLE}">` +
      `<h2>500 · 桌面端运行时配置注入失败</h2>` +
      `<p>原因：<code>${escapeHtml(reason)}</code></p>` +
      `<p>页面必须靠 <code>window.__APP_CONFIG__</code> 拿到后端地址与鉴权 token，` +
      `而构建期烘焙值已被刻意清空，所以这里不会降级放行。</p>` +
      `<p>请确认 <code>desktop/renderer/</code> 是 ` +
      `<code>node desktop/build-renderer.mjs</code> 生成的产物。</p>` +
      `</body>`,
    {
      status: 500,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    }
  )
}

async function statOrNull(target) {
  try {
    return await fsp.stat(target)
  } catch {
    return null
  }
}

async function serveStatic(root, request, options) {
  const { runtimeConfig, csp, logger, stats } = options
  const requestUrl = new URL(request.url)
  let filePath = resolveAssetPath(root, requestUrl.pathname)
  if (!filePath) {
    if (stats) stats.pathRejected = (stats.pathRejected || 0) + 1
    return notFound(`路径非法：${requestUrl.pathname}`)
  }

  let stat = await statOrNull(filePath)
  if (stat && stat.isDirectory()) {
    filePath = path.join(filePath, 'index.html')
    stat = await statOrNull(filePath)
  }
  if (!stat || !stat.isFile()) {
    // SPA 回退：本项目只有单一路由（app/page.tsx），agent/session 状态走查询串。
    // 带扩展名却找不到 → 真 404，避免把拼错的资源路径也回成 HTML。
    if (path.extname(filePath) === '') {
      filePath = path.join(root, 'index.html')
      stat = await statOrNull(filePath)
    }
    if (!stat || !stat.isFile()) {
      if (stats) stats.notFound = (stats.notFound || 0) + 1
      return notFound(`资源不存在：${requestUrl.pathname}`)
    }
  }
  if (stats) stats.staticHits = (stats.staticHits || 0) + 1

  const isIndex = path.basename(filePath) === 'index.html'
  let payload = await fsp.readFile(filePath)

  const headers = new Headers()
  headers.set('content-type', mimeFor(filePath))
  headers.set('x-content-type-options', 'nosniff')

  if (requestUrl.pathname.startsWith('/_next/static/')) {
    // Next 的静态资源带内容哈希，可长期缓存
    headers.set('cache-control', 'public, max-age=31536000, immutable')
  } else if (isIndex) {
    headers.set('cache-control', 'no-store')
  } else {
    headers.set('cache-control', 'no-cache')
  }

  if (isIndex) {
    const result = injectRuntimeConfig(payload.toString('utf8'), runtimeConfig)
    if (!result.injected) {
      if (stats) stats.configInjectFailed = (stats.configInjectFailed || 0) + 1
      logger.error(`[desktop][app://] 运行时配置注入失败（${result.reason}）—— 拒绝降级，返回 500`)
      return configInjectionFailed(result.reason)
    }
    payload = Buffer.from(result.html, 'utf8')
    if (stats) {
      stats.configInjected = (stats.configInjected || 0) + 1
      stats.configCopiesRewritten = (stats.configCopiesRewritten || 0) + (result.replacements || 0)
      if (result.stale > 0) stats.configCopiesStale = (stats.configCopiesStale || 0) + result.stale
    }
    if (result.stale > 0) {
      // 不静默：剩余副本意味着产物结构与预期不符（多半是 Next 升级改了转义层数）。
      // 冒烟报告会据此判失败（见 diagnostic/smoke.js collectFailures）。
      logger.warn(
        `[desktop][app://] 仍有 ${result.stale} 份 window.__APP_CONFIG__ 副本未被改写` +
          `（发现 ${result.sites} 处赋值点，改写了 ${result.replacements} 处，转义层 ${JSON.stringify(result.levels)}）`
      )
    }
    if (csp) headers.set('content-security-policy', csp)
    headers.set('x-polymind-runtime-config-injected', '1')
    headers.set('x-polymind-runtime-config-copies', String(result.replacements || 0))
  }

  return new Response(request.method === 'HEAD' ? null : payload, { status: 200, headers })
}

/**
 * 挂载 app:// 处理器（必须在 app.whenReady() 之后调用）。
 *
 * @param {object} options
 * @param {string} options.rendererDir  静态站点根目录（desktop/renderer）
 * @param {string} options.apiTarget    后端地址，例如 http://127.0.0.1:8000
 * @param {object} [options.runtimeConfig] 写入 window.__APP_CONFIG__ 的对象
 * @param {boolean} [options.enableCsp] 是否下发 CSP
 * @param {Console} [options.logger]
 */
function installAppProtocol(options) {
  const {
    rendererDir,
    apiTarget,
    runtimeConfig = {},
    enableCsp = false,
    logger = console,
    stats = null,
  } = options
  const root = path.resolve(rendererDir)

  if (!fs.existsSync(path.join(root, 'index.html'))) {
    throw new Error(
      `app:// 托管目录缺少 index.html：${root}\n先执行：node desktop/build-renderer.mjs`
    )
  }

  const csp = enableCsp ? DEFAULT_CSP : null

  protocol.handle(SCHEME, async request => {
    const trace = process.env.POLYMIND_DESKTOP_TRACE === '1'
    const t0 = Date.now()
    const finish = response => {
      if (trace) {
        logger.log(
          `[trace] app:// ${request.method} ${new URL(request.url).pathname} -> ${response.status} (${Date.now() - t0}ms)`
        )
      }
      return response
    }
    try {
      const requestUrl = new URL(request.url)

      if (requestUrl.hostname !== HOST) {
        return finish(notFound(`未知 host：${requestUrl.hostname}`))
      }

      // 1) 后端接口 —— 等价于现状 nginx 的 location /api/
      if (requestUrl.pathname === API_PREFIX || requestUrl.pathname.startsWith(API_PREFIX + '/')) {
        return finish(
          await proxyApiRequest(request, { apiTarget, prefix: API_PREFIX, logger, stats })
        )
      }

      // 2) Vercel Analytics 采集端点：桌面端不外发遥测，直接 204。
      //    不放行的话页面会持续产生失败请求（现状部署里它走的是真实网络）。
      if (requestUrl.pathname.startsWith('/_vercel/')) {
        if (stats) stats.telemetryBlocked = (stats.telemetryBlocked || 0) + 1
        return finish(new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } }))
      }

      // 3) 其余一律当静态资源
      return finish(await serveStatic(root, request, { runtimeConfig, csp, logger, stats }))
    } catch (err) {
      logger.error(`[desktop][app://] 处理失败 ${request.url}\n`, err)
      return new Response(
        JSON.stringify({
          detail: 'desktop protocol error',
          error: String((err && err.message) || err),
        }),
        { status: 500, headers: { 'content-type': 'application/json; charset=utf-8' } }
      )
    }
  })

  logger.log(
    `[desktop] app:// 已挂载：root=${root} apiTarget=${apiTarget} apiPrefix=${API_PREFIX} csp=${csp ? 'on' : 'off'}`
  )
}

module.exports = {
  ORIGIN,
  registerAppScheme,
  installAppProtocol,
  injectRuntimeConfig,
  safeOrigin,
}
