'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('settings')
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
      { label: t('skill.installed.allSources'), value: 'all' },
      ...uniqueSourceTypes.map(value => ({ label: formatSkillSourceLabel(value, t), value })),
    ]
  }, [mergedSkills, t])

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
          title: t('skill.installed.toast.loadFailed'),
          description: extractApiErrorMessage(error, t('skill.installed.toast.loadFailedDesc')),
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
      }
    },
    [t, toast]
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
        title: t('skill.installed.toast.refreshSuccess'),
        description: t('skill.installed.toast.refreshSuccessDesc'),
      })
    } catch (error) {
      console.error('Failed to sync installed skills:', error)
      toast({
        title: t('skill.installed.toast.refreshFailed'),
        description: extractApiErrorMessage(error, t('skill.installed.toast.refreshFailedDesc')),
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleUninstallSkill = async (skill: AgentSkillResponse) => {
    if (!activeAgentId) {
      toast({
        title: t('skill.installed.toast.noAgentTitle'),
        description: t('skill.installed.toast.noAgentUninstallDesc'),
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
        title: t('skill.installed.toast.uninstallSuccess'),
        description: t('skill.installed.toast.uninstallSuccessDesc', {
          name: extractSkillName(skill.skill_name, t),
        }),
      })
    } catch (error) {
      console.error('Failed to uninstall skill:', error)
      toast({
        title: t('skill.installed.toast.uninstallFailed'),
        description: extractSkillOperationErrorMessage(error, {
          operation: 'uninstall',
          skillName: skill.skill_name,
          sourceType: skill.source_type,
          runtimeSource: skill.skill_source,
          fallback: t('skill.installed.toast.uninstallFailedDesc'),
          t,
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
            <CardTitle>{t('skill.installed.title')}</CardTitle>
            <CardDescription>{t('skill.installed.description')}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SummaryTag
              label={t('skill.installed.summarySkills')}
              value={`${mergedSkills.length}`}
            />
            <SummaryTag
              label={t('skill.installed.summarySourceTypes')}
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
                  <SelectValue placeholder={t('skill.installed.sourceType')} />
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
                  placeholder={t('skill.installed.searchPlaceholder')}
                  className="pl-9"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => void handleRefresh()}
                disabled={!activeAgentId || loading}
                title={t('skill.installed.syncTitle')}
                className="shrink-0"
              >
                <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                {t('skill.installed.sync')}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!activeAgentId ? (
            <EmptyState text={t('skill.installed.emptyNoAgent')} />
          ) : loading ? (
            <EmptyState text={t('skill.installed.loading')} />
          ) : filteredSkills.length === 0 ? (
            <EmptyState text={t('skill.installed.empty')} />
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
                        {extractSkillName(skill.skill_name, t)}
                      </p>
                    </div>

                    <div className="flex-1">
                      <p className="min-h-12 line-clamp-2 text-sm leading-6 text-muted-foreground">
                        {extractSkillDescription(skill.metadata) ||
                          t('skill.marketplace.noDescription')}
                      </p>
                      <div className="mt-2 flex items-center gap-2 text-xs leading-5 text-muted-foreground">
                        <span>{t('skill.installed.sourceType')}</span>
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
                          {uninstallingSkillId === skill.skill_id
                            ? t('skill.installed.uninstalling')
                            : t('skill.installed.uninstall')}
                        </Button>
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-blue-600 hover:text-blue-700"
                          onClick={() => setPreviewSkill(skill)}
                        >
                          {t('skill.marketplace.preview')}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex min-h-10 items-center justify-center py-4 text-sm text-muted-foreground">
                {hasMore
                  ? t('skill.installed.scrollMoreSummary', {
                      visible: visibleSkills.length,
                      total: filteredSkills.length,
                    })
                  : t('skill.installed.allDisplayedInstalled', { total: filteredSkills.length })}
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
                {previewSkill
                  ? extractSkillName(previewSkill.skill_name, t)
                  : t('skill.marketplace.previewTitle')}
              </DialogTitle>
              {previewSkill ? (
                <div className="space-y-1 text-sm">
                  <InfoLine
                    icon={FolderOpen}
                    label={t('skill.installed.sourceType')}
                    value={formatSkillSourceLabel(previewSkill.source_type, t)}
                  />
                  <InfoLine
                    icon={previewSkill.skill_md_url ? ExternalLink : FolderOpen}
                    label={t('skill.marketplace.skillPath')}
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
