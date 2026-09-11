import type { ScheduledTaskRunWithTask } from '@/services/scheduled-task-service'
import {
  DEFAULT_RUN_RECORDS_VIEW,
  buildTaskScheduleLabels,
  filterRuns,
  formatRunDuration,
  formatRunGroupLabel,
  formatRunTime,
  groupRunsByGranularity,
  runBucketStart,
  type RunGroupGranularity,
  type RunRecordsView,
} from './run-records-utils'

/** 用本地时间构造记录（避免断言受运行环境时区影响）：2025-09-10 当天 h:m:s 的 ISO 串。 */
const at = (h: number, m: number, s = 0) => new Date(2025, 8, 10, h, m, s).toISOString()
const ids = (runs: ScheduledTaskRunWithTask[]) => runs.map(run => run.id)

const NOW = new Date(2025, 8, 10, 12, 0, 0)

/** 分组标题：把「取时间桶起点」与「格式化」合成一步，断言更短。 */
const label = (date: Date, granularity: RunGroupGranularity) =>
  formatRunGroupLabel(runBucketStart(date, granularity), granularity, NOW)

function makeRun(overrides: Partial<ScheduledTaskRunWithTask> = {}): ScheduledTaskRunWithTask {
  return {
    id: 'run-1',
    task_id: 'task-1',
    session_id: 'session-1',
    status: 'succeeded',
    error: null,
    started_at: at(12, 30),
    finished_at: at(12, 30, 8),
    created_at: at(12, 30),
    task_name: '午间充电站',
    agent_id: 'agent-1',
    ...overrides,
  }
}

function makeView(overrides: Partial<RunRecordsView> = {}): RunRecordsView {
  return { ...DEFAULT_RUN_RECORDS_VIEW, ...overrides }
}

/** 起止时刻显式指定的记录（耗时断言用）。 */
const timed = (s: string | null, e: string | null) => makeRun({ started_at: s, finished_at: e })

describe('run-records-utils', () => {
  describe('formatRunTime', () => {
    it('formats the start time as HH:mm:ss', () => {
      expect(formatRunTime(makeRun())).toBe('12:30:00')
    })

    it('falls back to the creation time and then to a placeholder', () => {
      expect(formatRunTime(makeRun({ started_at: null }))).toBe('12:30:00')
      expect(formatRunTime(makeRun({ started_at: null, created_at: '' }))).toBe('--')
    })
  })

  describe('formatRunDuration', () => {
    it('keeps one decimal below a minute', () => {
      expect(formatRunDuration(makeRun())).toBe('8.0s')
      expect(formatRunDuration(timed(at(12, 30), at(12, 30)))).toBe('0.0s')
    })

    it('switches to minutes and hours for long runs', () => {
      expect(formatRunDuration(timed(at(12, 30), at(12, 31, 5)))).toBe('1分5秒')
      expect(formatRunDuration(timed(at(12, 0), at(13, 20)))).toBe('1小时20分')
    })

    it('returns null when the run has not finished yet', () => {
      expect(formatRunDuration(makeRun({ finished_at: null }))).toBeNull()
    })
  })

  describe('runBucketStart', () => {
    const date = new Date(2025, 8, 10, 15, 30, 0) // 2025-09-10 周三

    it('buckets by day, week (Monday) and month', () => {
      expect(runBucketStart(date, 'day').getDate()).toBe(10)
      expect(runBucketStart(date, 'week').getDay()).toBe(1)
      expect(runBucketStart(date, 'week').getDate()).toBe(8)
      expect(runBucketStart(date, 'month').getDate()).toBe(1)
    })
  })

  describe('formatRunGroupLabel', () => {
    it('labels recent days as 今天/昨天 and older days by date', () => {
      expect(label(NOW, 'day')).toBe('今天')
      expect(label(new Date(2025, 8, 9, 12), 'day')).toBe('昨天')
      expect(label(new Date(2025, 8, 8, 12), 'day')).toBe('9月8日')
    })

    it('adds the year for days outside the current year', () => {
      expect(label(new Date(2024, 11, 31, 12), 'day')).toBe('2024年12月31日')
    })

    it('labels weeks as 本周/上周 and older weeks as a range', () => {
      expect(label(NOW, 'week')).toBe('本周')
      expect(label(new Date(2025, 8, 3, 12), 'week')).toBe('上周')
      expect(label(new Date(2025, 7, 20, 12), 'week')).toBe('8月18日 - 8月24日')
    })

    it('labels months as 本月/上月 and older months by month', () => {
      expect(label(NOW, 'month')).toBe('本月')
      expect(label(new Date(2025, 7, 20, 12), 'month')).toBe('上月')
      expect(label(new Date(2025, 5, 20, 12), 'month')).toBe('6月')
      expect(label(new Date(2024, 5, 20, 12), 'month')).toBe('2024年6月')
    })
  })

  describe('groupRunsByGranularity', () => {
    const runs = [
      makeRun({ id: 'a', started_at: at(12, 30) }),
      makeRun({ id: 'b', started_at: at(10, 0) }),
      makeRun({ id: 'c', started_at: new Date(2025, 8, 9, 9, 0, 0).toISOString() }),
    ]

    it('groups by day, newest group first and newest run first inside a group', () => {
      const groups = groupRunsByGranularity(runs, 'day', NOW)
      expect(groups.map(group => group.label)).toEqual(['今天', '昨天'])
      expect(ids(groups[0].runs)).toEqual(['a', 'b'])
      expect(ids(groups[1].runs)).toEqual(['c'])
    })

    it('merges days into the same week/month bucket', () => {
      expect(groupRunsByGranularity(runs, 'week', NOW)).toHaveLength(1)
      expect(groupRunsByGranularity(runs, 'month', NOW)).toHaveLength(1)
      expect(groupRunsByGranularity(runs, 'month', NOW)[0].runs).toHaveLength(3)
    })

    it('keeps records with a missing start time in the oldest bucket', () => {
      const groups = groupRunsByGranularity(
        [makeRun({ id: 'd', started_at: null, created_at: '' })],
        'day',
        NOW
      )
      expect(groups).toHaveLength(1)
      expect(groups[0].runs[0].id).toBe('d')
    })
  })

  describe('filterRuns', () => {
    const runs = [
      makeRun({ id: 'a', task_id: 'task-1', status: 'failed' }),
      makeRun({ id: 'b', task_id: 'task-2', status: 'succeeded' }),
      makeRun({ id: 'c', task_id: 'task-1', status: 'succeeded' }),
    ]

    it('returns everything by default', () => {
      expect(ids(filterRuns(runs, makeView()))).toEqual(['a', 'b', 'c'])
    })

    it('filters by task and status', () => {
      expect(ids(filterRuns(runs, makeView({ taskId: 'task-1' })))).toEqual(['a', 'c'])
      expect(ids(filterRuns(runs, makeView({ status: 'succeeded' })))).toEqual(['b', 'c'])
      const both = makeView({ taskId: 'task-1', status: 'succeeded' })
      expect(ids(filterRuns(runs, both))).toEqual(['c'])
    })
  })

  describe('buildTaskScheduleLabels', () => {
    it('maps task ids to their schedule text and skips unknown schedules', () => {
      const labels = buildTaskScheduleLabels([
        { id: 'task-1', schedule_type: 'interval', cron_expr: null, interval_seconds: 3600 },
        { id: 'task-2', schedule_type: 'cron', cron_expr: '30 12 * * *', interval_seconds: null },
      ])
      expect(labels['task-1']).toBe('每 1 小时')
      expect(labels['task-2']).toBeTruthy()
    })
  })
})
