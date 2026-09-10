import type { Agent, AgentTemplateInfo } from './types'

/**
 * 模版是否已实例化：一模板一实例，agent 列表中同名即视为已创建。
 * 模版墙（agent-template-chips）与智能体页（agent-page）共用此判定，
 * 避免两处各持一份副本导致「已创建」状态不一致。
 */
export function isTemplateInstantiated(agents: Agent[], template: AgentTemplateInfo): boolean {
  return agents.some(agent => agent.name === template.name)
}

/**
 * 需要置顶展示的模版名，按数组顺序即为展示顺序。
 */
export const PINNED_TEMPLATE_NAMES = ['os-perf-optimizer']

/**
 * 把置顶模版排到最前面，其余模版保持后端返回的相对顺序（稳定排序）。
 *
 * 模版顺序由后端返回、前端不可依赖，因此顺序调整放在前端展示层而非后端：
 * 置顶模版不存在时（后端还没下发）自动忽略、退回原顺序，不会凭空造出条目。
 */
export function orderTemplatesWithPinnedFirst(templates: AgentTemplateInfo[]): AgentTemplateInfo[] {
  const byName = new Map(templates.map(template => [template.name, template]))
  const pinned = PINNED_TEMPLATE_NAMES.map(name => byName.get(name)).filter(
    (template): template is AgentTemplateInfo => template !== undefined
  )
  // 没有命中任何置顶模版时原样返回，避免无意义的数组复制
  if (pinned.length === 0) return templates
  return [
    ...pinned,
    ...templates.filter(template => !PINNED_TEMPLATE_NAMES.includes(template.name)),
  ]
}
