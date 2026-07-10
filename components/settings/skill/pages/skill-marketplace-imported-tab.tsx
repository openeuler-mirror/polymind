'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
      { label: '全部仓库', value: SOURCE_FILTER_ALL },
      ...uniqueSources.map(value => ({ label: value, value })),
    ]
  }, [importedSkills, sourceByRepoId])

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
        title: '加载失败',
        description: '无法获取导入技能列表，请稍后重试。',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void refreshImportedMarketplace()
  }, [refreshImportedMarketplace])

  useEffect(() => {
    onCountChange?.(importedSkills.length)
  }, [importedSkills.length, onCountChange])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex w-full flex-col gap-3 xl:flex-row xl:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <span className="shrink-0 text-xs text-muted-foreground">仓库</span>
            <Select value={selectedSource} onValueChange={setSelectedSource}>
              <SelectTrigger className="w-80 shrink-0">
                <SelectValue placeholder="按仓库筛选" />
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
              placeholder="搜索导入技能"
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <EmptyState text="正在加载导入技能..." />
      ) : filteredSkills.length === 0 ? (
        <EmptyState text="暂无匹配的导入技能记录。" />
      ) : (
        <div ref={containerRef} className="max-h-[calc(100vh-22rem)] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleSkills.map(skill => {
              const source = skill.repo_id ? sourceByRepoId.get(skill.repo_id) : undefined
              const installLabel =
                installingSkillKey === skill.skill_id
                  ? '安装中...'
                  : installedSkillIds.has(skill.skill_id)
                    ? '已安装'
                    : '安装'
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
              ? `继续向下滚动以加载更多（已显示 ${visibleSkills.length} / ${filteredSkills.length}）`
              : `已显示全部 ${filteredSkills.length} 个导入技能`}
          </div>
        </div>
      )}
    </div>
  )
}
