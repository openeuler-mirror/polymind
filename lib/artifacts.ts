// ============================================
// 产物（Artifact）工具函数
// ============================================
import type { Artifact, ArtifactType } from './types'
import { appConfig } from '@/app/config/index'

/** 内联产物内容大小上限（512KB，与后端 D3 一致） */
export const INLINE_ARTIFACT_MAX_SIZE = 512 * 1024

/** 后端可能给出的类型字符串 → ArtifactType 归一化（未知返回 null） */
export function normalizeArtifactType(type: string | undefined | null): ArtifactType | null {
  if (!type) return null
  const t = String(type).toLowerCase()
  if (t === 'html') return 'html'
  if (t === 'image') return 'image'
  if (t === 'video') return 'video'
  if (t === 'markdown' || t === 'md') return 'markdown'
  if (t === 'code' || t === 'js' || t === 'css' || t === 'json' || t === 'csv') return 'code'
  if (t === 'pdf') return 'pdf'
  return null
}

/** 按扩展名推断产物类型 */
export function resolveArtifactType(name: string): ArtifactType {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  switch (ext) {
    case 'html':
    case 'htm':
      return 'html'
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
      return 'image'
    case 'mp4':
    case 'webm':
      return 'video'
    case 'md':
    case 'markdown':
      return 'markdown'
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
    case 'css':
    case 'json':
    case 'csv':
      return 'code'
    case 'pdf':
      return 'pdf'
    default:
      return 'unknown'
  }
}

/**
 * 统一代码语言识别：优先取代码块 className 中的 `language-xxx`，否则按文件名扩展名，最后回退 'text'。
 * 供产物代码预览 / 产物 Markdown 预览 / 对话正文三处共用，避免各写一套正则。
 */
export function resolveCodeLanguage(className?: string, fileName?: string): string {
  if (className) {
    const m = /language-([\w+-]+)/i.exec(className)
    if (m) return m[1].toLowerCase()
  }
  if (fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase() || ''
    if (ext) return ext
  }
  return 'text'
}

/** 产物是否内联（文本类且 ≤512KB，可直接用 content 渲染/复制，无需走文件端点） */
export function isInlineArtifact(a: Artifact): boolean {
  if (a.content == null) return false
  const textLike = a.type === 'html' || a.type === 'markdown' || a.type === 'code'
  if (!textLike) return false
  // size 为 0/负数/缺失时视为「未知」，回退用 content 长度——避免后端把 0 当未知时误判为内联。
  const size = a.size && a.size > 0 ? a.size : a.content.length
  return size <= INLINE_ARTIFACT_MAX_SIZE
}

/**
 * 校验并规范化产物相对路径，防御路径穿越 / 绝对路径注入。
 * 该路径来自 LLM/后端（不可信），直接拼进文件端点可能被用来读取任意文件。
 * 返回规范化后的相对路径（仅允许相对、无 `..` 段），非法则抛错（调用方按 fetch 失败兜底处理）。
 */
export function sanitizeArtifactPath(path: string): string {
  const p = String(path || '').replace(/\\/g, '/')
  if (!p) throw new Error('Invalid artifact path: empty')
  if (p.startsWith('/') || /^[a-zA-Z]:/.test(p) || p.includes('\0')) {
    throw new Error('Invalid artifact path: absolute')
  }
  if (p.split('/').some(seg => seg === '..')) {
    throw new Error('Invalid artifact path: traversal')
  }
  return p
}

/** 拼接产物文件端点 URL（受控端点：GET /agents/{agent_id}/workspace/files?path=...） */
export function buildArtifactUrl(agentId: string, relativePath: string): string {
  const base = appConfig.api.baseUrl.replace(/\/+$/, '')
  const safePath = sanitizeArtifactPath(relativePath)
  const params = new URLSearchParams({ path: safePath })
  return `${base}/agents/${encodeURIComponent(agentId)}/workspace/files?${params.toString()}`
}

// 文件端点需要鉴权：统一在此构造请求头，供 fetch / 预览 / 下载共用。
function authHeaders(): Record<string, string> {
  const token = appConfig.auth.token
  return token ? { Authorization: 'Bearer ' + token } : {}
}

/** 带鉴权头拉取产物文件文本内容（HTML/Markdown/代码预览用）。 */
export async function fetchArtifactText(agentId: string, relativePath: string): Promise<string> {
  const res = await fetch(buildArtifactUrl(agentId, relativePath), { headers: authHeaders() })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return res.text()
}

/** 带鉴权头拉取产物文件为 Blob（图片/视频/PDF 预览与下载用）。 */
export async function fetchArtifactBlob(agentId: string, relativePath: string): Promise<Blob> {
  const res = await fetch(buildArtifactUrl(agentId, relativePath), { headers: authHeaders() })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return res.blob()
}

/** 触发浏览器下载（Blob + a.download）。 */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * 触发产物下载：内联文本用 Blob + a.download；否则（超限/二进制）经鉴权 fetch 拉取为 Blob 后下载。
 * 仅客户端调用。
 */
export async function downloadArtifact(a: Artifact, agentId?: string): Promise<void> {
  if (isInlineArtifact(a) && a.content != null) {
    const blob = new Blob([a.content], { type: a.mime || 'text/plain;charset=utf-8' })
    triggerDownload(blob, a.name)
    return
  }
  if (agentId && a.relativePath) {
    try {
      const blob = await fetchArtifactBlob(agentId, a.relativePath)
      triggerDownload(blob, a.name)
    } catch (err) {
      console.error('Failed to download artifact:', err)
    }
  }
}

/** 人类可读的文件大小（无尺寸时返回空串） */
export function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
