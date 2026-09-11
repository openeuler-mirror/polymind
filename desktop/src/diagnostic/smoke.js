'use strict'
/**
 * 冒烟报告 —— 把采集到的证据组装成一份可审计的 JSON 并落盘。
 *
 * 分工：collector.js "边跑边记"（监听器、采样），本文件"收尾出报告"（截图、注入探针、
 * 判失败、脱敏、写盘）。判失败的条件写在这里而不是 main.js，因为它们是关于"页面看着正常、
 * 实际不可用"的业务判断，属于诊断知识，不属于主进程的启动逻辑。
 */
const fs = require('node:fs')
const path = require('node:path')
const { redactDeep } = require('./redact')

/** 探针脚本与 main.js 同处 src/ 根目录。 */
const SRC_DIR = path.join(__dirname, '..')

/** 冒烟 JSON 始终写在截图旁边、同名不同后缀；不依赖 SMOKE_OUT 恰好以 .png 结尾。 */
function smokeJsonPath(pngPath) {
  const base = path.basename(pngPath).replace(/.[^.]*$/, '') || 'smoke'
  return path.join(path.dirname(pngPath), base + '.json')
}

/** 在页面内跑传输层探针（REST / WS / SSE），只读，不触发真实 Agent 运行。 */
async function runInjectedProbe(win, fileName, opts) {
  const source = fs.readFileSync(path.join(SRC_DIR, fileName), 'utf8')
  const prelude = opts ? `const __PROBE_OPTS__ = ${JSON.stringify(opts)};\n` : ''
  return win.webContents
    .executeJavaScript(prelude + source, true)
    .catch(err => ({ probeError: String(err) }))
}

/**
 * 冒烟"判失败"（而不是只记统计）的条件：页面看着正常、实际不可用的那些。
 *
 * @param {object|null} protocolStats app:// 协议层计数（外链覆盖模式下为 null）
 * @param {{requireInjection: boolean}} options requireInjection=false 表示这次没走本地静态前端，
 *        注入计数天然为 0，不能据此判失败。
 */
function collectFailures(protocolStats, options = {}) {
  const { requireInjection = true } = options
  const failures = []
  if (!requireInjection) return failures

  const injected = (protocolStats && protocolStats.configInjected) || 0
  const failed = (protocolStats && protocolStats.configInjectFailed) || 0
  const stale = (protocolStats && protocolStats.configCopiesStale) || 0

  if (stale > 0) {
    // 页面本身还能跑，但产物里残留了一份与运行时不一致的配置副本 —— 这正是
    // "哪天 React 重建那段内联脚本就静默失效"的前兆，所以判失败而不只是记统计。
    failures.push({
      kind: 'runtime-config-stale-copy',
      detail:
        '产物里还有 window.__APP_CONFIG__ 副本未被改写。多半是 Next 产物结构变化' +
        '（例如转义层数变了），请检查 app-protocol.js 的 injectRuntimeConfig 与 MAX_ESCAPE_LEVELS。',
      configCopiesStale: stale,
      configCopiesRewritten: (protocolStats && protocolStats.configCopiesRewritten) || 0,
    })
  }
  if (failed > 0 || injected === 0) {
    failures.push({
      kind: 'runtime-config-injection',
      detail:
        'index.html 的 window.__APP_CONFIG__ 注入失败或从未发生。构建期 NEXT_PUBLIC_* 已被刻意清空，' +
        '此时页面拿到的是空配置（token 为空），表现为"能打开但所有接口静默失败"。',
      configInjected: injected,
      configInjectFailed: failed,
    })
  }
  return failures
}

/** 页面侧快照：回答"用户到底看见了什么"。只报告 token 是否存在，绝不回传明文。 */
function pageProbeSource() {
  return `(() => {
    const cfg = window.__APP_CONFIG__ || null
    return {
      href: location.href,
      title: document.title,
      origin: location.origin,
      isSecureContext: window.isSecureContext,
      configKeys: cfg ? Object.keys(cfg) : [],
      hasAuthToken: !!(cfg && cfg.NEXT_PUBLIC_AUTH_TOKEN),
      apiBaseUrl: cfg ? cfg.NEXT_PUBLIC_AGENTD_API_URL : null,
      wsUrl: cfg ? cfg.NEXT_PUBLIC_WS_URL : null,
      hasDesktopBridge: typeof window.polymindDesktop === 'object',
      rootChildren: document.body ? document.body.children.length : -1,
      bodyText: (document.body ? document.body.innerText : '').slice(0, 400),
      sandboxIframes: Array.from(document.querySelectorAll('iframe[sandbox]')).map(f => f.getAttribute('sandbox')),
    }
  })()`
}

/**
 * @param {import('electron').BrowserWindow} win
 * @param {object} ctx 由 main.js 组装的上下文（见 main.js buildSmokeContext）
 * @returns {Promise<number>} 进程退出码：0 通过，1 有 failures
 */
async function runSmoke(win, ctx) {
  const {
    collector,
    health,
    form,
    target,
    apiTarget,
    csp,
    runtimeConfig,
    protocolStats,
    out,
    settleMs,
    requireInjection,
    transportProbe,
    protocolProbe,
  } = ctx
  const { consoleLogs, pageErrors, failedRequests, failedLoads, samples } = collector.state

  await new Promise(r => setTimeout(r, settleMs))

  const probe = await win.webContents
    .executeJavaScript(pageProbeSource(), true)
    .catch(err => ({ probeError: String(err) }))

  const image = await win.webContents.capturePage()
  fs.writeFileSync(out, image.toPNG())

  const transport = transportProbe ? await runInjectedProbe(win, 'transport-probe.js') : null
  const protocol = protocolProbe ? await runInjectedProbe(win, 'protocol-probe.js') : null

  const report = {
    form,
    target,
    apiTarget: requireInjection ? apiTarget : null,
    csp: requireInjection ? csp : null,
    runtimeConfigKeys: requireInjection ? Object.keys(runtimeConfig) : null,
    health,
    probe,
    protocol,
    protocolStats: requireInjection ? protocolStats : null,
    transport,
    consoleLogs,
    pageErrors,
    failedRequests,
    failedLoads,
    screenshot: out,
    samples,
  }

  const failures = collectFailures(protocolStats, { requireInjection })
  let exitCode = 0
  if (failures.length) {
    report.failures = failures
    exitCode = 1
  }
  const safeReport = redactDeep(report)
  fs.writeFileSync(smokeJsonPath(out), JSON.stringify(safeReport, null, 2))
  console.log('[desktop][smoke] ' + JSON.stringify(safeReport, null, 2))
  return exitCode
}

/** 目标压根不可达时的轻量报告：让 CI 拿到"连不上"的明确证据，而不是只有一张截图。 */
function writeUnreachableReport(out, payload) {
  const safe = redactDeep(payload)
  fs.writeFileSync(smokeJsonPath(out), JSON.stringify(safe, null, 2))
  return safe
}

module.exports = {
  smokeJsonPath,
  runInjectedProbe,
  collectFailures,
  pageProbeSource,
  runSmoke,
  writeUnreachableReport,
}
