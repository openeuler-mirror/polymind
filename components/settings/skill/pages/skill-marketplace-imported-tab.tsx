'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { extractApiErrorMessage } from '@/lib/error-handler'
import { SkillRepositoryResponse, SkillResponse } from '@/lib/types'
import { skillService } from '@/services/skill-service'
import {
  EmptyState,
  SkillMarketplaceCard,
  SkillPreviewItem,
  SkillSourceMeta,
} from './skill-marketplace-shared'
import { useAutoLoadOnScroll } from './use-auto-load-on-scroll'

const SOURCE_FILTER_ALL = 'all'
const IMPORTED_BATCH_SIZE = 24

export function ImportedMarketplaceTab({
  activeAgentId,
  installedSkillIds,
  installingSkillKey,
  onInstall,
  onPreview,
  onCountChange,
}: {
  activeAgentId: string | null
  installedSkillIds: Set<string>
  installingSkillKey: string | null
  onInstall: (skill: SkillResponse) => Promise<void>
  onPreview: (item: SkillPreviewItem) => void
  onCountChange?: (count: number) => void
}) {
  const { t } = useTranslation('settings')
  const [importedSkills, setImportedSkills] = useState<SkillResponse[]>([])
  const [repositories, setRepositories] = useState<SkillRepositoryResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedSource, setSelectedSource] = useState<string>(SOURCE_FILTER_ALL)
  const [visibleCountByFilter, setVisibleCountByFilter] = useState<Record<string, number>>({})
  const { toast } = useToast()

  const sourceByRepoId = useMemo(
    () =>
      new Map(
        repositories.map(repo => [
          repo.repo_id,
          {
            name: repo.repo_name || '-',
            sourceType: repo.source_type || 'local',
          } satisfies SkillSourceMeta,
        ])
      ),
    [repositories]
  )

  const repositoryOptions = useMemo(() => {
    const uniqueSources = Array.from(
      new Set(
        importedSkills
          .map(skill => {
            if (!skill.repo_id) {
              return undefined
            }
            return sourceByRepoId.get(skill.repo_id)?.name
          })
          .filter((value): value is string => Boolean(value))
      )
    )

    return [
      { label: t('skill.marketplace.allRepositories'), value: SOURCE_FILTER_ALL },
      ...uniqueSources.map(value => ({ label: value, value })),
    ]
  }, [importedSkills, sourceByRepoId, t])

  const filteredSkills = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase()

    return importedSkills.filter(skill => {
      const source = skill.repo_id ? sourceByRepoId.get(skill.repo_id) : undefined
      const matchesRepository =
        selectedSource === SOURCE_FILTER_ALL || source?.name === selectedSource
      const matchesSearch =
        !keyword ||
        [source?.name, skill.skill_md_url, skill.skill_name, skill.relative_path]
          .filter(Boolean)
          .some(value => value!.toLowerCase().includes(keyword))

      return matchesRepository && matchesSearch
    })
  }, [importedSkills, searchTerm, selectedSource, sourceByRepoId])

  const filterKey = `${searchTerm}\u0000${selectedSource}\u0000${importedSkills.length}`
  const visibleCount = visibleCountByFilter[filterKey] ?? IMPORTED_BATCH_SIZE

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
          (prev[filterKey] ?? IMPORTED_BATCH_SIZE) + IMPORTED_BATCH_SIZE,
          filteredSkills.length
        ),
      }))
    },
    contentVersion: visibleSkills.length,
  })

  const refreshImportedMarketplace = useCallback(async () => {
    try {
      setLoading(true)
      const [repositoriesResult, localSkillsResult] = await Promise.allSettled([
        skillService.listRepositoryResponses(),
        skillService.listAllSkills(),
      ])

      const nextRepositories =
        repositoriesResult.status === 'fulfilled'
          ? repositoriesResult.value.filter(repo => repo.source_type !== 'wittyhub')
          : []
      const nextSkills = localSkillsResult.status === 'fulfilled' ? localSkillsResult.value : []

      if (repositoriesResult.status === 'rejected' && localSkillsResult.status === 'rejected') {
        throw repositoriesResult.reason || localSkillsResult.reason
      }

      setRepositories(nextRepositories)
      setImportedSkills(nextSkills)
    } catch (error) {
      console.error('Failed to refresh imported skill marketplace:', error)
      toast({
        title: t('skill.marketplace.toast.loadFailed'),
        description: extractApiErrorMessage(error, t('skill.marketplace.toast.loadImportedDesc')),
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [t, toast])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshImportedMarketplace()
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [refreshImportedMarketplace])

  useEffect(() => {
    onCountChange?.(importedSkills.length)
  }, [importedSkills.length, onCountChange])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex w-full flex-col gap-3 xl:flex-row xl:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedSource} onValueChange={setSelectedSource}>
              <SelectTrigger className="w-80 shrink-0">
                <SelectValue placeholder={t('skill.marketplace.filterByRepository')} />
              </SelectTrigger>
              <SelectContent>
                {repositoryOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative min-w-0 flex-1 xl:max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder={t('skill.marketplace.searchImported')}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <EmptyState text={t('skill.marketplace.loadingImported')} />
      ) : filteredSkills.length === 0 ? (
        <EmptyState text={t('skill.marketplace.emptyImported')} />
      ) : (
        <div ref={containerRef} className="max-h-[calc(100vh-22rem)] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleSkills.map(skill => {
              const source = skill.repo_id ? sourceByRepoId.get(skill.repo_id) : undefined
              const installLabel =
                installingSkillKey === skill.skill_id
                  ? t('skill.marketplace.installing')
                  : installedSkillIds.has(skill.skill_id)
                    ? t('skill.marketplace.installed')
                    : t('skill.marketplace.install')
              const installDisabled =
                !activeAgentId ||
                !skill.skill_id ||
                installedSkillIds.has(skill.skill_id) ||
                installingSkillKey === skill.skill_id

              return (
                <SkillMarketplaceCard
                  key={skill.skill_id}
                  skill={skill}
                  source={source}
                  installDisabled={installDisabled}
                  installLabel={installLabel}
                  onInstall={onInstall}
                  onPreview={(nextSkill, nextSource) =>
                    onPreview({ skill: nextSkill, source: nextSource })
                  }
                />
              )
            })}
          </div>
          <div className="flex min-h-10 items-center justify-center py-4 text-sm text-muted-foreground">
            {hasMore
              ? t('skill.marketplace.scrollMoreSummary', {
                  visible: visibleSkills.length,
                  total: filteredSkills.length,
                })
              : t('skill.marketplace.allDisplayedImported', { total: filteredSkills.length })}
          </div>
        </div>
      )}
    </div>
  )
}
