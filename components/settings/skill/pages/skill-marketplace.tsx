'use client'

import type { ComponentType } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { BookOpen, ExternalLink, FolderOpen, Link2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { SkillRepositoryResponse, SkillResponse } from '@/lib/types'
import { skillService } from '@/services/skill-service'

export function SkillMarketplace() {
  const [skills, setSkills] = useState<SkillResponse[]>([])
  const [statusItems, setStatusItems] = useState<SkillRepositoryResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedSource, setSelectedSource] = useState<string>('all')
  const [previewSkill, setPreviewSkill] = useState<SkillResponse | null>(null)
  const { toast } = useToast()

  const sourceOptions = useMemo(() => {
    const uniqueSources = Array.from(
      new Set(skills.map((skill) => getSkillSourceValue(skill)).filter(Boolean)),
    )

    return [
      { label: '全部仓库', value: 'all' },
      ...uniqueSources.map((value) => ({ label: value, value })),
    ]
  }, [skills])

  const filteredSkills = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase()

    return skills.filter((skill) => {
      const sourceValue = getSkillSourceValue(skill)
      const matchesSource = selectedSource === 'all' || sourceValue === selectedSource
      const matchesSearch =
        !keyword ||
        [sourceValue, skill.skill_md_url, skill.skill_name, skill.relative_path]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(keyword))

      return matchesSource && matchesSearch
    })
  }, [searchTerm, selectedSource, skills])

  useEffect(() => {
    void refreshMarketplace()
  }, [])

  const refreshMarketplace = async () => {
    try {
      setLoading(true)
      const repositories = await skillService.listRepositoryResponses()
      const allSkills = await skillService.listAllSkills()
      setStatusItems(repositories)
      setSkills(allSkills)
    } catch (error) {
      console.error('Failed to refresh skill marketplace:', error)
      toast({
        title: '加载失败',
        description: '无法获取技能广场数据，请稍后重试。',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const previewOpenHref = previewSkill ? buildSkillOpenHref(previewSkill) : undefined
  const isPreviewGit = previewSkill?.source_repo?.source_type === 'git'

  return (
    <div className="space-y-6">
      <Card className="border border-border">
        <CardHeader className="gap-1">
          <div className="space-y-1">
            <CardTitle>技能广场</CardTitle>
            <CardDescription>统一查看和安装各仓库源已发现的技能。</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MarketplaceSummary label="已发现技能" value={`${skills.length}`} />
            <MarketplaceSummary label="来源仓库" value={`${statusItems.length}`} />
          </div>
        </CardHeader>
      </Card>

      <Card className="border border-border">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle>技能列表</CardTitle>
            <div className="flex w-full max-w-xl gap-2">
              <Select value={selectedSource} onValueChange={setSelectedSource}>
                <SelectTrigger className="w-80 shrink-0">
                  <SelectValue placeholder="筛选项" />
                </SelectTrigger>
                <SelectContent>
                  {sourceOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="搜索技能"
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <EmptyState text="正在加载技能列表..." />
          ) : filteredSkills.length === 0 ? (
            <EmptyState text="暂无匹配的技能记录。" />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredSkills.map((skill) => (
                <div
                  key={getSkillKey(skill)}
                  className="flex min-h-15 flex-col rounded-lg border border-border bg-card p-4"
                >
                  <div className="mb-3 flex items-start gap-2">
                    <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="text-sm font-semibold leading-5 break-all">
                      {extractSkillName(skill.skill_name)}
                    </p>
                  </div>

                  <div className="flex-1">
                    <p className="min-h-12 line-clamp-2 text-sm leading-6 text-muted-foreground">
                      {extractSkillDescription(skill.metadata) || '暂无描述'}
                    </p>
                    <div className="mt-3 flex justify-end">
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-blue-600 hover:text-blue-700"
                        onClick={() => setPreviewSkill(skill)}
                      >
                        预览
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!previewSkill} onOpenChange={(open) => !open && setPreviewSkill(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader className="gap-3">
            <div className="space-y-3 pr-8">
              <div className="space-y-2">
                <DialogTitle className="text-base">
                  {previewSkill ? extractSkillName(previewSkill.skill_name) : '技能预览'}
                </DialogTitle>
                {previewSkill ? <SkillSourceInfo skill={previewSkill} /> : null}
              </div>
              {isPreviewGit && previewSkill?.skill_md_url && previewOpenHref ? (
                <InfoLine
                  icon={ExternalLink}
                  label="skill 路径"
                  value={previewSkill.skill_md_url}
                  href={previewOpenHref}
                  singleLine
                  valueClassName="text-blue-600/90"
                />
              ) : (
                <InfoLine
                  icon={FolderOpen}
                  label="skill 路径"
                  value={previewSkill?.relative_path || '-'}
                  singleLine
                />
              )}
            </div>
          </DialogHeader>

          <ScrollArea className="max-h-[62vh] rounded-md border border-border/70 bg-muted/10 p-3">
            <MetadataViewer metadata={previewSkill?.metadata} />
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MarketplaceSummary({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="inline-flex h-8 items-center gap-2 rounded-md border border-border/70 bg-muted/10 px-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold leading-none">{value}</p>
    </div>
  )
}

function SkillSourceInfo({ skill }: { skill: SkillResponse }) {
  return (
    <div className="space-y-1 text-sm">
      <InfoLine
        icon={skill.source_repo?.source_type === 'git' ? Link2 : FolderOpen}
        label="来源"
        value={getSkillSourceValue(skill) || '-'}
      />
    </div>
  )
}

function InfoLine({
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

function EmptyState({ text }: { text: string }) {
  return <div className="py-10 text-center text-sm text-muted-foreground">{text}</div>
}

function extractSkillName(value?: string) {
  if (!value) {
    return '未命名技能'
  }
  const parts = value.split('/')
  return parts[parts.length - 1] || value
}

function extractSkillDescription(metadata?: Record<string, unknown> | null) {
  const description = metadata?.description
  return typeof description === 'string' ? description.trim() : ''
}

function getSkillKey(skill: SkillResponse) {
  return (
    skill.skill_id ||
    `${skill.source_repo?.repo_id || 'repo'}-${skill.relative_path || skill.skill_name || 'skill'}`
  )
}

function getSkillSourceValue(skill: SkillResponse) {
  return skill.skill_source || ''
}

function MetadataViewer({ metadata }: { metadata?: Record<string, unknown> | null }) {
  const entries = flattenMetadataEntries(metadata)

  if (entries.length === 0) {
    return <p className="text-sm leading-6 text-muted-foreground">{'{}'}</p>
  }

  return (
    <div className="space-y-1">
      {entries.map((entry) => (
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
  prefix = '',
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

function buildSkillOpenHref(skill: SkillResponse) {
  const rawMdUrl = skill.skill_md_url?.trim()
  if (!rawMdUrl) {
    return undefined
  }

  if (skill.source_repo?.source_type === 'git') {
    return rawMdUrl
  }

  const folderHref = buildLocalFolderHref(rawMdUrl, skill.source_repo?.local_path)
  return folderHref || rawMdUrl
}

function buildLocalFolderHref(skillMdUrl: string, localPath?: string | null) {
  if (localPath) {
    return toFileHref(localPath)
  }

  if (/^file:\/\//i.test(skillMdUrl)) {
    const sanitized = skillMdUrl.split(/[?#]/)[0]
    const folderPath = sanitized.replace(/[\\/][^\\/]*$/, '')
    return folderPath || sanitized
  }

  if (/^[a-z]+:\/\//i.test(skillMdUrl)) {
    return skillMdUrl
  }

  const normalizedPath = skillMdUrl.replace(/\\/g, '/')
  const folderPath = normalizedPath.replace(/\/[^/]*$/, '')
  return toFileHref(folderPath || normalizedPath)
}

function toFileHref(pathValue: string) {
  const trimmedPath = pathValue.trim()
  if (!trimmedPath) {
    return undefined
  }

  if (/^[a-z]+:\/\//i.test(trimmedPath)) {
    return trimmedPath
  }

  const normalizedPath = trimmedPath.replace(/\\/g, '/')
  return normalizedPath.match(/^[A-Za-z]:\//)
    ? `file:///${normalizedPath}`
    : `file://${normalizedPath}`
}
