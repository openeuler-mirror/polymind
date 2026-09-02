'use client'

import { useCallback, useState } from 'react'
import { Download, Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Artifact } from '@/lib/types'
import { useChatStore } from '@/lib/store'
import { isInlineArtifact, downloadArtifact, formatSize } from '@/lib/artifacts'
import { ARTIFACT_TYPE_META } from '@/components/artifact/artifact-meta'

/**
 * 产物卡片（ADR-D6）：折叠态常显在助手消息正文下方，点击打开右侧产物面板并选中。
 * 参考文件小卡样式：类型图标 + 文件名 + 文件大小，不显示徽标。
 * write 失败（status === 'error'）→ 错误态，不提供预览入口。
 */
export function ArtifactCard({ artifact, agentId }: { artifact: Artifact; agentId?: string }) {
  const openArtifactPanel = useChatStore(s => s.openArtifactPanel)
  const [copied, setCopied] = useState(false)

  const TypeIcon = (ARTIFACT_TYPE_META[artifact.type] || ARTIFACT_TYPE_META.unknown).icon
  const inline = isInlineArtifact(artifact)
  const sizeText = formatSize(artifact.size)
  // 错误产物不提供预览入口（与注释一致）：仍可下载/复制，但点击不打开预览面板。
  const canOpen = artifact.status !== 'error'

  const handleDownload = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      downloadArtifact(artifact, agentId)
    },
    [artifact, agentId]
  )

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!inline || artifact.content == null) return
      try {
        await navigator.clipboard.writeText(artifact.content)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch (err) {
        console.error('Failed to copy artifact:', err)
      }
    },
    [inline, artifact]
  )

  return (
    <div
      role={canOpen ? 'button' : undefined}
      tabIndex={canOpen ? 0 : undefined}
      onClick={() => {
        if (canOpen) openArtifactPanel(artifact)
      }}
      onKeyDown={e => {
        // 仅当焦点在卡片本身时响应回车/空格；
        // 若事件源自内层下载/复制按钮，交给按钮原生激活，避免冒泡误开预览面板并吞掉按钮默认行为。
        if (canOpen && e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          openArtifactPanel(artifact)
        }
      }}
      className={cn(
        'group flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm',
        'transition-colors hover:border-primary/40 hover:bg-muted/70',
        artifact.status === 'error' && 'cursor-default'
      )}
    >
      <TypeIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium leading-6">{artifact.name}</span>
        {sizeText && (
          <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
            {sizeText}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleDownload}
              disabled={!inline && !(agentId && artifact.relativePath)}
            >
              <Download className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>下载</TooltipContent>
        </Tooltip>
        {inline && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy}>
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>复制</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
}
