'use strict'
/**
 * 诊断器材的统一入口。main.js 只在 NEEDS_DIAGNOSTICS 为真时 require 本目录，因此生产路径
 * （RPM 装出来、用户双击启动）**不会加载**这些代码，主进程里也不存在 console / webRequest /
 * 导航这些监听器 —— 安全评审只需读 main.js，不必先翻过两百行"平时不跑"的采集逻辑。
 *
 *   redact.js     落盘前脱敏（唯一的"安全"性质控件，单独可审）
 *   collector.js  边跑边记（console、失败请求、失败加载、页面采样、导航 trace）
 *   smoke.js      收尾出报告（截图、注入探针、判失败、写 JSON）
 */
const { createCollector } = require('./collector')
const { runSmoke, writeUnreachableReport } = require('./smoke')

module.exports = { createCollector, runSmoke, writeUnreachableReport }
