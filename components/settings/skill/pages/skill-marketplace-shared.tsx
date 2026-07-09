'use client'

import type { ComponentType } from 'react'
import { BookOpen, ExternalLink, FolderOpen, Link2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SkillResponse } from '@/lib/types'
import { extractSkillName } from './utils/skill-name'
import { getSkillSourceBadgeMeta, isRemoteSkillSourceType } from './utils/skill-source-label'

export interface SkillSourceMeta {
  name: string
  sourceType: string
}

export interface SkillPreviewItem {
  skill: SkillResponse
  source?: SkillSourceMeta
}

export function SkillMarketplaceCard({
  skill,
  source,
  installDisabled,
  installLabel,
  onInstall,
  onPreview,
}: {
  skill: SkillResponse
  source?: SkillSourceMeta
  installDisabled: boolean
  installLabel: string
  onInstall: (skill: SkillResponse) => void | Promise<void>
  onPreview: (skill: SkillResponse, source?: SkillSourceMeta) => void
}) {
  return (
    <div
      key={skill.skill_id}
      className="flex min-h-15 flex-col rounded-lg border border-border bg-card p-4"
    >
      <div className="mb-3 flex items-start gap-2">
        <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold leading-5 break-all">
            {extractSkillName(skill.skill_name)}
          </p>
          <SkillOriginBadge sourceType={source?.sourceType} />
        </div>
      </div>

      <div className="flex-1">
        <p className="min-h-12 line-clamp-2 text-sm leading-6 text-muted-foreground">
          {extractSkillDescription(skill.metadata) || '暂无描述'}
        </p>
        <div className="mt-3 flex justify-end gap-3">
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-emerald-600 hover:text-emerald-700 disabled:text-muted-foreground"
            onClick={() => void onInstall(skill)}
            disabled={installDisabled}
          >
            {installLabel}
          </Button>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-blue-600 hover:text-blue-700"
            onClick={() => onPreview(skill, source)}
          >
            预览
          </Button>
        </div>
      </div>
    </div>
  )
}

export function SkillMarketplacePreviewDialog({
  previewItem,
  onOpenChange,
}: {
  previewItem: SkillPreviewItem | null
  onOpenChange: (open: boolean) => void
}) {
  const previewIsRemote = isRemoteSkillSourceType(previewItem?.source?.sourceType)

  return (
    <Dialog open={!!previewItem} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader className="gap-3">
          <div className="space-y-3 pr-8">
            <div className="space-y-2">
              <DialogTitle className="text-base">
                {previewItem ? extractSkillName(previewItem.skill.skill_name) : '技能预览'}
              </DialogTitle>
              {previewItem ? <SkillSourceInfo source={previewItem.source} /> : null}
            </div>
            {previewItem?.skill.skill_md_url ? (
              <InfoLine
                icon={previewIsRemote ? ExternalLink : FolderOpen}
                label="skill 路径"
                value={previewItem.skill.skill_md_url}
                href={previewIsRemote ? previewItem.skill.skill_md_url : undefined}
                singleLine
                valueClassName={previewIsRemote ? 'text-blue-600/90' : undefined}
              />
            ) : (
              <InfoLine icon={FolderOpen} label="skill 路径" value="-" singleLine />
            )}
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[62vh] rounded-md border border-border/70 bg-muted/10 p-3">
          <MetadataViewer metadata={previewItem?.skill.metadata} />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

export function EmptyState({ text }: { text: string }) {
  return <div className="py-10 text-center text-sm text-muted-foreground">{text}</div>
}

function SkillSourceInfo({ source }: { source?: SkillSourceMeta }) {
  return (
    <div className="space-y-1 text-sm">
      <InfoLine
        icon={isRemoteSkillSourceType(source?.sourceType) ? Link2 : FolderOpen}
        label="来源"
        value={source?.name || '-'}
      />
    </div>
  )
}

export function SkillOriginBadge({ sourceType }: { sourceType?: string }) {
  const badgeMeta = getSkillSourceBadgeMeta(sourceType)

  return (
    <Badge
      variant="outline"
      className={`h-5 px-1.5 text-[11px] font-normal ${badgeMeta.className}`}
    >
      {badgeMeta.label}
    </Badge>
  )
}

export function InfoLine({
  icon: Icon,
  label,
  value,
  href,
  singleLine = false,
  valueClassName,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string
  href?: string
  singleLine?: boolean
  valueClassName?: string
}) {
  const valueClasses = [
    singleLine ? 'inline-block max-w-[24rem] truncate whitespace-nowrap' : 'break-all',
    valueClassName || '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 items-start gap-1">
        <span className="shrink-0 text-muted-foreground">{label}：</span>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            title={value}
            className={`text-blue-600 hover:text-blue-700 hover:underline ${valueClasses}`}
          >
            {value}
          </a>
        ) : (
          <span className={valueClasses} title={singleLine ? value : undefined}>
            {value}
          </span>
        )}
      </div>
    </div>
  )
}

export function extractSkillDescription(metadata?: Record<string, unknown> | null) {
  const description = metadata?.description
  return typeof description === 'string' ? description.trim() : ''
}

export function MetadataViewer({ metadata }: { metadata?: Record<string, unknown> | null }) {
  const entries = flattenMetadataEntries(metadata)

  if (entries.length === 0) {
    return <p className="text-sm leading-6 text-muted-foreground">{'{}'}</p>
  }

  return (
    <div className="space-y-1">
      {entries.map(entry => (
        <div key={entry.key} className="flex gap-3 text-sm leading-6">
          <span className="shrink-0 text-muted-foreground">{entry.key}:</span>
          <span className="break-all text-foreground">{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatMetadataLeaf(value: unknown) {
  if (value === null) {
    return 'null'
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function flattenMetadataEntries(
  metadata?: Record<string, unknown> | null,
  prefix = ''
): Array<{ key: string; value: string }> {
  if (!metadata) {
    return []
  }

  const pairs: Array<{ key: string; value: string }> = []

  Object.entries(metadata).forEach(([key, value]) => {
    const composedKey = prefix ? `${prefix}.${key}` : key

    if (isRecord(value)) {
      const childEntries = flattenMetadataEntries(value, composedKey)
      if (childEntries.length === 0) {
        pairs.push({ key: composedKey, value: '{}' })
      } else {
        pairs.push(...childEntries)
      }
      return
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        pairs.push({ key: composedKey, value: '[]' })
        return
      }
      value.forEach((item, index) => {
        const itemKey = `${composedKey}[${index}]`
        if (isRecord(item)) {
          const childEntries = flattenMetadataEntries(item, itemKey)
          if (childEntries.length === 0) {
            pairs.push({ key: itemKey, value: '{}' })
          } else {
            pairs.push(...childEntries)
          }
          return
        }
        pairs.push({ key: itemKey, value: formatMetadataLeaf(item) })
      })
      return
    }

    pairs.push({ key: composedKey, value: formatMetadataLeaf(value) })
  })

  return pairs
}
