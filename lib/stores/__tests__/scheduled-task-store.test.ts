jest.mock('@/lib/cache', () => ({
  cacheGet: jest.fn(() => null),
  cacheSet: jest.fn(),
  cacheDelete: jest.fn(),
  CACHE_KEYS: { SCHEDULED_SIDEBAR: 'scheduled_sidebar' },
}))

jest.mock('@/services/scheduled-task-service', () => {
  const actual = jest.requireActual('@/services/scheduled-task-service')
  return {
    ...actual,
    scheduledTaskService: {
      listTasks: jest.fn(),
      deleteTask: jest.fn(),
    },
  }
})

import { useScheduledTaskStore } from '@/lib/stores/scheduled-task-store'
import { useChatStore } from '@/lib/store'
import { scheduledTaskService } from '@/services/scheduled-task-service'
import * as runController from '@/lib/stores/scheduled-run-controller'
import type {
  ScheduledTask,
  ScheduledTaskConversation,
  ScheduledTaskRun,
} from '@/services/scheduled-task-service'

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
    status: 'succeeded',
    error: null,
    started_at: '2026-01-01T00:00:00Z',
    finished_at: '2026-01-01T01:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeConversation(
  overrides: Partial<ScheduledTaskConversation> = {}
): ScheduledTaskConversation {
  return {
    id: 'sess-1',
    task_id: 'task-1',
    title: '生成每日报告',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:10:00Z',
    last_run_status: 'succeeded',
    ...overrides,
  }
}

describe('scheduled-task-store', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useScheduledTaskStore.setState({
      tasks: [],
      runsByTask: {},
      conversationsByTask: {},
      loading: false,
      error: '',
    })
  })

  it('populates tasks and groups recent_runs into runsByTask', async () => {
    ;(scheduledTaskService.listTasks as jest.Mock).mockResolvedValue([
      makeTask({
        id: 'task-1',
        recent_runs: [
          makeRun({ id: 'run-1', session_id: 'sess-1', status: 'succeeded' }),
          makeRun({ id: 'run-2', session_id: 'sess-2', status: 'running' }),
        ],
      }),
    ])

    await useScheduledTaskStore.getState().refresh()

    const state = useScheduledTaskStore.getState()
    expect(state.tasks).toHaveLength(1)
    expect(state.runsByTask['task-1']).toHaveLength(2)
    expect(state.runsByTask['task-1'].map(r => r.id)).toEqual(['run-1', 'run-2'])
    expect(state.error).toBe('')
  })

  it('groups conversations into conversationsByTask for the conversation-driven sidebar', async () => {
    ;(scheduledTaskService.listTasks as jest.Mock).mockResolvedValue([
      makeTask({
        id: 'task-1',
        has_running_run: true,
        conversations: [
          makeConversation({ id: 'sess-1', last_run_status: 'running' }),
          makeConversation({ id: 'sess-2', title: null, last_run_status: null }),
        ],
      }),
      makeTask({ id: 'task-2', conversations: [] }),
    ])

    await useScheduledTaskStore.getState().refresh()

    const state = useScheduledTaskStore.getState()
    // 会话摘要按任务归组，供侧栏会话中心化渲染。
    expect(state.conversationsByTask['task-1'].map(c => c.id)).toEqual(['sess-1', 'sess-2'])
    expect(state.conversationsByTask['task-2']).toEqual([])
    // has_running_run 随任务对象透传（isRunning 数据源）。
    expect(state.tasks[0].has_running_run).toBe(true)
    expect(state.tasks[1].has_running_run).toBe(false)
  })

  it('does not sync scheduled data into the chat store (sidebar merges at render time)', async () => {
    ;(scheduledTaskService.listTasks as jest.Mock).mockResolvedValue([
      makeTask({
        recent_runs: [makeRun({ id: 'run-1', session_id: 'sess-1' })],
        conversations: [makeConversation({ id: 'sess-1' })],
      }),
    ])

    await useScheduledTaskStore.getState().refresh()

    // 仅保存任务/执行记录/会话摘要，不触碰任何会话列表（合并只发生在渲染层）。
    const state = useScheduledTaskStore.getState()
    expect(state.runsByTask['task-1']).toHaveLength(1)
    expect(state.conversationsByTask['task-1']).toHaveLength(1)
  })

  it('deletes the task before aborting runs and purges by task id', async () => {
    ;(scheduledTaskService.deleteTask as jest.Mock).mockResolvedValue(undefined)
    ;(scheduledTaskService.listTasks as jest.Mock).mockResolvedValue([])
    useScheduledTaskStore.setState({
      runsByTask: {
        'task-1': [
          makeRun({ id: 'run-1', session_id: 'sess-1' }),
          makeRun({ id: 'run-2', session_id: 'sess-2' }),
        ],
      },
    })
    const purgeSpy = jest.spyOn(useChatStore.getState(), 'purgeConversationsByScheduledTask')
    const abortSpy = jest.spyOn(runController, 'abortScheduledTaskRuns')
    const callOrder: string[] = []
    ;(scheduledTaskService.deleteTask as jest.Mock).mockImplementation(() => {
      callOrder.push('delete')
      return Promise.resolve()
    })
    abortSpy.mockImplementation(() => {
      callOrder.push('abort')
    })

    await useScheduledTaskStore.getState().deleteTaskAndPurge('task-1')

    expect(callOrder).toEqual(['delete', 'abort'])
    expect(purgeSpy).toHaveBeenCalledWith('task-1')
    purgeSpy.mockRestore()
    abortSpy.mockRestore()
  })

  it('does not abort runs or purge conversations when the server delete fails', async () => {
    ;(scheduledTaskService.deleteTask as jest.Mock).mockRejectedValue(new Error('TASK_BUSY'))
    const purgeSpy = jest.spyOn(useChatStore.getState(), 'purgeConversationsByScheduledTask')
    const abortSpy = jest.spyOn(runController, 'abortScheduledTaskRuns')

    await expect(useScheduledTaskStore.getState().deleteTaskAndPurge('task-1')).rejects.toThrow(
      'TASK_BUSY'
    )

    expect(abortSpy).not.toHaveBeenCalled()
    expect(purgeSpy).not.toHaveBeenCalled()
    purgeSpy.mockRestore()
    abortSpy.mockRestore()
  })

  it('normalizes has_running_run to false when restoring stale cache without the field', () => {
    // 缓存在模块加载时读取，需隔离重载模块并让 cacheGet 返回旧格式数据。
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { cacheGet } = require('@/lib/cache')
      ;(cacheGet as jest.Mock).mockReturnValueOnce({
        tasks: [
          makeTask({
            id: 'task-stale',
            // 引入 has_running_run 之前的旧缓存无此字段。
            has_running_run: undefined as unknown as boolean,
          }),
        ],
        runsByTask: {},
        conversationsByTask: {},
      })
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useScheduledTaskStore: freshStore } = require('@/lib/stores/scheduled-task-store')

      expect(freshStore.getState().tasks[0].has_running_run).toBe(false)
    })
  })
})
