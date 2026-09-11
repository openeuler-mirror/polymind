#!/usr/bin/env node
/**
 * 代理语义测试替身：把"后端应当具备的行为"最小化复现出来的本机 HTTP 服务。
 * 每 250ms 吐一个 SSE 事件 —— 真实后端空闲时流会立刻结束，无法验证"有没有被整体缓冲"
 * （详见 README「四」的「为什么必须用 SSE 替身」）。/echo 用来验证 POST 请求体与
 * Authorization 头是否被完整透传。
 *
 * 用法：
 *   node tools/sse-fixture-server.mjs [port]        # 默认 18099
 *   然后：POLYMIND_DESKTOP_API_TARGET=http://127.0.0.1:18099 npm run start:embedded
 */
import http from 'node:http'
import zlib from 'node:zlib'

const PORT = Number(process.argv[2] || process.env.FIXTURE_PORT || 18099)
const SSE_EVENTS = Number(process.env.FIXTURE_SSE_EVENTS || 8)
const SSE_INTERVAL_MS = Number(process.env.FIXTURE_SSE_INTERVAL || 250)

function sseHeaders(res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  })
}

/** 每 SSE_INTERVAL_MS 吐一个事件，最后以 [DONE] 结束。 */
function drip(res, label) {
  sseHeaders(res)
  let n = 0
  res.write(': fixture stream open\n\n')
  const timer = setInterval(() => {
    n += 1
    res.write(`event: fixture\ndata: {"label":"${label}","seq":${n},"t":${Date.now()}}\n\n`)
    if (n >= SSE_EVENTS) {
      res.write('data: [DONE]\n\n')
      clearInterval(timer)
      res.end()
    }
  }, SSE_INTERVAL_MS)
  res.on('close', () => clearInterval(timer))
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  const chunks = []
  req.on('data', c => chunks.push(c))
  req.on('end', () => {
    const rawBody = Buffer.concat(chunks).toString('utf8')
    const pathname = url.pathname
    console.log(`[fixture] ${req.method} ${pathname}`)

    if (pathname === '/agents' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify([
          { id: 'fixture-agent', name: 'Fixture Agent', default_session_id: 'fixture-session' },
        ])
      )
      return
    }

    // POST 请求体 + 鉴权头透传验证
    if (pathname === '/echo') {
      let parsed = null
      try {
        parsed = rawBody ? JSON.parse(rawBody) : null
      } catch {
        parsed = null
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          method: req.method,
          body: parsed,
          rawBodyLength: rawBody.length,
          sawAuthorization: req.headers.authorization ? 'present' : 'absent',
          sawContentType: req.headers['content-type'] || null,
          // 代理应当声明 identity；据此才能安全地剥掉 content-encoding
          sawAcceptEncoding: req.headers['accept-encoding'] || null,
        })
      )
      return
    }

    // 模拟发送消息后的重连流（真实路径）
    if (/^\/agents\/[^/]+\/sessions\/[^/]+\/messages\/stream\/reconnect$/.test(pathname)) {
      drip(res, 'reconnect')
      return
    }

    if (pathname === '/slow-stream') {
      drip(res, 'slow-stream')
      return
    }

    // 一次响应里带**三条** Set-Cookie，用于验证 /api 代理是否把多条全部透传（若用
    // Headers.set() 逐条覆盖就只会剩最后一条 c=3）。实测 Electron 下 Chromium 把该头整个
    // 过滤掉，详见 README「已知边界」7；可在页面里 fetch('/api/multi-cookie') 后查 getSetCookie()。
    if (pathname === '/multi-cookie') {
      res.setHeader('Set-Cookie', [
        'fixture_a=1; Path=/; HttpOnly',
        'fixture_b=2; Path=/; HttpOnly',
        'fixture_c=3; Path=/',
      ])
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, note: 'three Set-Cookie headers' }))
      return
    }

    // 故意无视 accept-encoding: identity，仍然回压缩体并声明 content-encoding: gzip。
    // 用途：验证代理在"编码前提被打破"时会记 apiEncodingMismatch 并 warn，
    // 而不是静默把 content-encoding 剥掉、把压缩字节当明文回给页面。
    if (pathname === '/forbidden-encoding') {
      const body = zlib.gzipSync(Buffer.from(JSON.stringify({ detail: 'fixture: gzip body' })))
      res.writeHead(200, { 'content-type': 'application/json', 'content-encoding': 'gzip' })
      res.end(body)
      return
    }

    if (pathname === '/__fixture_health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          ok: true,
          sseEvents: SSE_EVENTS,
          intervalMs: SSE_INTERVAL_MS,
          routes: [
            '/agents',
            '/echo',
            '/slow-stream',
            '/multi-cookie',
            '/forbidden-encoding',
            '/agents/:id/sessions/:id/messages/stream/reconnect',
          ],
        })
      )
      return
    }

    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ detail: 'fixture: no such route', pathname }))
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(
    `[fixture] listening on http://127.0.0.1:${PORT} （SSE ${SSE_EVENTS} 个事件 / 每 ${SSE_INTERVAL_MS}ms）`
  )
})
