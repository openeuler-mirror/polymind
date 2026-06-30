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

  it('loads capabilities from the witty-service insight bff', async () => {
    const response = {
      enabled: true,
      reachable: true,
      features: {
        sessions: true,
        timeseries: true,
        interruptions: true,
        health: true,
      },
    }
    mockedHttpClient.get.mockResolvedValue(response)

    await expect(insightService.getCapabilities()).resolves.toEqual(response)
    expect(mockedHttpClient.get).toHaveBeenCalledWith('/insight/capabilities')
  })

  it('builds session and trace queries with witty-service filter params', async () => {
    mockedHttpClient.get.mockResolvedValue([])

    await insightService.getSessions({
      witty_agent_id: 'agent-1',
      start_ns: 10,
      end_ns: 20,
    })
    await insightService.getSessionTraces('session/1', {
      start_ns: 30,
      end_ns: 40,
    })
    await insightService.getTimeseries({
      witty_agent_id: 'agent-2',
      start_ns: 50,
      end_ns: 60,
      buckets: 12,
    })

    expect(mockedHttpClient.get).toHaveBeenNthCalledWith(
      1,
      '/insight/sessions?witty_agent_id=agent-1&start_ns=10&end_ns=20'
    )
    expect(mockedHttpClient.get).toHaveBeenNthCalledWith(
      2,
      '/insight/sessions/session%2F1/traces?start_ns=30&end_ns=40'
    )
    expect(mockedHttpClient.get).toHaveBeenNthCalledWith(
      3,
      '/insight/timeseries?witty_agent_id=agent-2&start_ns=50&end_ns=60&buckets=12'
    )
  })

  it('uses managed session and conversation endpoints for details and exports', async () => {
    mockedHttpClient.get.mockResolvedValue([])

    await insightService.getSessionInterruptions('session-1')
    await insightService.getConversationInterruptions('conversation-1')
    await insightService.getTraceDetail('trace-1')
    await insightService.getConversationDetail('conversation-1')
    await insightService.getAtifBySession('session-1')
    await insightService.getAtifByConversation('conversation-1')

    expect(mockedHttpClient.get).toHaveBeenNthCalledWith(
      1,
      '/insight/sessions/session-1/interruptions'
    )
    expect(mockedHttpClient.get).toHaveBeenNthCalledWith(
      2,
      '/insight/conversations/conversation-1/interruptions'
    )
    expect(mockedHttpClient.get).toHaveBeenNthCalledWith(3, '/insight/traces/trace-1')
    expect(mockedHttpClient.get).toHaveBeenNthCalledWith(4, '/insight/conversations/conversation-1')
    expect(mockedHttpClient.get).toHaveBeenNthCalledWith(
      5,
      '/insight/export/atif/session/session-1'
    )
    expect(mockedHttpClient.get).toHaveBeenNthCalledWith(
      6,
      '/insight/export/atif/conversation/conversation-1'
    )
  })

  it('builds interruption aggregate queries with witty agent filtering only', async () => {
    mockedHttpClient.get.mockResolvedValue([])

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

    expect(mockedHttpClient.get).toHaveBeenNthCalledWith(
      1,
      '/insight/interruptions/count?witty_agent_id=agent-1&start_ns=100&end_ns=200'
    )
    expect(mockedHttpClient.get).toHaveBeenNthCalledWith(
      2,
      '/insight/interruptions/stats?witty_agent_id=agent-1'
    )
    expect(mockedHttpClient.get).toHaveBeenNthCalledWith(
      3,
      '/insight/interruptions/session-counts?end_ns=300'
    )
    expect(mockedHttpClient.get).toHaveBeenNthCalledWith(
      4,
      '/insight/interruptions/conversation-counts?start_ns=400'
    )
  })

  it('uses bff mutation endpoints for interruption resolution and runtime actions', async () => {
    mockedHttpClient.post.mockResolvedValue({ status: 'resolved' })
    mockedHttpClient.delete.mockResolvedValue({ ok: true })

    await insightService.resolveInterruption('interrupt-1')
    await insightService.deleteAgentHealth(101)
    await insightService.restartAgentHealth(101)

    expect(mockedHttpClient.post).toHaveBeenNthCalledWith(
      1,
      '/insight/interruptions/interrupt-1/resolve'
    )
    expect(mockedHttpClient.delete).toHaveBeenCalledWith('/insight/agent-health/101')
    expect(mockedHttpClient.post).toHaveBeenNthCalledWith(2, '/insight/agent-health/101/restart')
  })

  it('loads witty agent and health resources from bff endpoints', async () => {
    mockedHttpClient.get.mockResolvedValue([])

    await insightService.getWittyAgents()
    await insightService.getAgentHealth()

    expect(mockedHttpClient.get).toHaveBeenNthCalledWith(1, '/insight/witty-agents')
    expect(mockedHttpClient.get).toHaveBeenNthCalledWith(2, '/insight/agent-health')
  })
})
