import {
  canAcknowledgeManagedAgent,
  filterManagedHealthAgents,
  sortManagedHealthAgents,
  summarizeManagedHealthAgents,
} from '@/hooks/insight/agent-health-utils'
import type { ManagedAgentHealthOverallStatus } from '@/hooks/insight/types'

describe('insight agent health helpers', () => {
  it('filters managed agents by witty agent id', () => {
    const agents: Array<{
      witty_agent_id: string
      witty_agent_name: string
      overall_status: ManagedAgentHealthOverallStatus
    }> = [
      {
        witty_agent_id: 'agent-2',
        witty_agent_name: 'Beta',
        overall_status: 'healthy',
      },
      {
        witty_agent_id: 'agent-1',
        witty_agent_name: 'Alpha',
        overall_status: 'degraded',
      },
    ]

    expect(filterManagedHealthAgents(agents, 'all')).toEqual(agents)
    expect(filterManagedHealthAgents(agents, 'agent-1')).toEqual([agents[1]])
  })

  it('sorts managed agents by status priority and then witty agent name', () => {
    const agents: Array<{
      witty_agent_id: string
      witty_agent_name: string
      overall_status: ManagedAgentHealthOverallStatus
    }> = [
      { witty_agent_id: 'agent-3', witty_agent_name: 'Gamma', overall_status: 'healthy' },
      { witty_agent_id: 'agent-2', witty_agent_name: 'Beta', overall_status: 'offline' },
      { witty_agent_id: 'agent-1', witty_agent_name: 'Alpha', overall_status: 'degraded' },
    ]

    expect(
      sortManagedHealthAgents(agents).map(
        (agent: { witty_agent_name: string }) => agent.witty_agent_name
      )
    ).toEqual(['Beta', 'Alpha', 'Gamma'])
  })

  it('summarizes witty-agent-centric health counts', () => {
    const summary = summarizeManagedHealthAgents([
      { overall_status: 'healthy' },
      { overall_status: 'degraded' },
      { overall_status: 'missing_runtime' },
      { overall_status: 'offline' },
    ])

    expect(summary.healthyCount).toBe(1)
    expect(summary.attentionCount).toBe(3)
    expect(summary.degradedCount).toBe(1)
    expect(summary.missingRuntimeCount).toBe(1)
    expect(summary.offlineCount).toBe(1)
  })

  it('allows acknowledge-offline only for a concrete offline runtime', () => {
    expect(
      canAcknowledgeManagedAgent({
        runtime: {
          pid: 42,
          status: 'offline',
        },
      })
    ).toBe(true)

    expect(
      canAcknowledgeManagedAgent({
        runtime: {
          pid: 42,
          status: 'healthy',
        },
      })
    ).toBe(false)

    expect(
      canAcknowledgeManagedAgent({
        runtime: null,
      })
    ).toBe(false)
  })
})
