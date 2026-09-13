import { applyToolCallDelta, coalesceStreamEvents } from '../stream-event-handler'
import type { EventItem, Message } from '../types'

const delta = (content: string, timestamp = 1): EventItem => ({
  type: 'message.delta',
  content,
  timestamp,
})

const tool = (id: string, timestamp = 2): EventItem => ({
  type: 'tool.call.response',
  content: 'done',
  timestamp,
  toolCall: { id, name: 'bash', status: 'completed' },
})

describe('coalesceStreamEvents', () => {
  it('merges consecutive message.delta events into one text segment per position', () => {
    const events = [delta('先看'), delta('代码'), tool('t1'), delta('结论')]

    expect(coalesceStreamEvents(events, '先看代码结论')).toEqual([
      delta('先看代码'),
      tool('t1'),
      delta('结论'),
    ])
  })

  it('drops artifact.delta events and empty message.delta events', () => {
    const events = [
      { type: 'artifact.delta', content: 'x' } as EventItem,
      delta('', 1),
      delta('正文'),
    ]

    expect(coalesceStreamEvents(events, '正文')).toEqual([delta('正文')])
  })

  it('appends the missing tail when deltas only cover a prefix of the final content', () => {
    const events = [delta('前'), tool('t1'), delta('后')]

    expect(coalesceStreamEvents(events, '前后补齐')).toEqual([
      delta('前'),
      tool('t1'),
      delta('后补齐'),
    ])
  })

  it('falls back to dropping every message.delta when segments cannot be reconciled', () => {
    const events = [delta('完全不同的内容'), tool('t1')]

    expect(coalesceStreamEvents(events, '最终正文')).toEqual([tool('t1')])
  })

  it('keeps segments untouched when the final content is unknown', () => {
    const events = [delta('正文'), tool('t1')]

    expect(coalesceStreamEvents(events)).toEqual(events)
  })
})

describe('applyToolCallDelta', () => {
  const runningMessage = (): Message => ({
    id: 'm1',
    role: 'assistant',
    content: '',
    timestamp: new Date('2026-01-01T00:00:00Z'),
    toolCalls: [{ id: 'call-1', name: 'exec', status: 'running' }],
    events: [
      {
        type: 'tool.call.started',
        content: '正在调用工具：exec',
        timestamp: 1,
        toolCall: { id: 'call-1', name: 'exec', status: 'running' },
      },
    ],
  })

  it('累积到 outputRaw（不是 inputRaw）', () => {
    const first = applyToolCallDelta(runningMessage(), 'line 1\n', 'call-1')
    const second = applyToolCallDelta({ ...runningMessage(), ...first }, 'line 2\n', 'call-1')

    expect(second.toolCalls?.[0].outputRaw).toBe('line 1\nline 2\n')
    // 增量输出不再落到入参字段上（回归：曾被写进 inputRaw，被当成命令渲染）
    expect(Object.keys(second.toolCalls?.[0] ?? {})).not.toContain('inputRaw')
    // 时间线上的工具调用事件同步更新，否则折叠态展示不到增量
    expect(second.events?.[0].toolCall?.outputRaw).toBe('line 1\nline 2\n')
  })

  it('找不到对应 tool.call.started 时丢弃增量', () => {
    // 没有归属就没有可渲染位置；静默丢弃而不是新建事件
    expect(applyToolCallDelta(runningMessage(), 'orphan', 'call-unknown')).toEqual({})
  })
})
