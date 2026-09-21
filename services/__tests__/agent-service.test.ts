import { agentService } from '../agent-service'
import { httpClient } from '@/lib/http-client'

/**
 * 锁定暂停 / 启动按钮的接线契约（两条曾把用户带沟里的行为）：
 *
 * 1. 状态必须**以服务端返回为准**。旧实现拿到响应后无条件把 status 覆写成
 *    PAUSED/RUNNING，服务端其实失败时 UI 也显示成功——「点了暂停，看着变成
 *    已暂停，实际沙箱还在跑」。
 * 2. 失败原因要透出服务端 message；拿不到 message 时至少带上错误码，
 *    而不是笼统的「操作失败」。
 */

jest.mock('@/lib/http-client', () => ({
  httpClient: { post: jest.fn(), get: jest.fn() },
}))

const post = httpClient.post as jest.Mock
const get = httpClient.get as jest.Mock

const apiAgent = (overrides: Record<string, unknown> = {}) => ({
  id: 'agent-1',
  name: 'demo',
  description: '',
  status: 'running',
  sandbox_type: 'local_process',
  adapter_type: 'opencode',
  workspace_path: '/w',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

beforeEach(() => {
  jest.clearAllMocks()
})

describe('agentService.pauseAgent', () => {
  it('takes the status returned by the server', async () => {
    // 服务端说还在 running（例如停止 runtime 失败但接口收敛）时，前端不得自作主张
    post.mockResolvedValue(apiAgent({ status: 'running' }))

    const result = await agentService.pauseAgent('agent-1')

    expect(post).toHaveBeenCalledWith('/agents/agent-1/pause')
    expect(result.error).toBeUndefined()
    expect(result.agent?.status).toBe('running')
  })

  it('surfaces the server error message instead of a generic one', async () => {
    post.mockRejectedValue({
      details: { error: { code: 'INVALID_AGENT_TRANSITION', message: 'Cannot pause.' } },
    })

    const result = await agentService.pauseAgent('agent-1')

    expect(result.agent).toBeUndefined()
    expect(result.error).toBe('Cannot pause.')
  })

  it('falls back to the error code when the server sends no message', async () => {
    post.mockRejectedValue({ details: { error: { code: 'SANDBOX_NOT_FOUND' } } })

    const result = await agentService.pauseAgent('agent-1')

    expect(result.error).toBe('暂停失败，请稍后重试（SANDBOX_NOT_FOUND）')
  })
})

describe('agentService.resumeAgent', () => {
  it('reports the resumed status from the server', async () => {
    post.mockResolvedValue(apiAgent({ status: 'running' }))

    const result = await agentService.resumeAgent('agent-1')

    expect(post).toHaveBeenCalledWith('/agents/agent-1/resume')
    expect(result.agent?.status).toBe('running')
  })

  it('re-reads the agent when the response carries no agent entity', async () => {
    post.mockResolvedValue({ ok: true })
    get.mockResolvedValue({ data: apiAgent({ status: 'paused' }) })

    const result = await agentService.resumeAgent('agent-1')

    expect(get).toHaveBeenCalledWith('/agents/agent-1')
    expect(result.agent?.status).toBe('paused')
  })

  it('does not fake success when the call throws', async () => {
    post.mockRejectedValue(
      Object.assign(new Error('boom'), {
        details: { error: { code: 'RUNTIME_START_FAILED', message: 'Failed to start runtime.' } },
      })
    )

    const result = await agentService.resumeAgent('agent-1')

    expect(result.agent).toBeUndefined()
    expect(result.error).toBe('Failed to start runtime.')
  })
})
