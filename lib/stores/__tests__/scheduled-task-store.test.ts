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
import type { ScheduledTask, ScheduledTaskRun } from '@/services/scheduled-task-service'

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

describe('scheduled-task-store', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useScheduledTaskStore.setState({
      tasks: [],
      runsByTask: {},
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

  it('does not sync runs into the chat store (scheduled area is run-driven)', async () => {
    ;(scheduledTaskService.listTasks as jest.Mock).mockResolvedValue([
      makeTask({
        recent_runs: [makeRun({ id: 'run-1', session_id: 'sess-1' })],
      }),
    ])

    await useScheduledTaskStore.getState().refresh()

    // 仅保存任务与执行记录，不触碰任何会话列表。
    const state = useScheduledTaskStore.getState()
    expect(state.runsByTask['task-1']).toHaveLength(1)
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
})
