'use strict'
/**
 * preload：只暴露"窄接口"，不做任何"能力桥"。
 *
 *  - 沙箱化 preload 的 require('electron') 里**没有 shell**，所以这里既不能也不要桥接
 *    openExternal（外链走 setWindowOpenHandler → openExternalSafely，见 README「六、已落地的安全基线」）。
 *  - 不注入 window.__APP_CONFIG__：embedded 形态由 app:// 协议处理器改写 HTML 注入
 *    （见 app-protocol.js injectRuntimeConfig），比在 preload 里赋值更稳 —— preload 只能改
 *    自己的隔离世界，HTML 里的内联脚本随后会把它覆盖掉。
 */
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('polymindDesktop', {
  platform: process.platform,
  isDesktopShell: true,
})
