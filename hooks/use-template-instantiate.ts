'use client'

import { useCallback, useState } from 'react'
import { agentService } from '@/services/agent-service'
import { modelService } from '@/services/model-service'
import { extractApiErrorMessage } from '@/lib/error-handler'
import type { AgentTemplateInfo } from '@/lib/types'
import { useChatStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'

/**
 * 模板一键实例化的结果。
 * 调用方据此决定是否做额外刷新（如模版墙重新拉取模版列表），
 * 避免每个调用点各自复制一份「选中 / 报错 / 刷新」的逻辑。
 */
export type TemplateInstantiateOutcome =
  | 'instantiated'
  | 'already-instantiated'
  | 'missing-default-model'
  | 'failed'

/**
 * 预置模板实例化：模版墙（agent-template-chips）与智能体页（agent-page）共用。
 *
 * 流程：同名 Agent 已存在 → 直接选中；否则现取 enabled && isDefault 的模型
 * （不缓存，避免前后端默认模型错位）→ 一键实例化 → 写入 store 并选中。
 */
export function useTemplateInstantiate() {
  const setAgents = useChatStore(state => state.setAgents)
  const addAgent = useChatStore(state => state.addAgent)
  const setCurrentAgent = useChatStore(state => state.setCurrentAgent)
  const openDefaultModelDialog = useChatStore(state => state.openDefaultModelDialog)
  const { toast } = useToast()
  const [instantiatingTemplate, setInstantiatingTemplate] = useState<string | null>(null)

  /** 与服务端对齐 agent 列表（失败不打断主流程，仅记录）。 */
  const refreshAgents = useCallback(() => {
    agentService
      .getAgents()
      .then(setAgents)
      .catch(err => console.error('Failed to fetch agents:', err))
  }, [setAgents])

  const handleInstantiateError = useCallback(
    (template: AgentTemplateInfo, err: unknown): TemplateInstantiateOutcome => {
      const apiError = err as {
        statusCode?: number
        details?: { error?: { code?: string; details?: { agent_id?: string } } }
      }
      const statusCode = apiError.statusCode
      const code = apiError.details?.error?.code

      if (statusCode === 400) {
        // 默认模型被删/禁用等 → 提示并重新拉起默认模型弹窗
        openDefaultModelDialog()
        toast({
          title: '实例化失败',
          description: '默认模型不可用，请先重新选择一个默认模型。',
          variant: 'destructive',
        })
        return 'missing-default-model'
      }

      if (statusCode === 409 || code === 'AGENT_ALREADY_INSTANTIATED') {
        // 前置判定漏网时的兜底：刷新并选中既有 agent
        const agentId = apiError.details?.error?.details?.agent_id
        if (agentId) {
          setCurrentAgent(agentId)
        } else {
          const existing = useChatStore
            .getState()
            .agents.find(agent => agent.name === template.name)
          if (existing) setCurrentAgent(existing.id)
        }
        refreshAgents()
        toast({
          title: '模板已实例化',
          description: `同名 Agent「${template.name}」已存在，为你选中它。`,
        })
        return 'already-instantiated'
      }

      // 404 / 网络 / gitcode 失败等其他错误 → toast 错误信息
      toast({
        title: '实例化失败',
        description: extractApiErrorMessage(err, '实例化失败，请稍后重试'),
        variant: 'destructive',
      })
      return 'failed'
    },
    [openDefaultModelDialog, refreshAgents, setCurrentAgent, toast]
  )

  const instantiateTemplate = useCallback(
    async (template: AgentTemplateInfo): Promise<TemplateInstantiateOutcome> => {
      // 已实例化：不发起实例化，直接选中既有 agent
      const existing = useChatStore.getState().agents.find(a => a.name === template.name)
      if (existing) {
        setCurrentAgent(existing.id)
        toast({
          title: '已创建的 Agent',
          description: `模板「${template.name}」已实例化，选中对应 Agent。`,
        })
        return 'already-instantiated'
      }

      try {
        // 现取 enabled && isDefault 的模型，避免前后端默认模型错位（现取不缓存）
        const modelList = await modelService.getModels()
        const defaultModel = modelList.find(model => model.enabled && model.isDefault)
        if (!defaultModel) {
          // 无默认模型 → 打开弹窗，不创建
          openDefaultModelDialog()
          toast({
            title: '请先配置默认模型',
            description: '实例化模板需要先设置一个可用的默认模型。',
          })
          return 'missing-default-model'
        }

        setInstantiatingTemplate(template.name)
        const newAgent = await agentService.instantiateAgentTemplate(template.name, defaultModel.id)
        addAgent(newAgent)
        setCurrentAgent(newAgent.id)
        toast({
          title: '成功',
          description: `已创建 Agent「${template.name}」。`,
        })
        refreshAgents()
        return 'instantiated'
      } catch (err) {
        console.error('Failed to instantiate template:', err)
        return handleInstantiateError(template, err)
      } finally {
        setInstantiatingTemplate(null)
      }
    },
    [
      addAgent,
      handleInstantiateError,
      openDefaultModelDialog,
      refreshAgents,
      setCurrentAgent,
      toast,
    ]
  )

  return { instantiatingTemplate, instantiateTemplate, refreshAgents }
}
