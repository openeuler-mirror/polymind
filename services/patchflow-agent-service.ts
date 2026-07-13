import { Agent, AdapterType, SandboxType } from '@/lib/types'
import { agentService } from '@/services/agent-service'
import { modelService } from '@/services/model-service'

const PATCHFLOW_AGENT_NAME = 'Patchflow-Agent'
const PATCHFLOW_AGENT_STORAGE_KEY = 'polymind:patchflow-agent-id'
const LEGACY_PATCHFLOW_AGENT_STORAGE_KEYS = ['polymind:cve:patchflow-agent-id']

class PatchflowAgentService {
  private rememberedPatchflowAgentId: string | null = null

  public async getOrCreatePatchflowAgent(): Promise<string> {
    const models = await modelService.getModels()
    const selectedModel = models.find((model) => model.enabled && model.isDefault)
      ?? models.find((model) => model.enabled)
    if (!selectedModel) {
      throw new Error('没有可用的模型配置，请先在设置中创建并启用模型')
    }

    let agents: Agent[] = []
    try {
      agents = await agentService.getAgents()
    } catch (error) {
      console.error('Failed to get agents:', error)
    }

    const running = agents
      .filter((agent) => this.isReusablePatchflowAgent(agent, selectedModel.id))
      .sort((l, r) => Date.parse(r.updatedAt) - Date.parse(l.updatedAt))

    const rememberedId = this.getRememberedPatchflowAgentId()
    const remembered = rememberedId ? running.find((agent) => agent.id === rememberedId) : undefined
    if (remembered) {
      this.rememberPatchflowAgent(remembered.id)
      await this.cleanupStalePatchflowAgents(agents, selectedModel.id, remembered.id)
      return remembered.id
    }

    const reusable = running[0]
    if (reusable) {
      this.rememberPatchflowAgent(reusable.id)
      await this.cleanupStalePatchflowAgents(agents, selectedModel.id, reusable.id)
      return reusable.id
    }

    await this.cleanupStalePatchflowAgents(agents, selectedModel.id)
    const newAgent = await agentService.createAgent({
      name: PATCHFLOW_AGENT_NAME,
      adapterType: AdapterType.OPENCLAW,
      sandboxType: SandboxType.LOCAL_PROCESS,
      idleTimeoutSeconds: 1800,
      modelId: selectedModel.id,
    })
    this.rememberPatchflowAgent(newAgent.id)
    return newAgent.id
  }

  private isPatchflowAgent(agent: Agent): boolean {
    return agent.name === PATCHFLOW_AGENT_NAME
      && String(agent.adapterType) === AdapterType.OPENCLAW
      && String(agent.sandboxType) === SandboxType.LOCAL_PROCESS
  }

  private isReusablePatchflowAgent(agent: Agent, modelId: string): boolean {
    return this.isPatchflowAgent(agent)
      && String(agent.status).toLowerCase() === 'running'
      && Number(agent.processPort || 0) > 0
      && agent.modelId === modelId
  }

  private async cleanupStalePatchflowAgents(agents: Agent[], modelId: string, keepAgentId?: string) {
    const staleAgents = agents.filter(
      (agent) => this.isPatchflowAgent(agent)
        && agent.id !== keepAgentId
        && !this.isReusablePatchflowAgent(agent, modelId),
    )

    for (const agent of staleAgents) {
      try {
        await agentService.deleteAgent(agent.id)
      } catch (error) {
        console.error(`Failed to delete stale Patchflow agent ${agent.id}:`, error)
      }
    }
  }

  private getRememberedPatchflowAgentId(): string | null {
    if (this.rememberedPatchflowAgentId) return this.rememberedPatchflowAgentId
    if (typeof window === 'undefined') return null

    const stored = window.sessionStorage.getItem(PATCHFLOW_AGENT_STORAGE_KEY)
    if (stored) {
      this.rememberedPatchflowAgentId = stored
      return stored
    }

    for (const key of LEGACY_PATCHFLOW_AGENT_STORAGE_KEYS) {
      const legacyStored = window.sessionStorage.getItem(key)
      if (legacyStored) {
        this.rememberPatchflowAgent(legacyStored)
        return legacyStored
      }
    }

    return null
  }

  private rememberPatchflowAgent(agentId: string) {
    this.rememberedPatchflowAgentId = agentId
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(PATCHFLOW_AGENT_STORAGE_KEY, agentId)
    }
  }
}

export const patchflowAgentService = new PatchflowAgentService()
