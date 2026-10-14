import { messageService } from '../message-service'

/** 锁定重生成请求的接线契约：打到专用端点，且不携带正文。 */

jest.mock('@/app/config', () => ({
  appConfig: { api: { baseUrl: 'http://api.test' }, auth: { token: '' } },
}))

function sseResponse(events: unknown[]): Response {
  const body = events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')
  const encoder = new TextEncoder()
  let consumed = false
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    body: {
      getReader: () => ({
        read: async () => {
          if (consumed) return { done: true, value: undefined }
          consumed = true
          return { done: false, value: encoder.encode(body) }
        },
      }),
    },
  } as unknown as Response
}

describe('messageService.regenerateMessage', () => {
  const fetchMock = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  it('请求专用重生成端点，且不携带正文', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([{ sandbox_type: 'local_process', event: { type: 'message.completed' } }])
    )

    const received: unknown[] = []
    const events = await messageService.regenerateMessage('agent-1', 'session-1', event =>
      received.push(event)
    )

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('http://api.test/agents/agent-1/sessions/session-1/messages/regenerate')
    expect(options.method).toBe('POST')
    // 不带 content：重跑用的提问由后端从库里取。
    expect(options.body).toBeUndefined()
    expect(received).toEqual([{ type: 'message.completed' }])
    expect(events).toHaveLength(1)
  })

  it('非 2xx 时抛出带服务端错误体的异常', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      json: async () => ({ error: { code: 'SESSION_BUSY' } }),
    } as unknown as Response)

    await expect(messageService.regenerateMessage('agent-1', 'session-1')).rejects.toThrow(
      /HTTP error! status: 409/
    )
  })
})
