'use strict'
/**
 * /api/* 反向代理：把渲染进程发往 app://polymind/api/... 的请求转发到本地后端。
 *
 * 前端 api.baseUrl 缺省为 '/api'（app/config/index.ts），于是所有接口都落在
 * app://polymind/api/... 上；这时没有 nginx 了，由主进程用 net.fetch（Chromium 网络栈）
 * 转发，语义对齐 start.sh 里 nginx 的 location /api/（去掉 /api 前缀、不缓冲）。
 *
 * 三条刻意保留的能力（少任何一条都会让自包含形态弱于 nginx 形态）：
 *   1. 方法 / 请求头 / 请求体全量透传 —— 发消息用的是 POST + JSON body；
 *   2. 响应体以 ReadableStream 原样回传，**不读成 Buffer** ——
 *      一旦缓冲，SSE 就退化成"流结束后一次性吐出"，前端看起来像卡死；
 *   3. 上游错误映射成 502 + JSON，而不是让渲染进程收到不透明的网络错误。
 */
const { net } = require('electron')

/** RFC 7230 hop-by-hop 头：既不转发也不回传。 */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

/**
 * 回传前必须丢掉的头。我们主动声明 accept-encoding: identity 让上游不要压缩，因此响应体的
 * 编码是确定的；此时若还把 content-encoding / content-length 原样带回去，Chromium 会二次
 * 解码或长度不符。
 */
const STRIP_FROM_RESPONSE = new Set(['content-encoding', 'content-length'])

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS })
}

/**
 * 把 app://.../api/<suffix> 映射到 <apiTarget>/<suffix>，与 nginx 的 `proxy_pass .../`
 * （带尾斜杠）一致：/api 前缀整体被替换掉；apiTarget 自带路径前缀时按目录拼接。
 *
 * ⚠️ 安全关键：suffix 绝不能直接交给 `new URL(suffix, apiTarget)` —— /api//evil.com/x 的
 * suffix 会被当成协议相对 URL，origin 被整个替换（详见 README「六、已落地的安全基线」）。三道闸门缺一不可：
 * ① 拒绝反斜杠；② 前导斜杠只留一个；③ origin / scheme 断言兜底。
 */
function buildUpstreamUrl(requestUrl, apiTarget, prefix) {
  const base = new URL(apiTarget)
  const incoming = new URL(requestUrl)
  let suffix = incoming.pathname.slice(prefix.length)

  if (suffix.includes('\\')) {
    throw new Error('proxy: 请求路径含反斜杠，已拒绝')
  }
  suffix = '/' + suffix.replace(/^\/+/, '')

  const basePath = base.pathname.replace(/\/+$/, '')
  const upstream = new URL(basePath + suffix + incoming.search, base.origin)

  if (upstream.origin !== base.origin) {
    throw new Error(`proxy: 上游 origin 不匹配（${upstream.origin} !== ${base.origin}）`)
  }
  if (upstream.protocol !== 'http:' && upstream.protocol !== 'https:') {
    throw new Error(`proxy: 上游 scheme 非法（${upstream.protocol}）`)
  }
  return upstream
}

/**
 * @param {Request} request  protocol.handle 交进来的请求
 * @param {{apiTarget: string, prefix?: string, logger?: Console, stats?: object}} options
 * @returns {Promise<Response>}
 */
async function proxyApiRequest(request, options) {
  const { apiTarget, prefix = '/api', logger = console, stats } = options || {}
  const method = (request.method || 'GET').toUpperCase()
  if (stats) stats.apiRequests = (stats.apiRequests || 0) + 1

  let upstreamUrl
  try {
    upstreamUrl = buildUpstreamUrl(request.url, apiTarget, prefix)
  } catch (err) {
    return jsonResponse(400, {
      detail: 'desktop proxy: 无法构造上游 URL',
      error: String(err && err.message),
    })
  }

  // ---- 请求头：透传，但去掉 hop-by-hop 与 host（host 由上游 URL 决定）
  const headers = new Headers()
  for (const [key, value] of request.headers) {
    const lower = key.toLowerCase()
    if (lower === 'host' || HOP_BY_HOP.has(lower)) continue
    try {
      headers.set(key, value)
    } catch {
      /* 个别受保护头无法设置，忽略即可 */
    }
  }
  try {
    headers.set('accept-encoding', 'identity') // 自管编码，避免"上游压缩 + 我们已解压"的二次解码
  } catch {
    /* ignore */
  }

  // ---- 请求体：GET/HEAD 无体；其余整体读入（本项目接口都是 JSON，SSE 也是 POST + JSON）
  let body
  if (method !== 'GET' && method !== 'HEAD') {
    const buf = Buffer.from(await request.arrayBuffer())
    if (buf.length) body = buf
  }

  let upstream
  try {
    upstream = await net.fetch(upstreamUrl.toString(), {
      method,
      headers,
      body,
      // 上游可能就是另一个自定义协议（或本机回环），明确绕过自定义协议处理器避免自递归
      bypassCustomProtocolHandlers: true,
    })
  } catch (err) {
    const message = String((err && err.message) || err)
    // 实测（Electron 44 / Chromium，fixture 的 /forbidden-encoding 路由可复现）：上游无视
    // accept-encoding: identity 回了压缩体时，Chromium 在 net.fetch 这一层就以
    // ERR_CONTENT_DECODING_FAILED 失败，响应根本到不了我们手里。真正的风险是**报错指错方向**：
    // 后端明明活着，页面却收到"后端不可达"。所以单独识别，给出确切原因。
    if (message.includes('ERR_CONTENT_DECODING_FAILED')) {
      logger.error(
        `[desktop][proxy] 上游无视 accept-encoding: identity 返回了压缩体：${method} ${upstreamUrl}`
      )
      if (stats) stats.apiEncodingMismatch = (stats.apiEncodingMismatch || 0) + 1
      return jsonResponse(502, {
        detail: 'desktop proxy: 上游响应体编码与本代理不符',
        hint:
          '本代理声明 accept-encoding: identity 以避开二次解码。请让上游不压缩该响应，' +
          '或去掉 content-encoding 声明。',
        target: apiTarget,
        error: message,
      })
    }
    logger.error(`[desktop][proxy] 上游不可达 ${method} ${upstreamUrl} : ${message}`)
    if (stats) stats.apiUpstreamErrors = (stats.apiUpstreamErrors || 0) + 1
    return jsonResponse(502, {
      detail: 'desktop proxy: 后端不可达',
      target: apiTarget,
      error: message,
    })
  }

  // ---- 响应头：透传，过滤 hop-by-hop / 编码相关；Set-Cookie 另行处理
  const responseHeaders = new Headers()
  for (const [key, value] of upstream.headers) {
    const lower = key.toLowerCase()
    if (HOP_BY_HOP.has(lower) || STRIP_FROM_RESPONSE.has(lower)) continue
    if (lower === 'set-cookie') continue // 见下：必须走 append
    try {
      responseHeaders.set(key, value)
    } catch {
      /* ignore */
    }
  }

  // Set-Cookie 必须逐条 append：Headers 迭代把多条逐条吐出，set() 只保留最后一条。
  // ⚠️ 但 Electron 下 Chromium 把它当 forbidden response-header name 整个过滤掉（实测
  // getSetCookie() === []），即当前**无法透传 Cookie**。保留这段是为了换运行时后自动正确；
  // 若后端改用 Cookie 会话，必须换成 net.request 或 session.cookies。详见 README「八、已知边界」7。
  const cookies =
    typeof upstream.headers.getSetCookie === 'function' ? upstream.headers.getSetCookie() : []
  for (const cookie of cookies) responseHeaders.append('set-cookie', cookie)

  // 编码前提的兜底断言：主要路径已在上面 catch 里处理（Chromium 会先失败）；能走到这里还带着
  // content-encoding，说明运行时成功解码了响应体而我们仍要剥掉它 —— 这正是 STRIP_FROM_RESPONSE
  // 存在的理由。不自动重压/解压：那等于在这里猜编码，只把"前提被踩到"记下来。
  const contentEncoding = upstream.headers.get('content-encoding')
  if (contentEncoding && contentEncoding !== 'identity') {
    logger.warn(
      `[desktop][proxy] 上游返回 content-encoding=${contentEncoding}（${method} ${upstreamUrl}），` +
        `该头已被剥除。若响应体随之解码失败，请检查上游是否遵守 accept-encoding: identity。`
    )
    if (stats) stats.apiEncodingMismatch = (stats.apiEncodingMismatch || 0) + 1
  }
  if (!responseHeaders.has('cache-control')) responseHeaders.set('cache-control', 'no-store')
  responseHeaders.set('x-polymind-desktop-proxy', '1')

  // 204/304 不允许带 body
  const noBody = upstream.status === 204 || upstream.status === 304 || method === 'HEAD'
  return new Response(noBody ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText || '',
    headers: responseHeaders,
  })
}

module.exports = { proxyApiRequest, buildUpstreamUrl }
