'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import { RotateCw, TimerOff } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * 产物沙箱渲染器（安全边界核心）。
 *
 * 安全策略：
 * 1. sandbox 只开 `allow-scripts`，【绝不允许】与 `allow-same-origin` 同开——
 *    sandbox iframe 因此获得不透明 origin（字面量 'null'），拿不到主站 cookie/localStorage/DOM。
 * 2. 用 `srcDoc` 内联渲染；桥接脚本放在 <head>，先于产物脚本执行，保证「就绪」信号
 *    不会被产物脚本死循环 / 未闭合 <script> 吞掉（修复原先「正常产物也被判未响应」的误报）。
 * 3. DOMPurify 清洗（剥离事件处理器 / javascript: 等危险构造），并放行 <script> 与 <link>——
 *    依赖沙箱不透明 origin 兜底，使 Tailwind CDN / React UMD 等脚本型样式库、Bootstrap / Google Fonts 等外链 CSS 均可加载。
 * 4. CSP 放行 https 外链资源（script/style/img/font/media），非 https 一律阻断；
 *    connect-src 设为 'none'：禁止产物脚本 fetch/XHR/WS 主动外发，堵住「产物内容自我外泄」通道。
 *    即便产物内嵌恶意脚本，也拿不到宿主数据，也无法把自身内容回传攻击者——
 *    不透明 origin 仍是隔离边界，产物拿不到宿主任何数据可外泄。
 * 5. 桥接脚本拦截外链 / window.open，postMessage 交回宿主；宿主校验 origin==='null' + type 白名单，
 *    并额外校验目标 URL 的 scheme 后再 window.open。
 * 6. 超时兜底：内容或重建变化后 10s 内未收到 sandbox-ready 且无新内容 → 提供「继续等待 / 重新加载」。
 */

// 安全红线：硬编码唯一合法的 sandbox token。禁止在本组件内追加 allow-same-origin。
const SANDBOX_TOKEN = 'allow-scripts'

// 死循环/卡死兜底阈值（内容静默后开始计时）
const BRIDGE_TIMEOUT_MS = 10_000

// 流式增量防抖：合并短时间内的多次 delta，避免 srcdoc 变化导致 iframe 整页重载（闪烁/卡顿）
const STREAM_DEBOUNCE_MS = 300

// postMessage 白名单（沙箱内只允许发出这几类消息）
const ALLOWED_MESSAGE_TYPES = new Set(['sandbox-ready', 'link-intercepted', 'open-link'])

interface SandboxMessage {
  type: string
  url?: string
  href?: string
}

// 注入沙箱 <head> 的桥接脚本：外链拦截 / window.open 拦截 / 就绪信号
const BRIDGE_SCRIPT = `;(function () {
  function report(type, payload) {
    try { window.parent.postMessage(Object.assign({ type: type }, payload), '*'); } catch (e) {}
  }
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a') : null;
    if (!a || !a.href) return;
    var href = a.getAttribute('href') || '';
    if (/^(javascript|data|vbscript):/i.test(href)) { ev.preventDefault(); return; }
    if (a.target === '_blank' || /^https?:/i.test(a.href) || (a.hostname && a.hostname !== location.hostname)) {
      ev.preventDefault();
      report('link-intercepted', { url: a.href, href: href });
    }
  });
  window.open = function (url) { report('open-link', { url: url }); return null; };
  report('sandbox-ready', {});
})();`

/** 把（可能是完整文档的）HTML 拆成 head / body 两份 innerHTML，用于注入沙箱骨架。 */
function extractDocParts(html: string): { head: string; body: string } {
  // DOMParser 仅在浏览器存在；SSR/无 DOM 环境退回「整体当 body」的最小路径。
  if (typeof DOMParser === 'undefined' || typeof document === 'undefined') {
    return { head: '', body: html }
  }
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    return {
      head: doc.head ? doc.head.innerHTML : '',
      body: doc.body ? doc.body.innerHTML : html,
    }
  } catch {
    return { head: '', body: html }
  }
}

function buildSrcdoc(html: string): string {
  // SSR/无 DOM 环境：DOMPurify 在 Node 下导出的是工厂函数（无 .sanitize），调用会抛错，
  // 且这里不需要在服务端产出最终 srcdoc（客户端水合后会重建）。退回「整体当 body」的最小路径。
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return html
  }
  // 放行 https 外链资源（脚本/样式/字体/图片/媒体），其余一律阻断（default-src 'none'），
  // connect-src 用 'none' 阻断产物脚本主动外发。
  const csp =
    "default-src 'none'; " +
    "script-src 'unsafe-inline' https:; " +
    "style-src 'unsafe-inline' https:; " +
    'img-src https: data: blob:; ' +
    'font-src https: data:; ' +
    'media-src https: data: blob:; ' +
    "connect-src 'none';"
  // WHOLE_DOCUMENT: true 让 DOMPurify 保留 <head>（默认只返回 <body> 子树，
  // 会把 <head> 里的 <link>/<style>/<script>/<meta> 全部剥掉，导致「只有骨架没有样式」）。
  const sanitized = DOMPurify.sanitize(html, { ...SANITIZE_OPTIONS, WHOLE_DOCUMENT: true })
  const { head, body } = extractDocParts(sanitized)
  return [
    '<!DOCTYPE html><html><head>',
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    '<style>html,body{margin:0;padding:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;}</style>',
    `<script>${BRIDGE_SCRIPT}<\/script>`,
    head,
    '</head><body>',
    body,
    '</body></html>',
  ].join('')
}
// DOMPurify 配置（沙箱不透明 origin 是真正边界）：
// - 放行 <script>（Tailwind CDN、React UMD 等脚本型样式库）与 <link>（Bootstrap / Google Fonts 等外链 CSS）。
//   DOMPurify 默认允许标签不含 link，此前外链样式会被整个剥掉，导致「只有骨架没有样式」。
// - 保留 CDN script / link 常见属性（href/rel/media/type 等本就在默认允许属性内，显式列出以防版本差异）。
const SANITIZE_OPTIONS = {
  // WHOLE_DOCUMENT true 时（在 buildSrcdoc 里传入）DOMPurify 才会保留 <html><head><body> 结构；
  // 默认只返回 <body> 子树，会把 <head> 中的 <link>/<style>/<script>/<meta> 全部剥掉——
  // 这正是「HTML 只有骨架没有样式」的根因。
  ADD_TAGS: ['script', 'link', 'meta'],
  ADD_ATTR: [
    'integrity',
    'crossorigin',
    'defer',
    'async',
    'nomodule',
    'referrerpolicy',
    'type',
    'src',
    'rel',
    'media',
    'as',
    'href',
    // meta 标签常用属性（charset / viewport），用于保留产物头部元信息
    'charset',
    'content',
    'name',
  ],
}

/** 流式防抖：值稳定 delay 毫秒后才提交，用于合并连续多次 artifact.delta。 */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function SandboxIframe({
  html,
  onOpenLink,
  reloadKey = 0,
}: {
  html: string
  onOpenLink?: (url: string) => void
  /** 外部刷新信号（工具栏「重新加载」）：数值变化即重建 iframe。 */
  reloadKey?: number
}) {
  const renderHtml = useDebouncedValue(html, STREAM_DEBOUNCE_MS)
  const srcdoc = useMemo(() => buildSrcdoc(renderHtml), [renderHtml])

  // 用 srcdoc 作为 key：内容变化即整体重建子组件，天然重置超时/就绪状态，无需在 effect 里 setState。
  return <SandboxFrame key={srcdoc} srcdoc={srcdoc} onOpenLink={onOpenLink} reloadKey={reloadKey} />
}

function SandboxFrame({
  srcdoc,
  onOpenLink,
  reloadKey,
}: {
  srcdoc: string
  onOpenLink?: (url: string) => void
  reloadKey: number
}) {
  const [loadKey, setLoadKey] = useState(0)
  const [timedOut, setTimedOut] = useState(false)
  const [pendingExtend, setPendingExtend] = useState(0)
  const receivedReadyRef = useRef(false)

  // 超时兜底：内容/重建/延长操作变化后，10s 内未收到 sandbox-ready → 判定为未加载/死循环。
  useEffect(() => {
    receivedReadyRef.current = false
    const timer = setTimeout(() => {
      if (!receivedReadyRef.current) setTimedOut(true)
    }, BRIDGE_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [srcdoc, loadKey, reloadKey, pendingExtend])

  // postMessage 白名单通道：origin === 'null'（不透明 origin）+ type 白名单双重校验
  useEffect(() => {
    const handleMessage = (e: MessageEvent<SandboxMessage>) => {
      if (e.origin !== 'null') return
      const data = e.data
      if (!data || typeof data.type !== 'string') return
      if (!ALLOWED_MESSAGE_TYPES.has(data.type)) return
      if (data.type === 'sandbox-ready') {
        receivedReadyRef.current = true
        setTimedOut(false)
        return
      }
      const url = data.url || data.href
      if (url && onOpenLink) onOpenLink(url)
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [onOpenLink])

  const handleReload = useCallback(() => {
    setTimedOut(false)
    setLoadKey(k => k + 1)
  }, [])

  const handleKeepWaiting = useCallback(() => {
    setTimedOut(false)
    setPendingExtend(k => k + 1)
  }, [])

  if (timedOut) {
    return (
      <div className="flex h-full min-h-40 w-full flex-col items-center justify-center gap-3 rounded-md border border-dashed p-6 text-center">
        <TimerOff className="h-6 w-6 text-muted-foreground/50" />
        <div className="space-y-1">
          <p className="text-sm font-medium">产物未响应</p>
          <p className="text-xs text-muted-foreground">
            可能陷入死循环或加载超时，可选择继续等待或重新加载
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleKeepWaiting}>
            继续等待
          </Button>
          <Button variant="outline" size="sm" onClick={handleReload}>
            <RotateCw className="h-3.5 w-3.5" />
            重新加载
          </Button>
        </div>
      </div>
    )
  }

  return (
    <iframe
      key={`${loadKey}:${reloadKey}`}
      title="产物预览"
      className="h-full w-full border-0 bg-white"
      sandbox={SANDBOX_TOKEN}
      srcDoc={srcdoc}
    />
  )
}
