'use client'

import type { ComponentType } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { BookOpen, FolderOpen, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { useChatStore } from '@/lib/store'
import { AgentSkillResponse } from '@/lib/types'
import { skillService } from '@/services/skill-service'

export function InstalledSkills() {
  const currentAgentId = useChatStore((state) => state.currentAgentId)
  const [installedSkills, setInstalledSkills] = useState<AgentSkillResponse[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedSourceType, setSelectedSourceType] = useState<string>('all')
  const [previewSkill, setPreviewSkill] = useState<AgentSkillResponse | null>(null)
  const { toast } = useToast()

  const mergedSkills = installedSkills

  const sourceOptions = useMemo(() => {
    const uniqueSourceTypes = Array.from(new Set(mergedSkills.map((skill) => skill.source_type)))

    return [
      { label: '全部来源', value: 'all' },
      ...uniqueSourceTypes.map((value) => ({ label: value, value })),
    ]
  }, [mergedSkills])

  const filteredSkills = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase()

    return mergedSkills.filter((skill) => {
      const matchesSource = selectedSourceType === 'all' || skill.source_type === selectedSourceType
      const description = extractSkillDescription(skill.metadata)
      const matchesSearch =
        !keyword ||
        [
          skill.skill_name,
          skill.skill_id,
          skill.source_type,
          skill.repo_id,
          skill.relative_path,
          skill.skill_source,
          skill.skill_md_url,
          description,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword))

      return matchesSource && matchesSearch
    })
  }, [mergedSkills, searchTerm, selectedSourceType])

  useEffect(() => {
    if (!currentAgentId) {
      setInstalledSkills([])
      return
    }
    void refreshInstalledSkills(currentAgentId)
  }, [currentAgentId])

  const refreshInstalledSkills = async (agentId: string) => {
    try {
      setLoading(true)
      const installed = await skillService.listInstalledSkills(agentId)
      setInstalledSkills(installed)
    } catch (error) {
      console.error('Failed to load installed skills:', error)
      toast({
        title: '加载失败',
        description: '无法获取已安装技能列表，请稍后重试。',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    if (!currentAgentId) {
      return
    }
    await refreshInstalledSkills(currentAgentId)
  }

  return (
    <div className="space-y-6">
      <Card className="border border-border">
        <CardHeader className="gap-1">
          <div className="space-y-1">
            <CardTitle>已安装</CardTitle>
            <CardDescription>统一查看当前 Agent 已安装技能（含内置与仓库安装）。</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SummaryTag label="已安装技能" value={`${mergedSkills.length}`} />
            <SummaryTag
              label="来源类型"
              value={`${new Set(mergedSkills.map((item) => item.source_type)).size}`}
            />
          </div>
        </CardHeader>
      </Card>

      <Card className="border border-border">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle>技能列表</CardTitle>
            <div className="flex w-full max-w-xl gap-2">
              <Select value={selectedSourceType} onValueChange={setSelectedSourceType}>
                <SelectTrigger className="w-80 shrink-0">
                  <SelectValue placeholder="来源类型" />
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
              <Button
                variant="outline"
                size="icon"
                onClick={() => void handleRefresh()}
                disabled={!currentAgentId || loading}
                title="刷新"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!currentAgentId ? (
            <EmptyState text="请先在聊天区选择一个 Agent。" />
          ) : loading ? (
            <EmptyState text="正在加载已安装技能..." />
          ) : filteredSkills.length === 0 ? (
            <EmptyState text="暂无匹配的已安装技能。" />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredSkills.map((skill) => (
                <div
                  key={`${skill.agent_id}-${skill.skill_id}`}
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
                    <div className="mt-2 text-xs leading-5 text-muted-foreground">
                      <p>来源类型：{skill.source_type}</p>
                      <p>安装时间：{formatInstalledAt(skill.installed_at)}</p>
                    </div>
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
              <DialogTitle className="text-base">
                {previewSkill ? extractSkillName(previewSkill.skill_name) : '技能预览'}
              </DialogTitle>
              {previewSkill ? (
                <div className="space-y-1 text-sm">
                  <InfoLine icon={FolderOpen} label="来源类型" value={previewSkill.source_type} />
                  <InfoLine icon={FolderOpen} label="repo_id" value={previewSkill.repo_id || '-'} />
                  <InfoLine
                    icon={FolderOpen}
                    label="安装时间"
                    value={formatInstalledAt(previewSkill.installed_at)}
                  />
                  <InfoLine icon={FolderOpen} label="skill_id" value={previewSkill.skill_id} />
                  <InfoLine icon={FolderOpen} label="skill 路径" value={previewSkill.relative_path || '-'} />
                </div>
              ) : null}
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

function SummaryTag({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex h-8 items-center gap-2 rounded-md border border-border/70 bg-muted/10 px-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold leading-none">{value}</p>
    </div>
  )
}

function InfoLine({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 items-start gap-1">
        <span className="shrink-0 text-muted-foreground">{label}：</span>
        <span className="break-all">{value}</span>
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

function extractSkillDescription(metadata?: Record<string, unknown>) {
  const description = metadata?.description
  return typeof description === 'string' ? description.trim() : ''
}

function formatInstalledAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString('zh-CN', { hour12: false })
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
