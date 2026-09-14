#!/usr/bin/env node
/**
 * 把 PolyMind 前端构建成**纯静态站点**并收集到 desktop/renderer/，供 app:// 协议托管。
 *
 * 用法：
 *   node build-renderer.mjs                 # 构建 + 收集
 *   node build-renderer.mjs --skip-build    # 只收集（复用上一次的 .next-export/）
 *
 * 除了"搬文件"，本脚本还会对收集到的 CSS 做一处**桌面端专属**改写：
 * 剥掉 @media (hover: hover) 外壳（原因见 patchHoverMedia）。
 *
 * 关于构建期环境变量：app/layout.tsx 会把构建时 process.env 里的 window.__APP_CONFIG__
 * 内联进 HTML，而仓库根目录的 .env 会被 Next 自动加载，从而把开发机地址**烘焙进产物**。
 * 桌面端要求配置在**运行时**决定（见 src/runtime-config.js），所以这里统一清空这些 key；
 * 确需烘焙时用 POLYMIND_BAKE_<KEY>=value 显式指定。
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..')
const OUT_DIR = path.join(HERE, 'renderer')
const NEXT_BIN = path.join(REPO_ROOT, 'node_modules', 'next', 'dist', 'bin', 'next')

/**
 * 可注入前端的 key 白名单 —— 唯一真相源 src/public-env-keys.json，同一份文件还被
 * app/config/index.ts（构建期内联）与 src/runtime-config.js（运行时注入）使用。
 */
const PUBLIC_ENV_KEYS = JSON.parse(
  fs.readFileSync(path.join(HERE, 'src', 'public-env-keys.json'), 'utf8')
)

/** Next 在自定义 distDir 时会把静态导出写到 distDir，而不是默认的 out/。两个都探测。 */
const EXPORT_CANDIDATES = ['.next-export', 'out']

function log(msg) {
  process.stdout.write(`[build-renderer] ${msg}\n`)
}

function dirSize(dir) {
  let total = 0
  let files = 0
  const stack = [dir]
  while (stack.length) {
    const cur = stack.pop()
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const p = path.join(cur, entry.name)
      if (entry.isDirectory()) stack.push(p)
      else if (entry.isFile()) {
        total += fs.statSync(p).size
        files += 1
      }
    }
  }
  return { total, files }
}

function buildEnv() {
  const env = { ...process.env }
  // 1) 清空所有可注入前端的 key —— 阻断 .env 把开发机地址烘焙进产物
  for (const key of PUBLIC_ENV_KEYS) env[key] = ''
  // 2) 显式烘焙：POLYMIND_BAKE_NEXT_PUBLIC_AGENTD_API_URL=/api ...
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith('POLYMIND_BAKE_')) env[k.slice('POLYMIND_BAKE_'.length)] = v
  }
  env.POLYMIND_BUILD_TARGET = 'static'
  env.NEXT_TELEMETRY_DISABLED = '1'
  delete env.NODE_OPTIONS
  return env
}

function runBuild(env) {
  if (!fs.existsSync(NEXT_BIN)) {
    throw new Error(`找不到 next 可执行文件: ${NEXT_BIN}（先在仓库根目录 pnpm install）`)
  }
  log('开始静态导出：POLYMIND_BUILD_TARGET=static next build')
  const res = spawnSync(process.execPath, [NEXT_BIN, 'build'], {
    cwd: REPO_ROOT,
    env,
    stdio: 'inherit',
  })
  if (res.error) throw res.error
  if (res.status !== 0) throw new Error(`next build 失败，退出码 ${res.status}`)
  log('next build 完成')
}

function locateExport() {
  for (const name of EXPORT_CANDIDATES) {
    const dir = path.join(REPO_ROOT, name)
    if (fs.existsSync(path.join(dir, 'index.html'))) return dir
  }
  throw new Error(
    `没有找到静态导出产物（已探测：${EXPORT_CANDIDATES.join(', ')}）；检查 next.config.js 的 output: 'export'`
  )
}

function collect(exportDir) {
  fs.rmSync(OUT_DIR, { recursive: true, force: true })
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.cpSync(exportDir, OUT_DIR, { recursive: true })
  log(`已收集 ${path.relative(REPO_ROOT, exportDir)}/ → desktop/renderer/`)
}

/** 只匹配"纯粹就是 hover 能力查询"的媒体查询；带 and / 逗号的组合一律不碰。 */
const HOVER_ONLY_MEDIA = /^\s*\(\s*(?:any-)?hover\s*:\s*hover\s*\)\s*$/

/** 从 css[open] 处的 '{' 找到配对的 '}'，返回该 '}' 的下标。 */
function matchBrace(css, open) {
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  throw new Error(`CSS 花括号不配对（位置 ${open}）`)
}

/**
 * 把 @media (hover: hover){ ... } 的外壳剥掉，内容原样上提。
 *
 * 为什么要动上游产物：Tailwind v4 的 hover 变体（含 group-hover / peer-hover）统一编译成
 * `@media (hover: hover){ &:hover }`，这层媒体查询问的是**设备能力**而不是"鼠标此刻在不在上面"。
 * Chromium 在不少 Linux 环境里会把这个能力判成 none —— 只要它把输入设备归类成触摸设备
 * （典型如虚拟机里的绝对定位指针 "QEMU USB Tablet"，或带触摸屏的机器），就返回
 * hover:none / pointer:coarse。此时 `:hover` 状态本身照常工作，但所有 hover: 工具类都不再生效：
 * 消息下方"复制 / 重新生成 / 用量"这类悬停才出现的操作行永远不显示（网页端正常是因为
 * 浏览器不同或机器不同）。桌面壳永远是"有鼠标的桌面"，这层能力查询没有意义，所以剥掉。
 *
 * 只处理参数**恰好**是 hover 能力查询的块；`@media (hover: hover) and (min-width: 768px)`
 * 这类组合查询保持原样（避免误删别的条件），并计入 skipped 供日志暴露。
 */
function unwrapHoverMedia(css) {
  let out = ''
  let i = 0
  let unwrapped = 0
  let skipped = 0
  for (;;) {
    const at = css.indexOf('@media', i)
    if (at === -1) {
      out += css.slice(i)
      break
    }
    // 读媒体查询参数：到深度为 0 的 '{' 为止
    let j = at + '@media'.length
    let depth = 0
    for (; j < css.length; j++) {
      const ch = css[j]
      if (ch === '(') depth++
      else if (ch === ')') depth--
      else if (ch === '{' && depth === 0) break
    }
    const params = css.slice(at + '@media'.length, j)
    if (HOVER_ONLY_MEDIA.test(params)) {
      const end = matchBrace(css, j)
      out += css.slice(i, at) + css.slice(j + 1, end)
      unwrapped += 1
      i = end + 1
    } else {
      if (params.includes('hover')) skipped += 1
      out += css.slice(i, j + 1)
      i = j + 1
    }
  }
  return { css: out, unwrapped, skipped }
}

/** 对收集后的 renderer/ 里每个 CSS 文件做一遍 hover 媒体查询剥离，原地写回。 */
function patchHoverMedia() {
  const targets = []
  const stack = [OUT_DIR]
  while (stack.length) {
    const cur = stack.pop()
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const p = path.join(cur, entry.name)
      if (entry.isDirectory()) stack.push(p)
      else if (entry.isFile() && entry.name.endsWith('.css')) targets.push(p)
    }
  }

  let files = 0
  let unwrapped = 0
  let skipped = 0
  for (const file of targets) {
    const before = fs.readFileSync(file, 'utf8')
    const res = unwrapHoverMedia(before)
    skipped += res.skipped
    if (res.unwrapped === 0) continue
    fs.writeFileSync(file, res.css)
    files += 1
    unwrapped += res.unwrapped
  }

  if (unwrapped === 0) {
    log('未发现 @media (hover: hover)：上游可能已自行处理，桌面端无需改写')
  } else {
    log(`已剥离 ${unwrapped} 处 @media (hover: hover)（${files} 个 CSS 文件）`)
  }
  if (skipped > 0) {
    // 不判失败：组合查询本就该原样保留。但值得记一笔，方便排查"某处悬停仍不生效"。
    log(`注意：${skipped} 处含 hover 的组合媒体查询被原样保留（非纯能力查询）`)
  }
}

function report(exportDir) {
  const size = dirSize(OUT_DIR)
  const top = fs
    .readdirSync(OUT_DIR, { withFileTypes: true })
    .map(e => (e.isDirectory() ? e.name + '/' : e.name))
    .sort()

  const indexHtml = fs.readFileSync(path.join(OUT_DIR, 'index.html'), 'utf8')
  const cfgMatch = indexHtml.match(/window\.__APP_CONFIG__\s*=\s*(\{[\s\S]*?\})/)
  let baked = null
  try {
    baked = cfgMatch ? JSON.parse(cfgMatch[1]) : null
  } catch {
    baked = '<unparsable>'
  }

  // 静态站点里所有资源引用都应当是相对/根路径（app://polymind/ 下同样成立）
  const absoluteRefs = new Set()
  for (const m of indexHtml.matchAll(/(?:src|href)="(\/[^"]*)"/g)) {
    absoluteRefs.add(m[1].split('/').slice(0, 3).join('/'))
  }
  const inlineScripts = (indexHtml.match(/<script(?![^>]*\ssrc=)[^>]*>/g) || []).length
  const externalScripts = (indexHtml.match(/<script[^>]*\ssrc=/g) || []).length

  const info = {
    builtAt: new Date().toISOString(),
    source: path.relative(REPO_ROOT, exportDir),
    files: size.files,
    bytes: size.total,
    mib: Number((size.total / 1024 / 1024).toFixed(2)),
    topLevel: top,
    indexHtmlBytes: fs.statSync(path.join(OUT_DIR, 'index.html')).size,
    inlineScripts,
    externalScripts,
    refPrefixes: Array.from(absoluteRefs).sort(),
    bakedAppConfig: baked,
  }
  fs.writeFileSync(path.join(OUT_DIR, '.build-info.json'), JSON.stringify(info, null, 2))
  log('构建摘要：\n' + JSON.stringify(info, null, 2))
  return info
}

function main() {
  const skipBuild = process.argv.includes('--skip-build')
  if (!skipBuild) runBuild(buildEnv())
  else log('--skip-build：复用已有导出产物')

  const exportDir = locateExport()
  collect(exportDir)
  patchHoverMedia()
  const info = report(exportDir)

  // 硬性校验：renderer 必须能独立成立，否则 app:// 下必然白屏
  const problems = []
  if (!fs.existsSync(path.join(OUT_DIR, 'index.html'))) problems.push('缺少 index.html')
  if (!fs.existsSync(path.join(OUT_DIR, '_next', 'static')))
    problems.push('缺少 _next/static（JS/CSS 未被收集）')
  if (info.files < 20) problems.push(`文件数异常偏少：${info.files}`)
  if (problems.length) {
    console.error('[build-renderer] 校验失败： ' + problems.join('; '))
    process.exitCode = 1
    return
  }
  log(`OK：${info.files} 个文件 / ${info.mib} MiB，可直接被 app:// 托管`)
}

main()
