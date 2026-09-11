'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Plus, CheckCircle2, RefreshCw } from 'lucide-react'
import { agentService } from '@/services/agent-service'
import { AgentTemplateInfo } from '@/lib/types'
import { isTemplateInstantiated, orderTemplatesWithPinnedFirst } from '@/lib/agent-template-utils'
import { useTemplateInstantiate } from '@/hooks/use-template-instantiate'
import { ScrollCarousel } from '@/components/common/scroll-carousel'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'

/**
 * Agent 模版快捷墙。
 * 作为输入框上方的一排左对齐 chips 展示，一键实例化对应 Agent。
 * 实例化流程（选中 / 错误分类 / 刷新）与智能体页共用 useTemplateInstantiate。
 */
export function AgentTemplateChips() {
  const { t } = useTranslation('chat')
  const [templates, setTemplates] = useState<AgentTemplateInfo[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [templateLoadError, setTemplateLoadError] = useState(false)
  const { instantiatingTemplate, instantiateTemplate, refreshAgents } = useTemplateInstantiate()
  // Agent 列表以全局 store 为唯一来源：智能体页的删除/新增/暂停都会同步到 store，
  // 模版墙据此实时更新「已创建」状态，避免两处各持副本导致状态不一致。
  const agents = useChatStore(state => state.agents)
  const prefillComposer = useChatStore(state => state.prefillComposer)
  const reportTemplateWall = useChatStore(state => state.reportTemplateWall)
  const setTemplateHintAnchor = useChatStore(state => state.setTemplateHintAnchor)
  const dismissTemplateHint = useChatStore(state => state.dismissTemplateHint)

  const fetchTemplates = useCallback(async () => {
    try {
      setTemplatesLoading(true)
      setTemplateLoadError(false)
      const data = await agentService.getAgentTemplates()
      // 展示顺序在此处定版：模版墙的渲染顺序与上报给 store 的 names 顺序同源，
      // 置顶模版（如 os-perf-optimizer）存在时固定排第一，其余保持后端顺序。
      setTemplates(orderTemplatesWithPinnedFirst(data))
    } catch (err) {
      console.error('Failed to fetch agent templates:', err)
      setTemplateLoadError(true)
    } finally {
      setTemplatesLoading(false)
    }
  }, [])

  // 挂载时与服务端对齐一次（模版列表 + agent 列表，后者写入全局 store）
  useEffect(() => {
    fetchTemplates()
    refreshAgents()
  }, [fetchTemplates, refreshAgents])

  // 向 store 上报模版墙状态：气泡据此判定「是否已有模版 agent」与「是否可指向模版墙」。
  useEffect(() => {
    reportTemplateWall({
      ready: !templatesLoading && !templateLoadError && templates.length > 0,
      names: templates.map(template => template.name),
    })
  }, [templatesLoading, templateLoadError, templates, reportTemplateWall])

  // 把模版墙根节点注册为引导气泡的锚点；卸载时回调收到 null，气泡随之收起。
  const attachTemplateHintAnchor = useCallback(
    (node: HTMLDivElement | null) => setTemplateHintAnchor(node),
    [setTemplateHintAnchor]
  )

  const handleTemplateClick = async (template: AgentTemplateInfo) => {
    // 用户已按引导点击模版，气泡使命结束（无论实例化是否成功）。
    dismissTemplateHint()
    const outcome = await instantiateTemplate(template)
    // 新建成功后模版列表本身不变，重取一次以防后端刷新了模板元数据
    if (outcome === 'instantiated') fetchTemplates()
    // 只有确实选中了 Agent（新建成功 / 命中既有）才填默认提问
    if (outcome !== 'instantiated' && outcome !== 'already-instantiated') return
    if (template.defaultPrompt) prefillComposer(template.defaultPrompt)
  }

  if (templatesLoading) {
    return (
      <div className="flex h-6 items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('template.chips.loading')}
      </div>
    )
  }

  if (templateLoadError) {
    return (
      <button
        type="button"
        onClick={fetchTemplates}
        className="inline-flex h-6 items-center gap-1.5 rounded-full border border-dashed border-border px-4 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        {t('template.chips.loadFailed')}
      </button>
    )
  }

  if (templates.length === 0) return null

  return (
    <ScrollCarousel ref={attachTemplateHintAnchor} leftMask>
      {templates.map(template => {
        const instantiated = isTemplateInstantiated(agents, template)
        const isInstantiating = instantiatingTemplate === template.name
        const disabled = instantiatingTemplate !== null
        // 带默认提问的模版点击后会把提问填进输入框：在原生 tooltip 里先说清楚「会填什么」
        const chipTitle = template.defaultPrompt
          ? `${template.description || template.name}\n\n${t('template.chips.willFill', {
              prompt: template.defaultPrompt,
            })}`
          : template.description || template.name
        return (
          <button
            key={template.name}
            type="button"
            title={chipTitle}
            aria-label={
              instantiated
                ? t('template.chips.createdAria', { name: template.name })
                : t('template.chips.createAria', { name: template.name })
            }
            aria-busy={isInstantiating}
            disabled={disabled}
            onClick={() => handleTemplateClick(template)}
            className={cn(
              'group inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-sm transition-all',
              'hover:border-primary/40 hover:shadow-sm',
              disabled && 'cursor-default opacity-60'
            )}
          >
            {isInstantiating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : instantiated ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            ) : (
              <Plus className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-primary" />
            )}
            <span className="max-w-[140px] truncate font-medium">{template.name}</span>
          </button>
        )
      })}
    </ScrollCarousel>
  )
}
