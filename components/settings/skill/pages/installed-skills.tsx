'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpen, ExternalLink, FolderOpen, RefreshCw, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { extractApiErrorMessage } from '@/lib/error-handler'
import { useChatStore } from '@/lib/store'
import { AgentSkillResponse } from '@/lib/types'
import { skillService } from '@/services/skill-service'
import { useAutoLoadOnScroll } from './use-auto-load-on-scroll'
import { extractSkillOperationErrorMessage } from './utils/skill-error-message'
import { extractSkillName } from './utils/skill-name'
import { formatSkillSourceLabel } from './utils/skill-source-label'
import {
  EmptyState,
  extractSkillDescription,
  InfoLine,
  MetadataViewer,
  SkillOriginBadge,
} from './skill-marketplace-shared'

const INSTALLED_BATCH_SIZE = 24

export function InstalledSkills() {
  const currentAgentId = useChatStore(state => state.currentAgentId)
  const agents = useChatStore(state => state.agents)
  const [installedSkills, setInstalledSkills] = useState<AgentSkillResponse[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedSourceType, setSelectedSourceType] = useState<string>('all')
  const [previewSkill, setPreviewSkill] = useState<AgentSkillResponse | null>(null)
  const [visibleCountByFilter, setVisibleCountByFilter] = useState<Record<string, number>>({})
  const [uninstallingSkillId, setUninstallingSkillId] = useState<string | null>(null)
  const { toast } = useToast()

  const mergedSkills = installedSkills
  const activeAgentId = useMemo(
    () =>
      currentAgentId && agents.some(agent => agent.id === currentAgentId) ? currentAgentId : null,
    [agents, currentAgentId]
  )

  const sourceOptions = useMemo(() => {
    const uniqueSourceTypes = Array.from(new Set(mergedSkills.map(skill => skill.source_type)))

    return [
      { label: '全部来源', value: 'all' },
      ...uniqueSourceTypes.map(value => ({ label: formatSkillSourceLabel(value), value })),
    ]
  }, [mergedSkills])

  const filteredSkills = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase()

    return mergedSkills.filter(skill => {
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
          .some(value => String(value).toLowerCase().includes(keyword))

      return matchesSource && matchesSearch
    })
  }, [mergedSkills, searchTerm, selectedSourceType])

  const filterKey = `${searchTerm}\u0000${selectedSourceType}\u0000${mergedSkills.length}`
  const visibleCount = visibleCountByFilter[filterKey] ?? INSTALLED_BATCH_SIZE

  const visibleSkills = useMemo(
    () => filteredSkills.slice(0, visibleCount),
    [filteredSkills, visibleCount]
  )

  const hasMore = visibleCount < filteredSkills.length

  const { containerRef } = useAutoLoadOnScroll({
    hasMore,
    loading,
    onLoadMore: () => {
      setVisibleCountByFilter(prev => ({
        ...prev,
        [filterKey]: Math.min(
          (prev[filterKey] ?? INSTALLED_BATCH_SIZE) + INSTALLED_BATCH_SIZE,
          filteredSkills.length
        ),
      }))
    },
    contentVersion: visibleSkills.length,
  })

  const refreshInstalledSkills = useCallback(
    async (agentId: string) => {
      try {
        setLoading(true)
        const installed = await skillService.listInstalledSkills(agentId)
        setInstalledSkills(installed)
      } catch (error) {
        console.error('Failed to load installed skills:', error)
        toast({
          title: '加载失败',
          description: extractApiErrorMessage(error, '无法获取已安装技能列表，请稍后重试。'),
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
      }
    },
    [toast]
  )

  useEffect(() => {
    if (!activeAgentId) {
      setInstalledSkills([])
      return
    }

    const timer = window.setTimeout(() => {
      void refreshInstalledSkills(activeAgentId)
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [activeAgentId, refreshInstalledSkills])

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
        description: extractApiErrorMessage(error, '同步已安装技能失败，请稍后重试。'),
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
      setInstalledSkills(prev => prev.filter(item => item.skill_id !== skill.skill_id))
      setPreviewSkill(prev => (prev?.skill_id === skill.skill_id ? null : prev))
      toast({
        title: '卸载成功',
        description: `技能 ${extractSkillName(skill.skill_name)} 已从当前 Agent 卸载。`,
      })
    } catch (error) {
      console.error('Failed to uninstall skill:', error)
      toast({
        title: '卸载失败',
        description: extractSkillOperationErrorMessage(error, {
          operation: 'uninstall',
          skillName: skill.skill_name,
          sourceType: skill.source_type,
          runtimeSource: skill.skill_source,
          fallback: '卸载技能失败，请稍后重试。',
        }),
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
            <CardDescription>
              统一查看当前 Agent 已安装技能（含内置和通过Polymind安装）。
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SummaryTag label="已安装技能" value={`${mergedSkills.length}`} />
            <SummaryTag
              label="来源类型"
              value={`${new Set(mergedSkills.map(item => item.source_type)).size}`}
            />
          </div>
        </CardHeader>
      </Card>

      <Card className="border border-border">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:max-w-4xl">
              <Select value={selectedSourceType} onValueChange={setSelectedSourceType}>
                <SelectTrigger className="w-full shrink-0 sm:w-52 lg:w-48">
                  <SelectValue placeholder="来源类型" />
                </SelectTrigger>
                <SelectContent>
                  {sourceOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={event => setSearchTerm(event.target.value)}
                  placeholder="搜索技能"
                  className="pl-9"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => void handleRefresh()}
                disabled={!activeAgentId || loading}
                title="同步已安装技能"
                className="shrink-0"
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
            <div ref={containerRef} className="max-h-[calc(100vh-22rem)] overflow-y-auto pr-1">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visibleSkills.map(skill => (
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
                      <div className="mt-2 flex items-center gap-2 text-xs leading-5 text-muted-foreground">
                        <span>来源类型</span>
                        <SkillOriginBadge sourceType={skill.source_type} />
                      </div>
                      <div className="mt-3 flex justify-end gap-3">
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-red-600 hover:text-red-700 disabled:text-muted-foreground"
                          onClick={() => void handleUninstallSkill(skill)}
                          disabled={uninstallingSkillId === skill.skill_id || !activeAgentId}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          {uninstallingSkillId === skill.skill_id ? '卸载中...' : '卸载'}
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
              <div className="flex min-h-10 items-center justify-center py-4 text-sm text-muted-foreground">
                {hasMore
                  ? `继续向下滚动以加载更多（已显示 ${visibleSkills.length} / ${filteredSkills.length}）`
                  : `已显示全部 ${filteredSkills.length} 个已安装技能`}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!previewSkill} onOpenChange={open => !open && setPreviewSkill(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader className="gap-3">
            <div className="space-y-3 pr-8">
              <DialogTitle className="text-base">
                {previewSkill ? extractSkillName(previewSkill.skill_name) : '技能预览'}
              </DialogTitle>
              {previewSkill ? (
                <div className="space-y-1 text-sm">
                  <InfoLine
                    icon={FolderOpen}
                    label="来源类型"
                    value={formatSkillSourceLabel(previewSkill.source_type)}
                  />
                  <InfoLine
                    icon={previewSkill.skill_md_url ? ExternalLink : FolderOpen}
                    label="skill 路径"
                    value={previewSkill.skill_md_url || previewSkill.relative_path || '-'}
                    href={
                      previewSkill.skill_md_url && isHttpUrl(previewSkill.skill_md_url)
                        ? previewSkill.skill_md_url
                        : undefined
                    }
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

function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://')
}
