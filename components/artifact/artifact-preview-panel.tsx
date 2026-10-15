'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Check, Download, RefreshCw, Package, FileWarning } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import type { Artifact, Conversation } from '@/lib/types'
import { useChatStore } from '@/lib/store'
import { isInlineArtifact, downloadArtifact } from '@/lib/artifacts'
import { ARTIFACT_TYPE_META } from './artifact-meta'
import { UnsupportedHint } from './artifact-common'
import { HtmlPreview } from './artifact-html-preview'
import { ImagePreview, VideoPreview, PdfPreview } from './artifact-media-preview'
import { MarkdownPreview } from './artifact-markdown-preview'
import { CodePreview } from './artifact-code-preview'

/**
 * 产物预览面板（ADR-D7）：右侧 tool-panel 内的产物页。
 * 选中产物 id 存于 ui-store（selectedArtifactId），产物对象从会话消息中按 id 定位。
 * 生成中（creating）渲染骨架屏，ready 后才挂载各类型渲染器——避免流式增量反复重建 iframe
 * 导致闪烁/卡顿，也根治了原先「正常产物渲染一会就提示未响应」的误报。
 */

function findArtifactInConversation(
  conversation: Conversation,
  artifactId: string
): Artifact | null {
  for (const m of conversation.messages) {
    const found = (m.artifacts || []).find(a => a.id === artifactId)
    if (found) return found
  }
  return null
}

function locateArtifact(
  conversations: Conversation[],
  currentConversationId: string | null,
  selectedArtifactId: string | null
): { artifact: Artifact | null; agentId?: string } {
  if (!selectedArtifactId) return { artifact: null }
  // 优先在当前会话内定位（跨会话同 id 产物不串台，且扫描范围收窄到一个会话）。
  const current = currentConversationId
    ? conversations.find(c => c.id === currentConversationId)
    : undefined
  if (current) {
    const found = findArtifactInConversation(current, selectedArtifactId)
    if (found) return { artifact: found, agentId: current.agentId }
  }
  // 兜底：当前会话未命中/不存在时全量查找（兼容面板在会话切换前已打开的场景）。
  for (const c of conversations) {
    const found = findArtifactInConversation(c, selectedArtifactId)
    if (found) return { artifact: found, agentId: c.agentId }
  }
  return { artifact: null }
}

export function ArtifactPreviewPanel() {
  const conversations = useChatStore(s => s.conversations)
  const currentConversationId = useChatStore(s => s.currentConversationId)
  const selectedArtifactId = useChatStore(s => s.selectedArtifactId)
  const [reloadKey, setReloadKey] = useState(0)

  const { artifact, agentId } = locateArtifact(
    conversations,
    currentConversationId,
    selectedArtifactId
  )

  if (!artifact) return <ArtifactEmptyState />

  return (
    <div className="flex h-full flex-col bg-card">
      <ArtifactToolbar
        artifact={artifact}
        agentId={agentId}
        showRefresh={artifact.type === 'html' && artifact.status === 'ready'}
        onRefresh={() => setReloadKey(k => k + 1)}
      />
      <div className="min-h-0 flex-1 overflow-auto">
        {artifact.status === 'creating' ? (
          <ArtifactLoading artifact={artifact} />
        ) : (
          <ArtifactRenderer artifact={artifact} agentId={agentId} reloadKey={reloadKey} />
        )}
      </div>
    </div>
  )
}

function ArtifactToolbar({
  artifact,
  agentId,
  showRefresh,
  onRefresh,
}: {
  artifact: Artifact
  agentId?: string
  showRefresh: boolean
  onRefresh: () => void
}) {
  const [copied, setCopied] = useState(false)
  const { t } = useTranslation('artifact')
  const inline = isInlineArtifact(artifact)
  const canDownload = inline || !!(agentId && artifact.relativePath)

  const handleCopy = async () => {
    if (!inline || artifact.content == null) return
    try {
      await navigator.clipboard.writeText(artifact.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy artifact:', err)
    }
  }

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-2">
      <span className="min-w-0 truncate text-sm font-medium">{artifact.name}</span>
      <div className="flex shrink-0 items-center gap-0.5">
        {showRefresh && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onRefresh}
                aria-label={t('preview.reload')}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('preview.reload')}</TooltipContent>
          </Tooltip>
        )}
        {inline && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleCopy}
                aria-label={copied ? t('preview.copied') : t('preview.copy')}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{copied ? t('preview.copied') : t('preview.copy')}</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!canDownload}
              onClick={() => downloadArtifact(artifact, agentId)}
              aria-label={t('preview.download')}
            >
              <Download className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('preview.download')}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

function ArtifactLoading({ artifact }: { artifact: Artifact }) {
  const { t } = useTranslation('artifact')
  const typeMeta = ARTIFACT_TYPE_META[artifact.type] || ARTIFACT_TYPE_META.unknown
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center px-5 py-2">
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
        <typeMeta.icon className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">
          {t('preview.generating', { name: artifact.name })}
        </p>
        <div className="w-full max-w-sm space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </div>
  )
}

function ArtifactEmptyState() {
  const { t } = useTranslation('artifact')
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/60">
        <Package className="h-6 w-6 text-muted-foreground/50" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{t('preview.title')}</p>
        <p className="text-xs text-muted-foreground">{t('preview.emptyDescription')}</p>
      </div>
    </div>
  )
}

function ArtifactErrorState() {
  const { t } = useTranslation('artifact')
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 p-6 text-center">
      <FileWarning className="h-8 w-8 text-red-500" />
      <p className="text-sm font-medium">{t('preview.errorTitle')}</p>
      <p className="text-xs text-muted-foreground">{t('preview.errorDescription')}</p>
    </div>
  )
}

function ArtifactRenderer({
  artifact,
  agentId,
  reloadKey,
}: {
  artifact: Artifact
  agentId?: string
  reloadKey: number
}) {
  const { t } = useTranslation('artifact')
  if (artifact.status === 'error') return <ArtifactErrorState />

  switch (artifact.type) {
    case 'html':
      if (artifact.content != null || (agentId && artifact.relativePath)) {
        return (
          <HtmlPreview
            key={artifact.id}
            artifact={artifact}
            agentId={agentId}
            reloadKey={reloadKey}
          />
        )
      }
      return <UnsupportedHint text={t('preview.unsupported.html')} />
    case 'image':
      if (agentId && artifact.relativePath) {
        return <ImagePreview key={artifact.id} artifact={artifact} agentId={agentId} />
      }
      return <UnsupportedHint text={t('preview.unsupported.image')} />
    case 'video':
      if (agentId && artifact.relativePath) {
        return <VideoPreview key={artifact.id} artifact={artifact} agentId={agentId} />
      }
      return <UnsupportedHint text={t('preview.unsupported.video')} />
    case 'markdown':
      if (artifact.content != null || (agentId && artifact.relativePath)) {
        return <MarkdownPreview key={artifact.id} artifact={artifact} agentId={agentId} />
      }
      return <UnsupportedHint text={t('preview.unsupported.markdown')} />
    case 'code':
      if (artifact.content != null || (agentId && artifact.relativePath)) {
        return <CodePreview key={artifact.id} artifact={artifact} agentId={agentId} />
      }
      return <UnsupportedHint text={t('preview.unsupported.code')} />
    case 'pdf':
      if (agentId && artifact.relativePath) {
        return <PdfPreview key={artifact.id} artifact={artifact} agentId={agentId} />
      }
      return <UnsupportedHint text={t('preview.unsupported.pdf')} />
    default:
      return <UnsupportedHint text={t('preview.unsupported.unknown')} />
  }
}
