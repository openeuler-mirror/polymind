'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { useChatStore } from '@/lib/store'
import { AgentSkillResponse, SkillResponse } from '@/lib/types'
import { skillService, WITTYHUB_REPO_ID } from '@/services/skill-service'
import { ImportedMarketplaceTab } from './skill-marketplace-imported-tab'
import { SkillMarketplacePreviewDialog, SkillPreviewItem } from './skill-marketplace-shared'
import { WittyHubMarketplaceTab } from './skill-marketplace-wittyhub-tab'
import { extractSkillOperationErrorMessage } from './utils/skill-error-message'
import { extractSkillName } from './utils/skill-name'

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
  const { t } = useTranslation('settings')
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
    const timer = window.setTimeout(() => {
      if (!activeAgentId) {
        setInstalledSkillIds(new Set())
        setInstalledWittyHubSkillKeys(new Set())
        return
      }

      void refreshInstalledSkillIds(activeAgentId)
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [activeAgentId, refreshInstalledSkillIds])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshMarketplaceCounts()
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [refreshMarketplaceCounts])

  const handleInstallSkill = useCallback(
    async (skill: SkillResponse) => {
      if (!activeAgentId) {
        toast({
          title: t('skill.marketplace.toast.noAgentTitle'),
          description: t('skill.marketplace.toast.noAgentInstallDesc'),
          variant: 'destructive',
        })
        return
      }

      if (!skill.skill_id || !skill.skill_name) {
        toast({
          title: t('skill.marketplace.toast.installFailed'),
          description: t('skill.marketplace.toast.incompleteInfo'),
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
          title: t('skill.marketplace.toast.installFailed'),
          description: t('skill.marketplace.toast.missingSourceUrl'),
          variant: 'destructive',
        })
        return
      }

      const alreadyInstalled = isWittyHubSkill
        ? wittyHubInstallKey !== null && installedWittyHubSkillKeys.has(wittyHubInstallKey)
        : installedSkillIds.has(skill.skill_id)

      if (alreadyInstalled) {
        toast({
          title: t('skill.marketplace.toast.alreadyInstalled'),
          description: t('skill.marketplace.toast.alreadyInstalledDesc', {
            name: extractSkillName(skill.skill_name, t),
          }),
        })
        return
      }

      try {
        setInstallingSkillKey(skill.skill_id)
        await skillService.installSkill(activeAgentId, {
          skill_id: skill.skill_id,
          skill_name: skill.skill_name,
          source_type: isWittyHubSkill ? 'wittyhub' : undefined,
          skill_source: isWittyHubSkill ? wittyHubSourceUrl : undefined,
          metadata: isWittyHubSkill ? skill.metadata : undefined,
        })
        if (isWittyHubSkill && wittyHubInstallKey) {
          setInstalledWittyHubSkillKeys(prev => new Set([...prev, wittyHubInstallKey]))
        } else {
          setInstalledSkillIds(prev => new Set([...prev, skill.skill_id]))
        }
        toast({
          title: t('skill.marketplace.toast.installSuccess'),
          description: t('skill.marketplace.toast.installSuccessDesc', {
            name: extractSkillName(skill.skill_name, t),
          }),
        })
      } catch (error) {
        console.error('Failed to install skill:', error)
        toast({
          title: t('skill.marketplace.toast.installFailed'),
          description: extractSkillOperationErrorMessage(error, {
            operation: 'install',
            skillName: skill.skill_name,
            sourceType: isWittyHubSkill ? 'wittyhub' : undefined,
            sourceLabel: isWittyHubSkill
              ? t('skill.source.wittyhub')
              : t('skill.source.imported'),
            fallback: t('skill.marketplace.toast.installFailedDesc'),
            t,
          }),
          variant: 'destructive',
        })
      } finally {
        setInstallingSkillKey(null)
      }
    },
    [activeAgentId, installedSkillIds, installedWittyHubSkillKeys, t, toast]
  )

  return (
    <div className="space-y-6">
      <Card className="border border-border">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-0">
          <CardHeader className="gap-4">
            <TabsList className="grid h-auto w-full grid-cols-2">
              <TabsTrigger value={MARKETPLACE_TAB_WITTYHUB} className="py-3">
                {t('skill.marketplace.tabWittyhub')} {wittyhubSkillCount ? `(${wittyhubSkillCount})` : ''}
              </TabsTrigger>
              <TabsTrigger value={MARKETPLACE_TAB_IMPORTED} className="py-3">
                {t('skill.marketplace.tabImported', { count: importedSkillCount })}
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
