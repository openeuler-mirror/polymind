'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { Artifact } from '@/lib/types'
import { fetchArtifactText, fetchArtifactBlob } from '@/lib/artifacts'

/** 加载产物文本内容：优先内联 content；缺失时从文件端点拉取（带鉴权头）。
 *  通过调用方 `key={artifact.id}` 在切换产物时强制重挂载，确保 fetched/fetching 状态不串台。 */
export function useArtifactTextContent(
  artifact: Artifact,
  agentId?: string
): { text: string; loading: boolean } {
  const needsFetch = artifact.content == null && !!agentId && !!artifact.relativePath
  const [fetched, setFetched] = useState('')
  const [fetching, setFetching] = useState(needsFetch)

  useEffect(() => {
    if (!needsFetch) return
    let cancelled = false
    fetchArtifactText(agentId!, artifact.relativePath)
      .then(t => {
        if (!cancelled) {
          setFetched(t)
          setFetching(false)
        }
      })
      .catch(() => {
        if (!cancelled) setFetching(false)
      })
    return () => {
      cancelled = true
    }
  }, [artifact.id, artifact.content, artifact.relativePath, agentId, needsFetch])

  const text = artifact.content != null ? artifact.content : fetched
  const loading = needsFetch ? fetching : false
  return { text, loading }
}

/** 带鉴权头拉取产物媒体（图/视频/PDF）并生成 object URL；卸载/切换时自动 revoke。
 *  组件仅在存在 agentId + relativePath 时挂载，故 loading 初始即为 true。 */
export function useArtifactMediaSrc(artifact: Artifact, agentId: string) {
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    fetchArtifactBlob(agentId, artifact.relativePath)
      .then(blob => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setSrc(objectUrl)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setError(true)
        setLoading(false)
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [artifact.id, artifact.relativePath, agentId])

  return { src, loading, error }
}

export function PreviewLoading() {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 p-8 text-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">加载产物内容…</p>
    </div>
  )
}

export function UnsupportedHint({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-40 items-center justify-center p-6 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}
