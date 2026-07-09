'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { extractApiErrorMessage } from '@/lib/error-handler'
import { SkillResponse } from '@/lib/types'
import { skillService } from '@/services/skill-service'
import {
  EmptyState,
  SkillMarketplaceCard,
  SkillPreviewItem,
  SkillSourceMeta,
} from './skill-marketplace-shared'
import { useAutoLoadOnScroll } from './use-auto-load-on-scroll'

const WITTYHUB_PAGE_SIZE = 50

const WITTYHUB_SOURCE: SkillSourceMeta = {
  name: 'WittyHub',
  sourceType: 'wittyhub',
}

export function WittyHubMarketplaceTab({
  activeAgentId,
  installedSkillKeys,
  installingSkillKey,
  onInstall,
  onPreview,
  onStatsChange,
}: {
  activeAgentId: string | null
  installedSkillKeys: Set<string>
  installingSkillKey: string | null
  onInstall: (skill: SkillResponse) => Promise<void>
  onPreview: (item: SkillPreviewItem) => void
  onStatsChange?: (count: number) => void
}) {
  const [skills, setSkills] = useState<SkillResponse[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [nextSkip, setNextSkip] = useState(0)
  const { toast } = useToast()

  const statsTotalRef = useRef(0)

  const resolveSourceUrl = useCallback((skill: SkillResponse) => {
    if (typeof skill.skill_source === 'string' && skill.skill_source.trim()) {
      return skill.skill_source.trim()
    }
    const metadataSourceUrl = skill.metadata?.['source_url']
    return typeof metadataSourceUrl === 'string' ? metadataSourceUrl.trim() : ''
  }, [])

  const buildInstallKey = useCallback(
    (skill: SkillResponse) => {
      const sourceUrl = resolveSourceUrl(skill)
      return `wittyhub:${sourceUrl}:${skill.skill_name.trim()}`
    },
    [resolveSourceUrl]
  )

  const refreshStats = useCallback(async () => {
    try {
      const stats = await skillService.getWittyHubStats()
      statsTotalRef.current = stats.total_skills
      setTotal(prev => Math.max(prev, stats.total_skills))
      onStatsChange?.(stats.total_skills)
    } catch (error) {
      console.error('Failed to load wittyhub stats:', error)
      onStatsChange?.(0)
    }
  }, [onStatsChange])

  const loadPage = useCallback(
    async (skip: number, reset: boolean) => {
      const keyword = searchTerm.trim()
      const setLoadingState = reset ? setLoading : setLoadingMore

      try {
        setLoadingState(true)
        if (reset) {
          setSkills([])
          setHasMore(false)
          setNextSkip(0)
        }

        const page = keyword
          ? await skillService.searchWittyHubSkillsPage(keyword, skip, WITTYHUB_PAGE_SIZE)
          : await skillService.listWittyHubSkillsPage(skip, WITTYHUB_PAGE_SIZE)
        const resolvedTotal = keyword ? page.total : Math.max(page.total, statsTotalRef.current)
        const resolvedNextSkip = page.skip + page.skills.length
        const hasMoreByTotal = resolvedTotal > 0 && resolvedNextSkip < resolvedTotal
        const hasMoreByBatch = page.skills.length === WITTYHUB_PAGE_SIZE

        setSkills(prev => (reset ? page.skills : [...prev, ...page.skills]))
        setTotal(resolvedTotal || page.total)
        setNextSkip(resolvedNextSkip)
        setHasMore(hasMoreByTotal || hasMoreByBatch)
      } catch (error) {
        console.error('Failed to load wittyhub skills page:', error)
        toast({
          title: '加载失败',
          description: extractApiErrorMessage(error, '无法获取 WittyHub 技能列表，请稍后重试。'),
          variant: 'destructive',
        })
      } finally {
        setLoadingState(false)
      }
    },
    [searchTerm, toast]
  )

  const { containerRef } = useAutoLoadOnScroll({
    hasMore,
    loading: loading || loadingMore,
    onLoadMore: () => loadPage(nextSkip, false),
    contentVersion: skills.length,
  })

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshStats()
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [refreshStats])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPage(0, true)
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [loadPage, searchTerm])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1 lg:max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            placeholder="搜索 WittyHub 技能"
            className="pl-9"
          />
        </div>
      </div>

      {loading && skills.length === 0 ? (
        <EmptyState text="正在加载 WittyHub 技能..." />
      ) : skills.length === 0 ? (
        <EmptyState text="暂无匹配的 WittyHub 技能。" />
      ) : (
        <div ref={containerRef} className="max-h-[calc(100vh-22rem)] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {skills.map(skill => {
              const installKey = buildInstallKey(skill)
              const hasSourceUrl = Boolean(resolveSourceUrl(skill))

              return (
                <SkillMarketplaceCard
                  key={skill.skill_id}
                  skill={skill}
                  source={WITTYHUB_SOURCE}
                  installDisabled={
                    !activeAgentId ||
                    !skill.skill_name ||
                    !hasSourceUrl ||
                    installedSkillKeys.has(installKey) ||
                    installingSkillKey === skill.skill_id
                  }
                  installLabel={
                    installingSkillKey === skill.skill_id
                      ? '安装中...'
                      : installedSkillKeys.has(installKey)
                        ? '已安装'
                        : '安装'
                  }
                  onInstall={onInstall}
                  onPreview={(nextSkill, nextSource) =>
                    onPreview({ skill: nextSkill, source: nextSource })
                  }
                />
              )
            })}
          </div>
          <div className="flex min-h-10 items-center justify-center py-4 text-sm text-muted-foreground">
            {loadingMore
              ? '正在加载更多技能...'
              : hasMore
                ? '继续向下滚动以加载更多'
                : `已显示全部 ${total || skills.length} 个技能`}
          </div>
        </div>
      )}
    </div>
  )
}
