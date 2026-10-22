import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Loader2 } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { mcpServerService } from '@/services/mcp-server-service'
import { modelService } from '@/services/model-service'
import { skillService } from '@/services/skill-service'
import type { Agent, AgentTemplateInfo, McpServerResponse, ModelConfig } from '@/lib/types'
import { avatarGradient, avatarLabel } from './agent-avatar'

/** 详情弹窗内的分区标题（标题 + 可选计数）。 */
function DetailSection({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children: ReactNode
}) {
  return (
    <section className="space-y-2">
      <h4 className="text-sm font-semibold tracking-tight">
        {title}
        {count !== undefined && count > 0 ? (
          <span className="ml-1 font-normal text-muted-foreground">({count})</span>
        ) : null}
      </h4>
      {children}
    </section>
  )
}

/**
 * 只读详情：能力概览 → 技能 → MCP → 示例提问。
 *
 * 技能名取自 /agents/{id}/skills/installed（Agent 接口不返回 skills）；
 * MCP 服务器与模型只存 ID，需要换名称后展示。
 */
export function AgentDetailDialog({
  agent,
  template,
  onClose,
  onApplySuggestion,
}: {
  agent: Agent
  template: AgentTemplateInfo | null
  onClose: () => void
  onApplySuggestion: (prompt: string) => void
}) {
  const { t } = useTranslation('tool-panel')
  const [skillNames, setSkillNames] = useState<string[] | null>(null)
  const [skillsLoadFailed, setSkillsLoadFailed] = useState(false)
  const [servers, setServers] = useState<McpServerResponse[] | null>(null)
  const [models, setModels] = useState<ModelConfig[]>([])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const [skillResult, serverResult, modelResult] = await Promise.allSettled([
        skillService.listInstalledSkills(agent.id),
        mcpServerService.getServers(),
        modelService.getModels(),
      ])
      if (cancelled) return
      if (skillResult.status === 'fulfilled') {
        setSkillNames(
          Array.from(new Set(skillResult.value.map(skill => skill.skill_name).filter(Boolean)))
        )
      } else {
        console.error('Failed to load agent skills for detail:', skillResult.reason)
        setSkillsLoadFailed(true)
      }
      if (serverResult.status === 'fulfilled') {
        setServers(serverResult.value)
      } else {
        console.error('Failed to load MCP servers for agent detail:', serverResult.reason)
      }
      if (modelResult.status === 'fulfilled') setModels(modelResult.value)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [agent.id])

  // 只认接口返回的已安装技能：成功但为空就是没装，不拿模板声明充数
  const installedSkillNames = skillNames ?? []
  const boundServerIds = new Set(agent.mcpServerList ?? [])
  const boundServers = (servers ?? []).filter(server => boundServerIds.has(server.id))
  const modelName = models.find(model => model.id === agent.modelId)?.name

  // 兼容未升级的后端：只有单条 default_prompt；自建 Agent 退回通用引导
  const templatePrompts = template?.defaultPrompts.length
    ? template.defaultPrompts
    : template?.defaultPrompt
      ? [template.defaultPrompt]
      : []
  const suggestions = templatePrompts.length
    ? templatePrompts
    : [
        t('agent.detail.genericPromptCapability'),
        t('agent.detail.genericPromptSkills'),
        t('agent.detail.genericPromptPlan'),
      ]

  // 模型名解析不到就整段省略；技能数在加载完成前不展示，避免先出现 0 再跳变
  const metaItems = [
    modelName ?? null,
    skillNames === null ? null : t('agent.skillCount', { count: skillNames.length }),
  ].filter((item): item is string => Boolean(item))

  return (
    <Dialog
      open
      onOpenChange={next => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-x-hidden overflow-y-auto scrollbar-thin sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-3 pr-8">
            <span
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-on-gradient/80"
              style={{ background: avatarGradient(agent.name) }}
            >
              {avatarLabel(agent.name)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="truncate text-lg font-semibold leading-tight">{agent.name}</span>
              {metaItems.length > 0 ? (
                <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-normal text-muted-foreground">
                  {metaItems.map((item, index) => (
                    <span key={item} className="flex min-w-0 items-center gap-1.5">
                      {index > 0 ? <span aria-hidden>·</span> : null}
                      <span className="max-w-full truncate">{item}</span>
                    </span>
                  ))}
                </span>
              ) : null}
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">{t('agent.detail.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <DetailSection title={t('agent.detail.capabilityTitle')}>
            <p className="wrap-break-word text-sm leading-relaxed text-muted-foreground">
              {agent.description || t('agent.noDescription')}
            </p>
          </DetailSection>

          {/* 只列技能名：描述与安装路径太长，会撑出横向滚动条 */}
          <DetailSection title={t('agent.detail.strengthTitle')} count={skillNames?.length}>
            {skillNames === null && !skillsLoadFailed ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('agent.detail.skillLoading')}
              </p>
            ) : skillsLoadFailed ? (
              <p className="text-sm text-destructive">{t('agent.detail.skillLoadFailed')}</p>
            ) : installedSkillNames.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('agent.detail.skillEmpty')}</p>
            ) : (
              <div className="flex max-h-32 flex-wrap content-start gap-1.5 overflow-x-hidden overflow-y-auto pr-1 scrollbar-thin">
                {installedSkillNames.map(name => (
                  <span
                    key={name}
                    className="max-w-full truncate rounded-lg bg-muted/60 px-3 py-1.5 text-xs text-foreground/80"
                  >
                    {name}
                  </span>
                ))}
              </div>
            )}
          </DetailSection>

          {/* 没绑定 MCP 就整块不出现，不留空块 */}
          {boundServers.length > 0 ? (
            <DetailSection title={t('agent.detail.mcpTitle')} count={boundServers.length}>
              <div className="flex max-h-24 flex-wrap content-start gap-1.5 overflow-x-hidden overflow-y-auto pr-1 scrollbar-thin">
                {boundServers.map(server => (
                  <span
                    key={server.id}
                    className="max-w-full truncate rounded-lg bg-muted/60 px-3 py-1.5 text-xs text-foreground/80"
                  >
                    {server.mcp_server_name}
                  </span>
                ))}
              </div>
            </DetailSection>
          ) : null}

          <DetailSection title={t('agent.detail.suggestTitle')}>
            <ul className="space-y-2">
              {suggestions.map(prompt => (
                <li key={prompt}>
                  <button
                    type="button"
                    onClick={() => onApplySuggestion(prompt)}
                    className="flex w-full items-center gap-2 rounded-xl border bg-muted/30 px-4 py-3 text-left text-sm leading-relaxed transition-colors hover:border-primary/40 hover:bg-muted/60"
                  >
                    <span className="min-w-0 flex-1 wrap-break-word">{prompt}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </DetailSection>
        </div>
      </DialogContent>
    </Dialog>
  )
}
