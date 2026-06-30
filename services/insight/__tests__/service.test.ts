jest.mock('@/lib/http-client', () => ({
  httpClient: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}))

import { httpClient } from '@/lib/http-client'
import { insightService } from '@/services/insight/service'

type MockHttpClient = {
  get: jest.Mock
  post: jest.Mock
  delete: jest.Mock
}

const mockedHttpClient = httpClient as unknown as MockHttpClient

describe('insightService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('routes overview and aggregate reads through the insight bff', async () => {
    mockedHttpClient.get.mockResolvedValue([])

    await insightService.getCapabilities()
    await insightService.getSessions({
      witty_agent_id: 'agent-1',
      start_ns: 10,
      end_ns: 20,
    })
    await insightService.getTimeseries({
      witty_agent_id: 'agent-2',
      start_ns: 50,
      end_ns: 60,
      buckets: 12,
    })
    await insightService.getInterruptionCount({
      witty_agent_id: 'agent-1',
      start_ns: 100,
      end_ns: 200,
    })
    await insightService.getInterruptionStats({
      witty_agent_id: 'agent-1',
    })
    await insightService.getInterruptionSessionCounts({
      end_ns: 300,
    })
    await insightService.getInterruptionConversationCounts({
      start_ns: 400,
    })
    await insightService.getWittyAgents()
    await insightService.getAgentHealth()

    expect(mockedHttpClient.get.mock.calls).toEqual([
      ['/insight/capabilities'],
      ['/insight/sessions?witty_agent_id=agent-1&start_ns=10&end_ns=20'],
      ['/insight/timeseries?witty_agent_id=agent-2&start_ns=50&end_ns=60&buckets=12'],
      ['/insight/interruptions/count?witty_agent_id=agent-1&start_ns=100&end_ns=200'],
      ['/insight/interruptions/stats?witty_agent_id=agent-1'],
      ['/insight/interruptions/session-counts?end_ns=300'],
      ['/insight/interruptions/conversation-counts?start_ns=400'],
      ['/insight/witty-agents'],
      ['/insight/agent-health'],
    ])
  })

  it('routes detail, export, and mutation endpoints through the insight bff', async () => {
    mockedHttpClient.get.mockResolvedValue([])
    mockedHttpClient.post.mockResolvedValue({ status: 'resolved' })
    mockedHttpClient.delete.mockResolvedValue({ ok: true })

    await insightService.getSessionTraces('session/1', {
      start_ns: 30,
      end_ns: 40,
    })
    await insightService.getSessionInterruptions('session-1')
    await insightService.getConversationInterruptions('conversation-1')
    await insightService.getTraceDetail('trace-1')
    await insightService.getConversationDetail('conversation-1')
    await insightService.getAtifBySession('session-1')
    await insightService.getAtifByConversation('conversation-1')
    await insightService.resolveInterruption('interrupt-1')
    await insightService.deleteAgentHealth(101)
    await insightService.restartAgentHealth(101)

    expect(mockedHttpClient.get.mock.calls).toEqual([
      ['/insight/sessions/session%2F1/traces?start_ns=30&end_ns=40'],
      ['/insight/sessions/session-1/interruptions'],
      ['/insight/conversations/conversation-1/interruptions'],
      ['/insight/traces/trace-1'],
      ['/insight/conversations/conversation-1'],
      ['/insight/export/atif/session/session-1'],
      ['/insight/export/atif/conversation/conversation-1'],
    ])
    expect(mockedHttpClient.post.mock.calls).toEqual([
      ['/insight/interruptions/interrupt-1/resolve'],
      ['/insight/agent-health/101/restart'],
    ])
    expect(mockedHttpClient.delete).toHaveBeenCalledWith('/insight/agent-health/101')
  })
})
