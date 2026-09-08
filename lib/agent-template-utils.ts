import type { Agent, AgentTemplateInfo } from './types'

/**
 * 模版是否已实例化：一模板一实例，agent 列表中同名即视为已创建。
 * 模版墙（agent-template-chips）与智能体页（agent-page）共用此判定，
 * 避免两处各持一份副本导致「已创建」状态不一致。
 */
export function isTemplateInstantiated(agents: Agent[], template: AgentTemplateInfo): boolean {
  return agents.some(agent => agent.name === template.name)
}
