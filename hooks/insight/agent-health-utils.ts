import type {
  AgentHealthStatus,
  AgentRuntimeHealthStatus,
  ManagedAgentHealthOverallStatus,
} from './types'

const STATUS_ORDER: Record<ManagedAgentHealthOverallStatus, number> = {
  offline: 0,
  hung: 1,
  unhealthy: 2,
  degraded: 3,
  missing_runtime: 4,
  ambiguous: 5,
  healthy: 6,
  unknown: 7,
  no_port: 8,
}

export interface ManagedHealthSummary {
  healthyCount: number
  degradedCount: number
  missingRuntimeCount: number
  ambiguousCount: number
  unhealthyCount: number
  hungCount: number
  offlineCount: number
  unknownCount: number
  noPortCount: number
  attentionCount: number
}

export function filterManagedHealthAgents<T extends { witty_agent_id: string }>(
  agents: T[],
  selectedWittyAgentId: string
): T[] {
  if (!selectedWittyAgentId || selectedWittyAgentId === 'all') {
    return agents
  }

  return agents.filter(agent => agent.witty_agent_id === selectedWittyAgentId)
}

export function sortManagedHealthAgents<
  T extends {
    overall_status: ManagedAgentHealthOverallStatus
    witty_agent_name: string
  },
>(agents: T[]): T[] {
  return [...agents].sort((left, right) => {
    const orderDelta = STATUS_ORDER[left.overall_status] - STATUS_ORDER[right.overall_status]

    if (orderDelta !== 0) {
      return orderDelta
    }

    return left.witty_agent_name.localeCompare(right.witty_agent_name)
  })
}

export function summarizeManagedHealthAgents(
  agents: Array<Pick<AgentHealthStatus, 'overall_status'>>
): ManagedHealthSummary {
  const summary: ManagedHealthSummary = {
    healthyCount: 0,
    degradedCount: 0,
    missingRuntimeCount: 0,
    ambiguousCount: 0,
    unhealthyCount: 0,
    hungCount: 0,
    offlineCount: 0,
    unknownCount: 0,
    noPortCount: 0,
    attentionCount: 0,
  }

  for (const agent of agents) {
    switch (agent.overall_status) {
      case 'healthy':
        summary.healthyCount += 1
        break
      case 'degraded':
        summary.degradedCount += 1
        summary.attentionCount += 1
        break
      case 'missing_runtime':
        summary.missingRuntimeCount += 1
        summary.attentionCount += 1
        break
      case 'ambiguous':
        summary.ambiguousCount += 1
        summary.attentionCount += 1
        break
      case 'unhealthy':
        summary.unhealthyCount += 1
        summary.attentionCount += 1
        break
      case 'hung':
        summary.hungCount += 1
        summary.attentionCount += 1
        break
      case 'offline':
        summary.offlineCount += 1
        summary.attentionCount += 1
        break
      case 'unknown':
        summary.unknownCount += 1
        summary.attentionCount += 1
        break
      case 'no_port':
        summary.noPortCount += 1
        summary.attentionCount += 1
        break
      default:
        break
    }
  }

  return summary
}

export function canAcknowledgeManagedAgent(agent: {
  runtime?: Pick<AgentRuntimeHealthStatus, 'pid' | 'status'> | null
}): boolean {
  return Boolean(agent.runtime?.pid && agent.runtime.status === 'offline')
}
