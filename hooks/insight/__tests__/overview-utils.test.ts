import { getInsightInterruptionTotal } from '@/hooks/insight/overview-utils'

describe('insight overview interruption totals', () => {
  it('uses the API total when all agents are selected', () => {
    expect(
      getInsightInterruptionTotal({
        selectedWittyAgentId: 'all',
        interruptionCountLoaded: true,
        sessionInterruptionCountsLoaded: false,
        interruptionCount: {
          total: 8,
          by_severity: { critical: 1, high: 2, medium: 3, low: 2 },
        },
        sessions: [{ session_id: 'session-a' }, { session_id: 'session-b' }],
        sessionInterruptionCounts: {
          'session-a': { total: 2 },
          'session-b': { total: 1 },
        },
      })
    ).toBe(8)
  })

  it('sums per-session interruption totals for a filtered witty agent', () => {
    expect(
      getInsightInterruptionTotal({
        selectedWittyAgentId: 'agent-1',
        interruptionCountLoaded: true,
        sessionInterruptionCountsLoaded: true,
        interruptionCount: {
          total: 8,
          by_severity: { critical: 1, high: 2, medium: 3, low: 2 },
        },
        sessions: [{ session_id: 'session-a' }, { session_id: 'session-b' }],
        sessionInterruptionCounts: {
          'session-a': { total: 2 },
          'session-b': { total: 1 },
          'session-c': { total: 5 },
        },
      })
    ).toBe(3)
  })

  it('waits for session interruption counts before showing a filtered total', () => {
    expect(
      getInsightInterruptionTotal({
        selectedWittyAgentId: 'agent-1',
        interruptionCountLoaded: true,
        sessionInterruptionCountsLoaded: false,
        interruptionCount: {
          total: 8,
          by_severity: { critical: 1, high: 2, medium: 3, low: 2 },
        },
        sessions: [{ session_id: 'session-a' }],
        sessionInterruptionCounts: {
          'session-a': { total: 2 },
        },
      })
    ).toBeNull()
  })
})
