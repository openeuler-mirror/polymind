/**
 * 传输层探针：在渲染进程内验证桌面壳下的三条链路。
 * 不被 require，仅作为文本注入页面执行（见 diagnostic/smoke.js runInjectedProbe）。
 *
 * 只读原则：不发送真实消息，避免触发一次真实的 Agent 运行。
 *  1. REST   GET  {base}/agents
 *  2. WS     {base→ws}/agent/sessions/{sid}/ws   （连上即断开）
 *  3. SSE    POST {base}/agents/{aid}/sessions/{sid}/messages/stream/reconnect
 *            —— 挂到"可能存在的进行中流"，不新建运行；4s 后主动断开。
 * 返回值里绝不包含 token 明文。
 */
;(async () => {
  const cfg = window.__APP_CONFIG__ || {}
  const base = String(cfg.NEXT_PUBLIC_AGENTD_API_URL || '/api').replace(/\/+$/, '')
  const token = cfg.NEXT_PUBLIC_AUTH_TOKEN
  const authHeaders = token ? { Authorization: 'Bearer ' + token } : {}
  const out = { baseUrl: base, hasToken: !!token }

  // 1) REST
  let agentId = null
  let sessionId = null
  try {
    const res = await fetch(base + '/agents', { headers: authHeaders })
    let data = null
    try {
      data = await res.json()
    } catch {
      /* ignore */
    }
    const list = Array.isArray(data) ? data : []
    agentId = list[0] && list[0].id ? list[0].id : null
    sessionId = list[0] && list[0].default_session_id ? list[0].default_session_id : null
    out.rest = {
      status: res.status,
      ok: res.ok,
      agentCount: list.length,
      agentId,
      sessionId,
      corsHeader: res.headers.get('access-control-allow-origin'),
    }
  } catch (err) {
    out.rest = { error: String(err) }
  }

  // 2) WebSocket —— WebSocket 构造函数只接受 http/https/ws/wss 四种 scheme，而自包含形态
  //    页面 origin 是 app://polymind，因此**无法**对 /api/... 建 WS 连接。这是规范层面的硬
  //    约束，不是配置问题（详见 README「八、已知边界」1）；将来要启用必须换成本机真实 ws:// 端口。
  if (agentId && sessionId) {
    let wsUrl = null
    try {
      const u = new URL(base + '/agent/sessions/' + sessionId + '/ws', location.href)
      u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
      wsUrl = u.toString()
    } catch {
      // location.href 解析失败时退回到相对路径拼接（探针只读，不重试）
      wsUrl = base + '/agent/sessions/' + sessionId + '/ws'
    }
    out.wsUrl = wsUrl
    out.wsSchemeSupported = /^(ws|wss):$/.test(new URL(wsUrl, location.href).protocol)
    if (!out.wsSchemeSupported) {
      out.ws = {
        result: 'unsupported-scheme',
        note: 'app:// 页面无法构造 WebSocket；需要本机真实 ws:// 端口才能支持',
      }
    } else {
      out.ws = await new Promise(resolve => {
        let settled = false
        const done = v => {
          if (!settled) {
            settled = true
            resolve(v)
          }
        }
        try {
          const ws = new WebSocket(wsUrl)
          const timer = setTimeout(() => {
            done({ result: 'no-event-within-8s' })
            try {
              ws.close()
            } catch {}
          }, 8000)
          ws.onopen = () => {
            clearTimeout(timer)
            done({ result: 'open' })
            try {
              ws.close()
            } catch {}
          }
          ws.onclose = ev => {
            clearTimeout(timer)
            done({ result: 'closed', code: ev.code, reason: String(ev.reason).slice(0, 120) })
          }
          ws.onerror = () => {
            clearTimeout(timer)
            done({ result: 'error' })
          }
        } catch (err) {
          done({ result: 'throw', error: String(err) })
        }
      })
    }
  }

  // 3) SSE（不新建运行；仅验证代理/后端是否把 text/event-stream 透传为可增量读取的流）
  if (agentId && sessionId) {
    const ac = new AbortController()
    const killer = setTimeout(() => ac.abort(), 4000)
    try {
      const res = await fetch(
        base + '/agents/' + agentId + '/sessions/' + sessionId + '/messages/stream/reconnect',
        {
          method: 'POST',
          headers: Object.assign(
            { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
            authHeaders
          ),
          body: '{}',
          signal: ac.signal,
        }
      )
      const sse = {
        status: res.status,
        contentType: res.headers.get('content-type'),
        cacheControl: res.headers.get('cache-control'),
        bufferingHint: res.headers.get('x-accel-buffering'),
      }
      const reader = res.body && res.body.getReader ? res.body.getReader() : null
      if (reader) {
        const chunk = await Promise.race([
          reader.read(),
          new Promise(r => setTimeout(() => r({ timeout: true }), 2500)),
        ])
        if (chunk && chunk.value) {
          sse.firstChunk = new TextDecoder().decode(chunk.value).slice(0, 300)
          sse.incrementalRead = true
        } else if (chunk && chunk.done) {
          sse.firstChunk = null
          sse.note = 'stream ended immediately (no active run)'
        } else {
          sse.note = 'no chunk within 2.5s (long-poll style, expected when idle)'
        }
        try {
          reader.cancel()
        } catch {}
      } else {
        sse.note = 'no readable stream body'
      }
      out.sse = sse
    } catch (err) {
      out.sse = {
        error: String(err && err.name === 'AbortError' ? 'aborted-by-probe (expected)' : err),
      }
    } finally {
      clearTimeout(killer)
    }
  }

  return out
})()
