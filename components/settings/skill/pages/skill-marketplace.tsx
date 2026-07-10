'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { useChatStore } from '@/lib/store'
import { AgentSkillResponse, SkillResponse } from '@/lib/types'
import { skillService, WITTYHUB_REPO_ID } from '@/services/skill-service'
import { ImportedMarketplaceTab } from './skill-marketplace-imported-tab'
import { SkillMarketplacePreviewDialog, SkillPreviewItem } from './skill-marketplace-shared'
import { WittyHubMarketplaceTab } from './skill-marketplace-wittyhub-tab'

const MARKETPLACE_TAB_WITTYHUB = 'wittyhub'
const MARKETPLACE_TAB_IMPORTED = 'imported'

function buildWittyHubInstallKey(skillName: string, sourceUrl: string) {
  return `wittyhub:${sourceUrl.trim()}:${skillName.trim()}`
}

function resolveWittyHubSourceUrl(skill: Pick<SkillResponse, 'skill_source' | 'metadata'>) {
  if (typeof skill.skill_source === 'string' && skill.skill_source.trim()) {
    return skill.skill_source.trim()
  }
  const metadataSourceUrl = skill.metadata?.['source_url']
  return typeof metadataSourceUrl === 'string' ? metadataSourceUrl.trim() : ''
}

function buildInstalledSkillKey(skill: AgentSkillResponse) {
  if (skill.source_type === 'wittyhub') {
    return buildWittyHubInstallKey(skill.skill_name, skill.skill_source || '')
  }
  return skill.skill_id
}

export function SkillMarketplace() {
  const currentAgentId = useChatStore(state => state.currentAgentId)
  const agents = useChatStore(state => state.agents)
  const [activeTab, setActiveTab] = useState<string>(MARKETPLACE_TAB_WITTYHUB)
  const [previewItem, setPreviewItem] = useState<SkillPreviewItem | null>(null)
  const [installingSkillKey, setInstallingSkillKey] = useState<string | null>(null)
  const [installedSkillIds, setInstalledSkillIds] = useState<Set<string>>(new Set())
  const [installedWittyHubSkillKeys, setInstalledWittyHubSkillKeys] = useState<Set<string>>(
    new Set()
  )
  const [importedSkillCount, setImportedSkillCount] = useState(0)
  const [wittyhubSkillCount, setWittyhubSkillCount] = useState(0)
  const { toast } = useToast()

  const activeAgentId = useMemo(
    () =>
      currentAgentId && agents.some(agent => agent.id === currentAgentId) ? currentAgentId : null,
    [agents, currentAgentId]
  )

  const refreshInstalledSkillIds = useCallback(async (agentId: string) => {
    try {
      const installed = await skillService.listInstalledSkills(agentId)
      const ids = new Set<string>()
      const wittyhubKeys = new Set<string>()
      installed.forEach(item => {
        const key = buildInstalledSkillKey(item)
        if (item.source_type === 'wittyhub') {
          wittyhubKeys.add(key)
          return
        }
        if (typeof item.skill_id === 'string' && item.skill_id) {
          ids.add(item.skill_id)
        }
      })
      setInstalledSkillIds(ids)
      setInstalledWittyHubSkillKeys(wittyhubKeys)
    } catch (error) {
      console.error('Failed to load installed skills for marketplace:', error)
    }
  }, [])

  const refreshMarketplaceCounts = useCallback(async () => {
    try {
      const [importedSkillsResult, wittyhubStatsResult] = await Promise.allSettled([
        skillService.listAllSkills(),
        skillService.getWittyHubStats(),
      ])

      if (importedSkillsResult.status === 'fulfilled') {
        setImportedSkillCount(importedSkillsResult.value.length)
      }

      if (wittyhubStatsResult.status === 'fulfilled') {
        setWittyhubSkillCount(wittyhubStatsResult.value.total_skills)
      }
    } catch (error) {
      console.error('Failed to refresh marketplace counts:', error)
    }
  }, [])

  useEffect(() => {
    if (!activeAgentId) {
      setInstalledSkillIds(new Set())
      setInstalledWittyHubSkillKeys(new Set())
      return
    }

    void refreshInstalledSkillIds(activeAgentId)
  }, [activeAgentId, refreshInstalledSkillIds])

  useEffect(() => {
    void refreshMarketplaceCounts()
  }, [refreshMarketplaceCounts])

  const handleInstallSkill = useCallback(
    async (skill: SkillResponse) => {
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

      const isWittyHubSkill = skill.repo_id === WITTYHUB_REPO_ID
      const wittyHubSourceUrl = isWittyHubSkill ? resolveWittyHubSourceUrl(skill) : ''
      const wittyHubInstallKey =
        isWittyHubSkill && wittyHubSourceUrl
          ? buildWittyHubInstallKey(skill.skill_name, wittyHubSourceUrl)
          : null

      if (isWittyHubSkill && !wittyHubSourceUrl) {
        toast({
          title: '安装失败',
          description: 'WittyHub 技能缺少来源地址，暂时无法安装。',
          variant: 'destructive',
        })
        return
      }

      const alreadyInstalled = isWittyHubSkill
        ? wittyHubInstallKey !== null && installedWittyHubSkillKeys.has(wittyHubInstallKey)
        : installedSkillIds.has(skill.skill_id)

      if (alreadyInstalled) {
        toast({
          title: '已安装',
          description: `技能 ${skill.skill_name.split('/').pop() || skill.skill_name} 已安装。`,
        })
        return
      }

      try {
        setInstallingSkillKey(skill.skill_id)
        await skillService.installSkill(activeAgentId, {
          skill_id: skill.skill_id,
          skill_name: skill.skill_name,
          source_type: isWittyHubSkill ? 'wittyhub' : undefined,
          source_url: isWittyHubSkill ? wittyHubSourceUrl : undefined,
        })
        if (isWittyHubSkill && wittyHubInstallKey) {
          setInstalledWittyHubSkillKeys(prev => new Set([...prev, wittyHubInstallKey]))
        } else {
          setInstalledSkillIds(prev => new Set([...prev, skill.skill_id]))
        }
        toast({
          title: '安装成功',
          description: `技能 ${skill.skill_name.split('/').pop() || skill.skill_name} 已安装到当前 Agent。`,
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
    },
    [activeAgentId, installedSkillIds, installedWittyHubSkillKeys, toast]
  )

  return (
    <div className="space-y-6">
      <Card className="border border-border">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-0">
          <CardHeader className="gap-4">
            <TabsList className="grid h-auto w-full grid-cols-2">
              <TabsTrigger value={MARKETPLACE_TAB_WITTYHUB} className="py-3">
                WittyHub 技能 {wittyhubSkillCount ? `(${wittyhubSkillCount})` : ''}
              </TabsTrigger>
              <TabsTrigger value={MARKETPLACE_TAB_IMPORTED} className="py-3">
                导入的技能 ({importedSkillCount})
              </TabsTrigger>
            </TabsList>
          </CardHeader>
          <CardContent>
            {activeTab === MARKETPLACE_TAB_WITTYHUB ? (
              <WittyHubMarketplaceTab
                activeAgentId={activeAgentId}
                installedSkillKeys={installedWittyHubSkillKeys}
                installingSkillKey={installingSkillKey}
                onInstall={handleInstallSkill}
                onPreview={setPreviewItem}
                onStatsChange={setWittyhubSkillCount}
              />
            ) : (
              <ImportedMarketplaceTab
                activeAgentId={activeAgentId}
                installedSkillIds={installedSkillIds}
                installingSkillKey={installingSkillKey}
                onInstall={handleInstallSkill}
                onPreview={setPreviewItem}
                onCountChange={setImportedSkillCount}
              />
            )}
          </CardContent>
        </Tabs>
      </Card>

      <SkillMarketplacePreviewDialog
        previewItem={previewItem}
        onOpenChange={open => {
          if (!open) {
            setPreviewItem(null)
          }
        }}
      />
    </div>
  )
}
