/**
 * 协议层探针：在渲染进程内验证 app:// 自包含形态是否真的成立。
 * 不作为模块 require，而是被读成文本注入页面执行（见 diagnostic/smoke.js）。
 *
 * 覆盖 8 项，全部只看"能不能用"，不看业务：origin/secure context、运行时配置注入、
 * REST 经 /api 代理、POST 请求体透传、SSE 流式透传、静态资源缓存头、SPA 回退与资源 404、
 * 路径逃逸与未知 host。返回值里绝不包含 token 明文。
 */
;(async () => {
  const started = performance.now()
  const out = {
    href: location.href,
    origin: location.origin,
    protocol: location.protocol,
    isSecureContext: !!window.isSecureContext,
    hasCryptoSubtle: !!(window.crypto && window.crypto.subtle),
    hasLocalStorage: (() => {
      try {
        window.localStorage.setItem('__probe__', '1')
        window.localStorage.removeItem('__probe__')
        return true
      } catch {
        return false
      }
    })(),
  }

  // ---------- 2) 运行时配置
  const cfg = window.__APP_CONFIG__ || {}
  out.runtimeConfig = {
    keys: Object.keys(cfg),
    apiBaseUrl: cfg.NEXT_PUBLIC_AGENTD_API_URL || null,
    appName: cfg.NEXT_PUBLIC_APP_NAME || null,
    // 只报"有没有"，不回传明文
    hasAuthToken: !!cfg.NEXT_PUBLIC_AUTH_TOKEN,
  }

  const base = String(cfg.NEXT_PUBLIC_AGENTD_API_URL || '/api').replace(/\/+$/, '')
  const token = cfg.NEXT_PUBLIC_AUTH_TOKEN
  const authHeaders = token ? { Authorization: 'Bearer ' + token } : {}
  const since = t => Number((t - started).toFixed(1))

  // ---------- 3) REST
  let agentId = null
  let sessionId = null
  try {
    const t0 = performance.now()
    const res = await fetch(base + '/agents', { headers: authHeaders })
    const text = await res.text()
    let data = null
    try {
      data = JSON.parse(text)
    } catch {
      /* 非 JSON */
    }
    const list = Array.isArray(data) ? data : []
    agentId = list[0] && list[0].id ? list[0].id : null
    sessionId = list[0] && list[0].default_session_id ? list[0].default_session_id : null
    out.rest = {
      url: base + '/agents',
      status: res.status,
      ok: res.ok,
      ms: Number((performance.now() - t0).toFixed(1)),
      agentCount: list.length,
      proxied: res.headers.get('x-polymind-desktop-proxy') === '1',
      contentType: res.headers.get('content-type'),
    }
  } catch (err) {
    out.rest = { error: String(err) }
  }

  // ---------- 4) POST 请求体透传（用 /api/echo，由 fixture 提供）
  try {
    const payload = { probe: 'body-forwarding', n: 42 }
    const res = await fetch(base + '/echo', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders),
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => null)
    out.postBody = {
      status: res.status,
      echoed: data && data.body ? data.body : null,
      seenMethod: data && data.method,
      seenAuth: data ? data.sawAuthorization : null,
      matched:
        !!data && data.body && data.body.probe === payload.probe && data.body.n === payload.n,
    }
  } catch (err) {
    out.postBody = { error: String(err) }
  }

  // ---------- 5) SSE 流式（关键项：证明协议层没有把响应整体缓冲）
  const sseTarget =
    agentId && sessionId
      ? base + '/agents/' + agentId + '/sessions/' + sessionId + '/messages/stream/reconnect'
      : base + '/slow-stream'
  try {
    const ac = new AbortController()
    const killer = setTimeout(() => ac.abort(), 8000)
    const t0 = performance.now()
    const res = await fetch(sseTarget, {
      method: sseTarget.endsWith('/slow-stream') ? 'GET' : 'POST',
      headers: Object.assign(
        { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
        authHeaders
      ),
      body: sseTarget.endsWith('/slow-stream') ? undefined : '{}',
      signal: ac.signal,
    })
    const sse = {
      url: sseTarget,
      status: res.status,
      contentType: res.headers.get('content-type'),
      headersAt: since(performance.now()),
      chunkTimes: [],
      chunks: [],
    }
    const reader = res.body && res.body.getReader ? res.body.getReader() : null
    if (reader) {
      const decoder = new TextDecoder()
      for (let i = 0; i < 64; i += 1) {
        const { value, done } = await reader.read()
        if (done) break
        sse.chunkTimes.push(Number((performance.now() - t0).toFixed(1)))
        const text = decoder.decode(value, { stream: true })
        if (sse.chunks.length < 12) sse.chunks.push(text.slice(0, 80))
        if (text.indexOf('[DONE]') !== -1) break
      }
      try {
        await reader.cancel()
      } catch {
        /* ignore */
      }
    }
    // 流式判定：首块必须显著早于最后一块，且块数 > 1
    const gaps = sse.chunkTimes.slice(1).map((t, i) => Number((t - sse.chunkTimes[i]).toFixed(1)))
    sse.chunkCount = sse.chunkTimes.length
    sse.gapsMs = gaps
    sse.streamed = sse.chunkTimes.length > 1 && gaps.some(g => g > 50)
    sse.note =
      sse.chunkTimes.length <= 1
        ? '只有一个块或没有块：可能被缓冲，或后端没有进行中的流'
        : sse.streamed
          ? 'OK：分块到达'
          : '块间隔过小，无法判定是否真流式'
    out.sse = sse
    clearTimeout(killer)
  } catch (err) {
    out.sse = {
      url: sseTarget,
      error: String(err && err.name === 'AbortError' ? 'aborted (8s cap)' : err),
    }
  }

  // ---------- 6) 静态资源 + 缓存头
  try {
    const scriptEl = document.querySelector('script[src^="/_next/static/"]')
    const assetPath = scriptEl
      ? new URL(scriptEl.getAttribute('src'), location.href).pathname
      : null
    if (assetPath) {
      const res = await fetch(assetPath)
      out.staticAsset = {
        path: assetPath,
        status: res.status,
        cacheControl: res.headers.get('cache-control'),
        contentType: res.headers.get('content-type'),
        bytes: (await res.arrayBuffer()).byteLength,
      }
    } else {
      out.staticAsset = { error: '页面上找不到 /_next/static/* 脚本引用' }
    }
  } catch (err) {
    out.staticAsset = { error: String(err) }
  }

  // ---------- 7) SPA 回退 与 资源 404
  try {
    const res = await fetch('/deep/link/without/extension?agent=x')
    out.spaFallback = {
      status: res.status,
      contentType: res.headers.get('content-type'),
      isHtml: (await res.text()).slice(0, 15).toLowerCase().indexOf('<!doctype html') === 0,
    }
  } catch (err) {
    out.spaFallback = { error: String(err) }
  }
  try {
    const res = await fetch('/_next/static/definitely-missing.js')
    out.missingAsset = { status: res.status, expected: 404 }
  } catch (err) {
    out.missingAsset = { error: String(err) }
  }

  // ---------- 8) 路径逃逸 / 未知 host
  const traversalProbes = [
    '/%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    '/..%2f..%2fetc%2fpasswd',
    '/_next/static/..%2f..%2f..%2f..%2f..%2fetc%2fpasswd',
  ]
  out.traversal = []
  for (const p of traversalProbes) {
    const entry = { requested: p, normalizedTo: null, status: null, leaked: false }
    try {
      entry.normalizedTo = new URL(p, location.href).pathname
      const res = await fetch(p)
      entry.status = res.status
      const body = await res.text()
      entry.leaked = body.indexOf('root:x:') !== -1 || body.indexOf('/bin/bash') !== -1
    } catch (err) {
      entry.error = String(err)
    }
    out.traversal.push(entry)
  }

  try {
    const res = await fetch('app://not-polymind/index.html')
    out.unknownHost = { status: res.status, expected: 404 }
  } catch (err) {
    // 两种情况都算"没被打穿"，都可接受：① 未知 host 在 URL 解析阶段就被拒；
    // ② 开了 CSP 时 app://not-polymind 是**另一个 origin**，被 connect-src 'self' 拦掉
    // （TypeError: Failed to fetch）—— 这是探针自身的跨源请求被策略挡住，不是协议层缺陷。
    out.unknownHost = { error: String(err), acceptable: true }
  }

  // ---------- 遥测端点必须被本地吞掉
  try {
    const res = await fetch('/_vercel/insights/view', { method: 'POST', body: '{}' })
    out.telemetry = { status: res.status, expected: 204 }
  } catch (err) {
    out.telemetry = { error: String(err) }
  }

  out.elapsedMs = since(performance.now())
  return out
})()
