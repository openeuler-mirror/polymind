'use strict'
/**
 * 证据落盘前的统一脱敏。
 *
 * 渲染进程的 console 会原样进入冒烟报告并写进仓库。桌面端不能依赖"上游不发敏感值"——
 * 前端 lib/http-client.ts 曾把 auth token 打进 console（已删除），一旦谁再打一次，证据文件
 * 里就多一份明文凭据。所以这里做兜底替换：宁可过度脱敏，也不让凭据落盘。
 * 它是诊断链路上唯一带"安全"性质的控件，因此单独成篇，便于单独审、单独测。
 */

const SECRET_RULES = [
  // ① Authorization: Bearer xxx
  [/\b(bearer\s+)[A-Za-z0-9._~+/=-]{4,}/gi, '$1[redacted]'],
  // ② 凭据字段：冒号/等号之后整段视为敏感值。
  //    关键词表刻意收窄到"凭据词"本身 —— 不含裸 secret / key。否则
  //    "normal log without secrets: ..." 这类普通英文会被整行吞掉（实测踩过）。
  [
    /(\b(?:auth[_-]?token|access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|apikey|secret[_-]?key|client[_-]?secret|token|password|passwd|credential)s?["']?\s*[:=]\s*["']?)\S[^\n]*/gi,
    '$1[redacted]',
  ],
  // ③ URL 查询串里的凭据参数
  [/([?&](?:token|access_token|api_key|apikey|key|secret|password)=)[^&\s"']+/gi, '$1[redacted]'],
]

function redactSecrets(text) {
  let out = String(text)
  for (const [pattern, replacement] of SECRET_RULES) out = out.replace(pattern, replacement)
  return out
}

/** 递归脱敏：报告里每个字符串值都过一遍，避免漏掉 bodyText / samples 这类自由文本。 */
function redactDeep(value, depth = 0) {
  if (depth > 12) return value
  if (typeof value === 'string') return redactSecrets(value)
  if (Array.isArray(value)) return value.map(item => redactDeep(item, depth + 1))
  if (value && typeof value === 'object') {
    const out = {}
    for (const [key, item] of Object.entries(value)) out[key] = redactDeep(item, depth + 1)
    return out
  }
  return value
}

module.exports = { SECRET_RULES, redactSecrets, redactDeep }
