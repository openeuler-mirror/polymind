'use client'

import type { Artifact } from '@/lib/types'
import { useArtifactMediaSrc, PreviewLoading, UnsupportedHint } from './artifact-common'

export function ImagePreview({ artifact, agentId }: { artifact: Artifact; agentId: string }) {
  const { src, loading, error } = useArtifactMediaSrc(artifact, agentId)
  if (loading) return <PreviewLoading />
  if (error || !src) return <UnsupportedHint text="图片加载失败，请下载后查看" />
  return (
    <div className="flex h-full items-center justify-center p-4">
      <img
        src={src}
        alt={artifact.name}
        className="max-h-full max-w-full rounded-lg object-contain"
      />
    </div>
  )
}

export function VideoPreview({ artifact, agentId }: { artifact: Artifact; agentId: string }) {
  const { src, loading, error } = useArtifactMediaSrc(artifact, agentId)
  if (loading) return <PreviewLoading />
  if (error || !src) return <UnsupportedHint text="视频加载失败，请下载后播放" />
  return (
    <div className="flex h-full items-center justify-center p-4">
      <video controls className="max-h-full max-w-full rounded-lg" src={src} />
    </div>
  )
}

export function PdfPreview({ artifact, agentId }: { artifact: Artifact; agentId: string }) {
  const { src, loading, error } = useArtifactMediaSrc(artifact, agentId)
  if (loading) return <PreviewLoading />
  if (error || !src) return <UnsupportedHint text="PDF 加载失败，请下载后查看" />
  return (
    <div className="h-full w-full bg-white">
      {/* PDF 与 HTML 一样属于不可信产物：用 sandbox 隔离，避免 blob URL 同源 iframe 绕过安全边界。 */}
      <iframe src={src} title={artifact.name} className="h-full w-full border-0" sandbox="" />
    </div>
  )
}
