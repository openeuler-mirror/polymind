import {
  applyToolCallDelta,
  applyUsageUpdated,
  coalesceStreamEvents,
  hasTerminalEvent,
  settleUnfinishedMessage,
} from '../stream-event-handler'
import { MessageStatus } from '../types'
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

describe('applyUsageUpdated', () => {
  it('把后端扁平 snake_case 载荷映射成 camelCase 用量', () => {
    const result = applyUsageUpdated({
      input_tokens: 2171,
      output_tokens: 36,
      cache_read_tokens: 2432,
      reasoning_tokens: 34,
      total_tokens: 4639,
      total_cost: 0.0012,
    })

    expect(result).toEqual({
      usage: {
        inputTokens: 2171,
        outputTokens: 36,
        cacheReadTokens: 2432,
        reasoningTokens: 34,
        totalTokens: 4639,
        totalCost: 0.0012,
      },
    })
  })

  it('未提供的字段不写入（dsh 无成本时不能显示 $0）', () => {
    const result = applyUsageUpdated({ input_tokens: 10, output_tokens: 5, total_tokens: 15 })

    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15 })
    expect(result.usage?.totalCost).toBeUndefined()
  })

  it('保留 0 值字段（缓存未命中是有效信息）', () => {
    const result = applyUsageUpdated({ cache_read_tokens: 0, output_tokens: 5 })

    expect(result.usage?.cacheReadTokens).toBe(0)
  })

  it('载荷里没有可识别字段时清空 usage（不渲染空用量块）', () => {
    expect(applyUsageUpdated({})).toEqual({ usage: undefined })
  })
})

describe('hasTerminalEvent', () => {
  it('只有 message.completed / turn.completed 算本轮跑完', () => {
    expect(hasTerminalEvent(undefined)).toBe(false)
    expect(hasTerminalEvent([])).toBe(false)
    expect(hasTerminalEvent([{ type: 'message.delta' }])).toBe(false)
    expect(hasTerminalEvent([{ type: 'stream.error' }])).toBe(false)
    expect(hasTerminalEvent([{ type: 'message.delta' }, { type: 'message.completed' }])).toBe(true)
    expect(hasTerminalEvent([{ type: 'turn.completed' }])).toBe(true)
  })
})

describe('settleUnfinishedMessage', () => {
  const streamingMessage = (): Message => ({
    id: 'm1',
    role: 'assistant',
    content: '已经生成的内容',
    timestamp: new Date(1),
    isStreaming: true,
    status: MessageStatus.GENERATING,
    events: [
      { type: 'message.delta', content: '已经生成', timestamp: 1 },
      { type: 'message.delta', content: '的内容', timestamp: 2 },
    ],
  })

  it('落定成 interrupted 并保留已生成的正文（不能清空）', () => {
    let message = streamingMessage()
    const streamingCalls: Array<[string | null, boolean]> = []
    const updateMessage = (
      _conversationId: string,
      _messageId: string,
      updates: Partial<Message> | ((m: Message) => Partial<Message>)
    ) => {
      message = { ...message, ...(typeof updates === 'function' ? updates(message) : updates) }
    }

    settleUnfinishedMessage(
      updateMessage,
      (cId, streaming) => streamingCalls.push([cId, streaming]),
      'conv-1',
      'm1'
    )

    expect(message.isStreaming).toBe(false)
    expect(message.status).toBe(MessageStatus.INTERRUPTED)
    expect(message.content).toBe('已经生成的内容')
    expect(message.events).toEqual([
      { type: 'message.delta', content: '已经生成的内容', timestamp: 1 },
    ])
    expect(streamingCalls).toEqual([['conv-1', false]])
  })

  it('已经是结束态的消息不动它（不覆盖 completed/error 的结果）', () => {
    let message: Message = { ...streamingMessage(), isStreaming: false }
    const updateMessage = (
      _conversationId: string,
      _messageId: string,
      updates: Partial<Message> | ((m: Message) => Partial<Message>)
    ) => {
      message = { ...message, ...(typeof updates === 'function' ? updates(message) : updates) }
    }

    settleUnfinishedMessage(updateMessage, () => {}, 'conv-1', 'm1')

    expect(message.isStreaming).toBe(false)
    expect(message.status).toBe(MessageStatus.GENERATING)
  })
})
