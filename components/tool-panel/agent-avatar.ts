/** 头像渐变色板：按名称哈希稳定取色。 */
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#22d3ee,#3b82f6)',
  'linear-gradient(135deg,#34d399,#0ea5e9)',
  'linear-gradient(135deg,#fbbf24,#f97316)',
  'linear-gradient(135deg,#f87171,#fb7185)',
  'linear-gradient(135deg,#a78bfa,#6366f1)',
  'linear-gradient(135deg,#f472b6,#a78bfa)',
]

/** 精选智能体封面色板（更通透的纵深渐变）。 */
const COVER_GRADIENTS = [
  'linear-gradient(135deg,#6366f1 0%,#8b5cf6 45%,#ec4899 100%)',
  'linear-gradient(135deg,#06b6d4 0%,#3b82f6 55%,#6366f1 100%)',
  'linear-gradient(135deg,#f59e0b 0%,#f97316 55%,#ef4444 100%)',
  'linear-gradient(135deg,#10b981 0%,#14b8a6 45%,#0ea5e9 100%)',
  'linear-gradient(135deg,#f43f5e 0%,#d946ef 55%,#8b5cf6 100%)',
  'linear-gradient(135deg,#0ea5e9 0%,#06b6d4 50%,#22d3ee 100%)',
]

function hashString(str: string) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return h
}

export const avatarGradient = (name: string) =>
  AVATAR_GRADIENTS[hashString(name || '') % AVATAR_GRADIENTS.length]

export const coverGradient = (name: string) =>
  COVER_GRADIENTS[hashString(name || '') % COVER_GRADIENTS.length]

/** 头像文本：中文取首字，英文取前两词首字母。 */
export function avatarLabel(name: string) {
  const s = (name || '').trim()
  if (!s) return '?'
  if (/[\u4e00-\u9fa5]/.test(s)) return s.slice(0, 1)
  return s.slice(0, 2).toUpperCase()
}
