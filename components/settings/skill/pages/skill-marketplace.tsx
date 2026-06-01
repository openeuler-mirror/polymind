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
import { useChatStore } from '@/lib/store'
import { SkillRepositoryResponse, SkillResponse } from '@/lib/types'
import { skillService } from '@/services/skill-service'
import { SkillPaginationBar } from '../pagination-bar'

export function SkillMarketplace() {
  const currentAgentId = useChatStore((state) => state.currentAgentId)
  const agents = useChatStore((state) => state.agents)
  const [skills, setSkills] = useState<SkillResponse[]>([])
  const [statusItems, setStatusItems] = useState<SkillRepositoryResponse[]>([])
  const [installingSkillKey, setInstallingSkillKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedSource, setSelectedSource] = useState<string>('all')
  const [previewSkill, setPreviewSkill] = useState<SkillResponse | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(12)
  const [installedSkillIds, setInstalledSkillIds] = useState<Set<string>>(new Set())
  const { toast } = useToast()
  const activeAgentId = useMemo(
    () => (currentAgentId && agents.some((agent) => agent.id === currentAgentId) ? currentAgentId : null),
    [agents, currentAgentId],
  )

  const repoById = useMemo(
    () => new Map(statusItems.map((repo) => [repo.repo_id, repo])),
    [statusItems],
  )

  const sourceOptions = useMemo(() => {
    const uniqueSources = Array.from(
      new Set(
        skills
          .map((skill) => skill.repo_id ? repoById.get(skill.repo_id)?.repo_name : undefined)
          .filter((v): v is string => Boolean(v)),
      ),
    )

    return [
      { label: '全部仓库', value: 'all' },
      ...uniqueSources.map((value) => ({ label: value, value })),
    ]
  }, [skills, repoById])

  const filteredSkills = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase()

    return skills.filter((skill) => {
      const repoName = skill.repo_id ? repoById.get(skill.repo_id)?.repo_name : undefined
      const matchesSource = selectedSource === 'all' || repoName === selectedSource
      const matchesSearch =
        !keyword ||
        [repoName, skill.skill_md_url, skill.skill_name, skill.relative_path]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(keyword))

      return matchesSource && matchesSearch
    })
  }, [searchTerm, selectedSource, skills, repoById])

  const totalPages = Math.max(1, Math.ceil(filteredSkills.length / pageSize))

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, selectedSource, skills.length, pageSize])

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
    void refreshMarketplace()
  }, [])

  useEffect(() => {
    if (!activeAgentId) {
      setInstalledSkillIds(new Set())
      return
    }
    void refreshInstalledSkillIds(activeAgentId)
  }, [activeAgentId])

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


  const refreshInstalledSkillIds = async (agentId: string) => {
    try {
      const installed = await skillService.listInstalledSkills(agentId)
      const ids = new Set(
        installed
          .map((item) => item.skill_id)
          .filter((skillId): skillId is string => typeof skillId === 'string' && !!skillId),
      )
      setInstalledSkillIds(ids)
    } catch (error) {
      console.error('Failed to load installed skills for marketplace:', error)
    }
  }

  const previewRepo = previewSkill && previewSkill.repo_id ? repoById.get(previewSkill.repo_id) : undefined
  const previewIsGit = previewRepo?.source_type === 'git'

  const handleInstallSkill = async (skill: SkillResponse) => {
    if (!activeAgentId) {
      toast({
        title: '未选择 Agent',
        description: '请先在聊天区选择一个 Agent，再安装技能。',
        variant: 'destructive',
      })
      return
    }

    if (!skill.skill_id || !skill.skill_name) {
      toast({
        title: '安装失败',
        description: '技能信息不完整，无法安装。',
        variant: 'destructive',
      })
      return
    }


    if (installedSkillIds.has(skill.skill_id)) {
      toast({
        title: '已安装',
        description: `技能 ${extractSkillName(skill.skill_name)} 已安装。`,
      })
      return
    }

    const skillKey = skill.skill_id
    try {
      setInstallingSkillKey(skillKey)
      await skillService.installSkill(activeAgentId, {
        skill_id: skill.skill_id,
        skill_name: skill.skill_name,
      })
      setInstalledSkillIds((prev) => new Set([...prev, skill.skill_id]))
      toast({
        title: '安装成功',
        description: `技能 ${extractSkillName(skill.skill_name)} 已安装到当前 Agent。`,
      })
    } catch (error) {
      console.error('Failed to install skill:', error)
      toast({
        title: '安装失败',
        description: '安装技能失败，请稍后重试。',
        variant: 'destructive',
      })
    } finally {
      setInstallingSkillKey(null)
    }
  }

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
                    key={skill.skill_id}
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
                      <div className="mt-3 flex justify-end gap-3">
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-emerald-600 hover:text-emerald-700 disabled:text-muted-foreground"
                          onClick={() => void handleInstallSkill(skill)}
                          disabled={
                            !activeAgentId ||
                            !skill.skill_id ||
                            installedSkillIds.has(skill.skill_id) ||
                            installingSkillKey === skill.skill_id
                          }
                        >
                          {installingSkillKey === skill.skill_id
                            ? '安装中...'
                            : installedSkillIds.has(skill.skill_id)
                              ? '已安装'
                              : '安装'}
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
              <div className="space-y-2">
                <DialogTitle className="text-base">
                  {previewSkill ? extractSkillName(previewSkill.skill_name) : '技能预览'}
                </DialogTitle>
                {previewSkill ? <SkillSourceInfo repo={previewRepo} /> : null}
              </div>
              {previewSkill?.skill_md_url ? (
                <InfoLine
                  icon={previewIsGit ? ExternalLink : FolderOpen}
                  label="skill 路径"
                  value={previewSkill.skill_md_url}
                  href={previewIsGit ? previewSkill.skill_md_url : undefined}
                  singleLine
                  valueClassName={previewIsGit ? 'text-blue-600/90' : undefined}
                />
              ) : <InfoLine icon={FolderOpen} label="skill 路径" value="-" singleLine />}
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

function SkillSourceInfo({
  repo,
}: {
  repo?: SkillRepositoryResponse
}) {
  return (
    <div className="space-y-1 text-sm">
      <InfoLine
        icon={repo?.source_type === 'git' ? Link2 : FolderOpen}
        label="来源"
        value={repo?.repo_name || '-'}
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
