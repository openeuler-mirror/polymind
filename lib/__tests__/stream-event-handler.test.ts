import { coalesceStreamEvents } from '../stream-event-handler'
import type { EventItem } from '../types'

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
