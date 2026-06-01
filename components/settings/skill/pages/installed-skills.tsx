'use client'

import type { ComponentType } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { BookOpen, ExternalLink, FolderOpen, RefreshCw, Search, Trash2 } from 'lucide-react'
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
import { SkillPaginationBar } from '../pagination-bar'

export function InstalledSkills() {
  const currentAgentId = useChatStore((state) => state.currentAgentId)
  const agents = useChatStore((state) => state.agents)
  const [installedSkills, setInstalledSkills] = useState<AgentSkillResponse[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedSourceType, setSelectedSourceType] = useState<string>('all')
  const [previewSkill, setPreviewSkill] = useState<AgentSkillResponse | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(12)
  const [uninstallingSkillId, setUninstallingSkillId] = useState<string | null>(null)
  const { toast } = useToast()

  const mergedSkills = installedSkills
  const activeAgentId = useMemo(
    () => (currentAgentId && agents.some((agent) => agent.id === currentAgentId) ? currentAgentId : null),
    [agents, currentAgentId],
  )

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

  const totalPages = Math.max(1, Math.ceil(filteredSkills.length / pageSize))

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, selectedSourceType, mergedSkills.length, pageSize])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const pagedSkills = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return filteredSkills.slice(startIndex, startIndex + pageSize)
  }, [currentPage, filteredSkills, pageSize])

  useEffect(() => {
    if (!activeAgentId) {
      setInstalledSkills([])
      return
    }
    void refreshInstalledSkills(activeAgentId)
  }, [activeAgentId])

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
    if (!activeAgentId) {
      return
    }
    try {
      setLoading(true)
      const synced = await skillService.syncInstalledSkills(activeAgentId)
      setInstalledSkills(synced)
      toast({
        title: '刷新成功',
        description: '已同步并更新当前 Agent 的已安装技能列表。',
      })
    } catch (error) {
      console.error('Failed to sync installed skills:', error)
      toast({
        title: '刷新失败',
        description: '同步已安装技能失败，请稍后重试。',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleUninstallSkill = async (skill: AgentSkillResponse) => {
    if (!activeAgentId) {
      toast({
        title: '未选择 Agent',
        description: '请先在聊天区选择一个 Agent，再卸载技能。',
        variant: 'destructive',
      })
      return
    }

    try {
      setUninstallingSkillId(skill.skill_id)
      await skillService.uninstallSkill(activeAgentId, { skill_id: skill.skill_id })
      setInstalledSkills((prev) => prev.filter((item) => item.skill_id !== skill.skill_id))
      setPreviewSkill((prev) => (prev?.skill_id === skill.skill_id ? null : prev))
      toast({
        title: '卸载成功',
        description: `技能 ${extractSkillName(skill.skill_name)} 已从当前 Agent 卸载。`,
      })
    } catch (error) {
      console.error('Failed to uninstall skill:', error)
      toast({
        title: '卸载失败',
        description: '卸载技能失败，请稍后重试。',
        variant: 'destructive',
      })
    } finally {
      setUninstallingSkillId(null)
    }
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
                onClick={() => void handleRefresh()}
                disabled={!activeAgentId || loading}
                title="同步已安装技能"
              >
                <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                同步已安装技能
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!activeAgentId ? (
            <EmptyState text="请先在聊天区选择一个 Agent。" />
          ) : loading ? (
            <EmptyState text="正在加载已安装技能..." />
          ) : filteredSkills.length === 0 ? (
            <EmptyState text="暂无匹配的已安装技能。" />
          ) : (
            <div className="space-y-4">
              <SkillPaginationBar
                total={filteredSkills.length}
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                onPageSizeChange={(value) => setPageSize(value)}
                onPrev={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                onNext={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {pagedSkills.map((skill) => (
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
                    </div>
                    <div className="mt-3 flex justify-end gap-3">
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-red-600 hover:text-red-700 disabled:text-muted-foreground"
                        onClick={() => void handleUninstallSkill(skill)}
                        disabled={
                          uninstallingSkillId === skill.skill_id ||
                          !activeAgentId
                        }
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        {uninstallingSkillId === skill.skill_id
                            ? '卸载中...'
                            : '卸载'}
                      </Button>
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
                  <InfoLine
                    icon={previewSkill.skill_md_url ? ExternalLink : FolderOpen}
                    label="skill 路径"
                    value={previewSkill.skill_md_url || previewSkill.relative_path || '-'}
                    href={previewSkill.skill_md_url && isHttpUrl(previewSkill.skill_md_url) ? previewSkill.skill_md_url : undefined}
                    singleLine
                  />
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

function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://')
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
