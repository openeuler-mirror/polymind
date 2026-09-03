jest.mock('@/app/config', () => ({
  appConfig: { app: { useMockData: false } },
}))

jest.mock('@/services/session-service', () => ({
  sessionService: {
    createSession: jest.fn(),
    deleteSession: jest.fn().mockResolvedValue(undefined),
    getConversation: jest.fn(),
    getConversations: jest.fn(),
    transformMessage: jest.fn(),
    transformConversationSummary: jest.fn(),
  },
}))

jest.mock('@/services/message-service', () => ({
  messageService: {
    reconnectStream: jest.fn(),
    abortMessage: jest.fn(),
  },
}))

jest.mock('@/services/scheduled-task-service', () => {
  const actual = jest.requireActual('@/services/scheduled-task-service')
  return {
    ...actual,
    scheduledTaskService: {
      runTask: jest.fn(),
      getTaskRun: jest.fn(),
      listTasks: jest.fn().mockResolvedValue([]),
    },
  }
})

jest.mock('@/lib/store', () => {
  const { create } = jest.requireActual('zustand') as typeof import('zustand')
  const { createChatSlice } = jest.requireActual(
    '@/lib/stores/chat-store'
  ) as typeof import('@/lib/stores/chat-store')
  const { createAgentSlice } = jest.requireActual(
    '@/lib/stores/agent-store'
  ) as typeof import('@/lib/stores/agent-store')
  const { createConnectionSlice } = jest.requireActual(
    '@/lib/stores/connection-store'
  ) as typeof import('@/lib/stores/connection-store')
  const { createSettingsSlice } = jest.requireActual(
    '@/lib/stores/settings-store'
  ) as typeof import('@/lib/stores/settings-store')
  const { createUISlice } = jest.requireActual(
    '@/lib/stores/ui-store'
  ) as typeof import('@/lib/stores/ui-store')

  return {
    useChatStore: create<
      ReturnType<typeof createChatSlice> &
        ReturnType<typeof createAgentSlice> &
        ReturnType<typeof createConnectionSlice> &
        ReturnType<typeof createSettingsSlice> &
        ReturnType<typeof createUISlice>
    >()((...args: Parameters<typeof createChatSlice>) => ({
      ...createChatSlice(...args),
      ...createAgentSlice(...args),
      ...createConnectionSlice(...args),
      ...createSettingsSlice(...args),
      ...createUISlice(...args),
    })),
  }
})

import { useChatStore } from '@/lib/store'
import { messageService } from '@/services/message-service'
import { scheduledTaskService } from '@/services/scheduled-task-service'
import { sessionService } from '@/services/session-service'
import type { ScheduledTask, ScheduledTaskRun } from '@/services/scheduled-task-service'
import { triggerScheduledTaskRun } from './execution'

function makeAgent() {
  return {
    id: 'agent-1',
    name: '测试智能体',
    adapterType: 'http',
    sandboxType: 'local_process',
    status: 'running',
    idleTimeoutSeconds: 300,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }
}

function makeTask(overrides: Partial<ScheduledTask> = {}): ScheduledTask {
  return {
    id: 'task-1',
    name: '每日报告',
    schedule_type: 'cron',
    cron_expr: '0 9 * * *',
    interval_seconds: null,
    timezone: 'Asia/Shanghai',
    content: '生成每日报告',
    agent_id: 'agent-1',
    workspace_folder: null,
    enabled: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    recent_runs: [],
    conversations: [],
    has_running_run: false,
    ...overrides,
  }
}

function makeRun(overrides: Partial<ScheduledTaskRun> = {}): ScheduledTaskRun {
  return {
    id: 'run-1',
    task_id: 'task-1',
    session_id: null,
    status: 'running',
    error: null,
    started_at: '2026-01-01T00:00:00Z',
    finished_at: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

async function flushAsync() {
  await new Promise(resolve => setTimeout(resolve, 0))
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('triggerScheduledTaskRun', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useChatStore.setState({
      conversations: [],
      currentConversationId: null,
      currentAgentId: 'agent-1',
      agents: [makeAgent()],
    })
    ;(scheduledTaskService.runTask as jest.Mock).mockResolvedValue(makeRun())
    ;(scheduledTaskService.getTaskRun as jest.Mock).mockResolvedValue(makeRun())
    ;(messageService.reconnectStream as jest.Mock).mockResolvedValue([])
    ;(sessionService.createSession as jest.Mock).mockResolvedValue({
      id: 'session-new',
      agentId: 'agent-1',
      status: 'active',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    })
    ;(sessionService.getConversation as jest.Mock).mockResolvedValue({ messages: [] })
    ;(sessionService.transformMessage as jest.Mock).mockImplementation((msg: any) => ({
      ...msg,
      timestamp: new Date(),
    }))
  })

  it('shows an error and does nothing when the agent is missing', async () => {
    useChatStore.setState({ agents: [] })
    const toast = jest.fn()

    await triggerScheduledTaskRun(makeTask(), toast)

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: '执行智能体不存在，请先确认任务配置' })
    )
    expect(useChatStore.getState().conversations).toHaveLength(0)
    expect(scheduledTaskService.runTask).not.toHaveBeenCalled()
  })

  it('cleans up the conversation and informs the user when the run is skipped', async () => {
    ;(scheduledTaskService.runTask as jest.Mock).mockResolvedValue(
      makeRun({ status: 'skipped', error: 'Task or agent is busy, this run was skipped.' })
    )
    const toast = jest.fn()

    await triggerScheduledTaskRun(makeTask(), toast)
    await flushAsync()

    expect(scheduledTaskService.runTask).toHaveBeenCalledWith('task-1', 'session-new')
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: '执行已跳过' }))
    expect(useChatStore.getState().conversations).toHaveLength(0)
    // 本地会话与服务端会话都应被清理，避免孤儿会话。
    expect(sessionService.deleteSession).toHaveBeenCalled()
    expect(messageService.reconnectStream).not.toHaveBeenCalled()
  })

  it('deletes the conversation and shows an error when runTask fails', async () => {
    ;(scheduledTaskService.runTask as jest.Mock).mockRejectedValue(new Error('boom'))
    const toast = jest.fn()

    await triggerScheduledTaskRun(makeTask(), toast)
    await flushAsync()

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: '错误', description: '触发执行失败' })
    )
    expect(useChatStore.getState().conversations).toHaveLength(0)
    expect(sessionService.deleteSession).toHaveBeenCalled()
  })

  it('creates a scheduled conversation and subscribes to the stream on success', async () => {
    const toast = jest.fn()

    await triggerScheduledTaskRun(makeTask(), toast)
    await flushAsync()

    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: '成功' }))
    const conv = useChatStore.getState().conversations[0]
    expect(conv).toBeDefined()
    expect(conv.scheduledTaskId).toBe('task-1')
    expect(conv.sessionId).toBe('session-new')
    expect(conv.messages).toHaveLength(2)
    expect(messageService.reconnectStream).toHaveBeenCalledTimes(1)
  })

  it('does not retry reconnection once events were applied (no buffer replay duplication)', async () => {
    const reconnect = messageService.reconnectStream as jest.Mock
    reconnect.mockImplementationOnce(
      async (_agentId: string, _sessionId: string, onEvent?: (event: any) => void) => {
        onEvent?.({ type: 'message.delta', payload: { delta: '部分内容' } })
        throw new Error('network dropped mid-stream')
      }
    )
    ;(scheduledTaskService.getTaskRun as jest.Mock).mockResolvedValue(
      makeRun({ status: 'running' })
    )

    await triggerScheduledTaskRun(makeTask(), jest.fn())
    await flushAsync()

    expect(reconnect).toHaveBeenCalledTimes(1)
    const assistant = useChatStore
      .getState()
      .conversations[0]?.messages.find(m => m.role === 'assistant')
    expect(assistant?.content).toBe('部分内容')
  })

  it('refreshes from the server without hijacking the current conversation', async () => {
    const deferred: Array<{ resolve: (value: ScheduledTaskRun | null) => void }> = []
    ;(scheduledTaskService.getTaskRun as jest.Mock)
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            deferred.push({ resolve })
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            deferred.push({ resolve })
          })
      )
    ;(sessionService.getConversation as jest.Mock).mockResolvedValue({
      title: '每日报告',
      updated_at: '2026-01-01T01:00:00Z',
      has_more: false,
      messages: [
        { id: 'user-1', role: 'user', content: '生成每日报告' },
        { id: 'assistant-1', role: 'assistant', content: '最终结果', status: 'completed' },
      ],
    })

    await triggerScheduledTaskRun(makeTask(), jest.fn())
    // 会话创建后用户切到了其他会话，此时后台回填才完成。
    useChatStore.setState({ currentConversationId: 'other-conv', currentAgentId: 'agent-1' })
    const finished = makeRun({ status: 'succeeded', finished_at: '2026-01-01T01:00:00Z' })
    deferred[0]?.resolve(finished)
    await flushAsync()
    deferred[1]?.resolve(finished)
    await flushAsync()
    await flushAsync()

    const state = useChatStore.getState()
    expect(state.currentConversationId).toBe('other-conv')
    const conv = state.conversations.find(c => c.sessionId === 'session-new')
    expect(conv?.messages.some(m => m.content === '最终结果')).toBe(true)
  })

  it('cleans up the placeholder message when the run no longer exists', async () => {
    ;(scheduledTaskService.getTaskRun as jest.Mock).mockResolvedValue(null)

    await triggerScheduledTaskRun(makeTask(), jest.fn())
    await flushAsync()

    const conv = useChatStore.getState().conversations[0]
    expect(conv?.messages.filter(m => m.role === 'assistant')).toHaveLength(0)
  })

  it('does not resurrect a conversation purged while the run streamed', async () => {
    const deferred: Array<{ resolve: (value: ScheduledTaskRun | null) => void }> = []
    ;(scheduledTaskService.getTaskRun as jest.Mock)
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            deferred.push({ resolve })
          })
      )
      .mockResolvedValue(makeRun({ status: 'succeeded', finished_at: '2026-01-01T01:00:00Z' }))
    ;(messageService.reconnectStream as jest.Mock).mockResolvedValue([])

    await triggerScheduledTaskRun(makeTask(), jest.fn())
    // run 进行中任务被删除：purge 清掉本地会话，随后收尾逻辑不得将其重建。
    useChatStore.getState().purgeConversationsByScheduledTask('task-1')
    deferred[0]?.resolve(makeRun({ status: 'succeeded', finished_at: '2026-01-01T01:00:00Z' }))
    await flushAsync()
    await flushAsync()

    expect(useChatStore.getState().conversations).toHaveLength(0)
  })

  it('stops retrying and skips finalization once cancelled', async () => {
    const deferred: Array<{ resolve: (value: ScheduledTaskRun | null) => void }> = []
    ;(scheduledTaskService.getTaskRun as jest.Mock)
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            deferred.push({ resolve })
          })
      )
      .mockResolvedValue(makeRun({ status: 'running' }))
    ;(messageService.reconnectStream as jest.Mock).mockResolvedValue([])

    const cancel = await triggerScheduledTaskRun(makeTask(), jest.fn())
    expect(cancel).toBeDefined()
    cancel?.()
    deferred[0]?.resolve(makeRun({ status: 'running' }))
    await flushAsync()
    await flushAsync()

    // 取消后循环直接退出，不再发起第二次挂流请求；收尾只放开 skipReconnect，
    // 让 ChatArea 在会话再次打开时可自行重连恢复内容。
    expect(messageService.reconnectStream).toHaveBeenCalledTimes(1)
    const assistant = useChatStore
      .getState()
      .conversations[0]?.messages.find(m => m.role === 'assistant')
    expect(assistant?.skipReconnect).toBe(false)
  })

  it('keeps the placeholder when the final run lookup fails (network error, not 404)', async () => {
    // 挂流返回事件但未消费到终止事件（onEvent 未被 mock 调用），
    // 收尾时 getTaskRun 抛网络错误：不得与 404（run 已删除）混同，
    // 占位助手消息必须保留，仅放开 skipReconnect 交给 ChatArea 兜底。
    ;(messageService.reconnectStream as jest.Mock).mockResolvedValue([
      { type: 'message.completed' },
    ])
    ;(scheduledTaskService.getTaskRun as jest.Mock).mockRejectedValue(new Error('network down'))

    await triggerScheduledTaskRun(makeTask(), jest.fn())
    await flushAsync()
    await flushAsync()

    const assistant = useChatStore
      .getState()
      .conversations[0]?.messages.find(m => m.role === 'assistant')
    expect(assistant).toBeDefined()
    expect(assistant?.skipReconnect).toBe(false)
  })
})
