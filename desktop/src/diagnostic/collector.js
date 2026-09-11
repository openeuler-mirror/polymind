'use strict'
/**
 * 运行期采集器 —— 冒烟自检与排障用的"体检仪"。
 *
 * 单独成文件是为了收敛安全评审面：这些监听器只在 SMOKE / TRACE / SAMPLE 打开时才需要，
 * 而生产路径不会 require 本文件（见 main.js 的 NEEDS_DIAGNOSTICS）。
 * 这里只负责"采集"，不负责"判定"和"出报告"（见 smoke.js）。
 */
const { redactSecrets } = require('./redact')

/** 采样间隔：定位"页面何时从正常变成错误页"用的。 */
const SAMPLE_INTERVAL_MS = 400
/** 单条 console 记录的上限，避免一条巨型日志把报告撑爆。 */
const MAX_CONSOLE_MESSAGE = 500

/** @param {{trace?: boolean, sample?: boolean, logger?: Console}} options */
function createCollector(options = {}) {
  const { trace = false, sample = false, logger = console } = options

  /** 报告里的四个固定桶 + 采样序列。 */
  const state = {
    consoleLogs: [],
    pageErrors: [],
    failedRequests: [],
    failedLoads: [],
    samples: [],
  }

  /** TRACE：逐条导航事件。排障时用来回答"到底是哪一次导航把页面换掉的"。 */
  function attachTrace(wc) {
    wc.on('did-start-navigation', (_e, url, isInPlace, isMainFrame) =>
      logger.log('[trace] did-start-navigation', { url, isInPlace, isMainFrame })
    )
    wc.on('did-navigate', (_e, url, httpCode) =>
      logger.log('[trace] did-navigate', { url, httpCode })
    )
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) =>
      logger.log('[trace] did-navigate-in-page', { url, isMainFrame })
    )
    wc.on('did-finish-load', () => logger.log('[trace] did-finish-load', wc.getURL()))
    wc.on('dom-ready', async () => {
      // 必须 await：原实现直接把 Promise 打了出来（永远是 Promise { <pending> }）。
      const ready = await wc.executeJavaScript('document.readyState').catch(() => '?')
      logger.log('[trace] dom-ready', wc.getURL(), 'readyState=', ready)
    })
    wc.on('render-process-gone', (_e, details) =>
      logger.log('[trace] render-process-gone', details)
    )
    wc.on('preload-error', (_e, preloadPath, err) =>
      logger.log('[trace] preload-error', preloadPath, String(err))
    )
  }

  /** SAMPLE：每 400ms 抓一次页面状态，用于定位"页面何时变白/变错误页"。 */
  function startSampling(wc) {
    const tick = async () => {
      try {
        const snapshot = await wc.executeJavaScript(
          `({ url: location.href, href: location.href, title: document.title,
              origin: location.origin, ready: document.readyState,
              bodyChildren: document.body ? document.body.children.length : -1,
              text: (document.body ? document.body.innerText : '').slice(0, 60).replace(/\\s+/g, ' '),
              lang: document.documentElement.getAttribute('lang'),
              scripts: document.querySelectorAll('script').length,
              stylesheets: document.querySelectorAll('link[rel=stylesheet]').length,
              html: (document.body ? document.body.innerHTML : '').slice(0, 700),
              hasConfig: !!window.__APP_CONFIG__ })`,
          true
        )
        state.samples.push({ t: Date.now(), ...snapshot })
        logger.log('[sample] ' + JSON.stringify(state.samples[state.samples.length - 1]))
      } catch (err) {
        state.samples.push({ t: Date.now(), error: String(err && err.message) })
        logger.log('[sample] error ' + String(err && err.message))
      }
      setTimeout(tick, SAMPLE_INTERVAL_MS)
    }
    tick()
  }

  /** 挂载采集监听器。**必须在导航之前调用**，否则会漏掉启动期的 console 输出与请求失败。 */
  function attach(wc) {
    wc.on('console-message', (...args) => {
      // Electron 35+ 传单个事件对象；旧签名是 (event, level, message, ...)，两种都兼容。
      const e = args[0]
      const level = e && typeof e === 'object' && 'level' in e ? e.level : args[1]
      const message = e && typeof e === 'object' && 'message' in e ? e.message : args[2]
      state.consoleLogs.push({
        level,
        message: redactSecrets(String(message)).slice(0, MAX_CONSOLE_MESSAGE),
      })
    })
    wc.on('render-process-gone', (_e, details) =>
      state.pageErrors.push({ type: 'render-process-gone', details })
    )
    wc.on('unresponsive', () => state.pageErrors.push({ type: 'unresponsive' }))

    // 两个坑：① 模式里的 '*' 只覆盖 http/https（含 ws/wss），app:// 必须显式列出；
    // ② 显式列出 app:// 的前提是该 scheme 已注册 —— main.js 现在**无条件**注册，
    //    所以这个模式表是常量；过去按形态切换时漏掉一条会抛 "Wrong scheme type"。
    try {
      wc.session.webRequest.onCompleted({ urls: ['*://*/*', 'app://*/*'] }, details => {
        if (details.statusCode >= 400) {
          state.failedRequests.push({ url: details.url, status: details.statusCode })
        }
      })
    } catch (err) {
      logger.warn('[desktop] webRequest 过滤规则不可用，跳过失败请求采集:', err.message)
    }

    if (trace) attachTrace(wc)
    if (sample) startSampling(wc)
  }

  /** TRACE：跨 origin 导航判定发生在 main.js 里，这里只负责记一笔。 */
  function noteNavigation(url, current) {
    if (trace) logger.log('[trace] will-navigate', url, 'current=', current)
  }

  function recordFailedLoad(detail) {
    state.failedLoads.push(detail)
  }

  return { state, attach, noteNavigation, recordFailedLoad }
}

module.exports = { createCollector, SAMPLE_INTERVAL_MS, MAX_CONSOLE_MESSAGE }
