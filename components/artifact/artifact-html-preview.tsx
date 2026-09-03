'use client'

import type { Artifact } from '@/lib/types'
import { SandboxIframe } from './sandbox-iframe'
import { useArtifactTextContent, PreviewLoading } from './artifact-common'

export function HtmlPreview({
  artifact,
  agentId,
  reloadKey,
}: {
  artifact: Artifact
  agentId?: string
  reloadKey: number
}) {
  const { text, loading } = useArtifactTextContent(artifact, agentId)
  if (loading) return <PreviewLoading />
  return (
    <SandboxIframe
      html={text}
      reloadKey={reloadKey}
      onOpenLink={url => {
        // 宿主侧二次校验：只允许 http/https 协议，其余（javascript: 等）一律丢弃
        try {
          const parsed = new URL(url, window.location.href)
          if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            window.open(parsed.href, '_blank', 'noopener,noreferrer')
          }
        } catch {
          // 非法 URL，忽略
        }
      }}
    />
  )
}
