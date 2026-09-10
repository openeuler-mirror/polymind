import {
  buildMessageEventGroups,
  clearMessageEventGroupsCache,
  getMessageEventGroups,
  isProcessGroup,
} from '../message-event-groups'
import type { EventItem } from '../types'

const thinking = (content: string, timestamp: number): EventItem => ({
  type: 'thinking',
  content,
  timestamp,
})

const delta = (content: string, timestamp: number): EventItem => ({
  type: 'message.delta',
  content,
  timestamp,
})

const toolStarted = (
  id: string,
  timestamp: number,
  input?: Record<string, unknown>
): EventItem => ({
  type: 'tool.call.started',
  timestamp,
  toolCall: { id, name: 'bash', status: 'running', input },
})

const toolResponse = (id: string, timestamp: number, output: string): EventItem => ({
  type: 'tool.call.response',
  timestamp,
  toolCall: { id, name: 'bash', status: 'completed', output },
})

describe('buildMessageEventGroups', () => {
  it('把连续 thinking / delta 各自合并为一段，并保留时间线顺序', () => {
    const groups = buildMessageEventGroups([
      thinking('思考一', 1),
      thinking('思考二', 2),
      delta('正文一', 3),
      delta('正文二', 4),
      delta('正文三', 5),
    ])

    expect(groups.map(g => g.type)).toEqual(['thinking-group', 'delta-group'])
    expect(groups[0].events).toHaveLength(2)
    expect(groups[1].events).toHaveLength(3)
  })

  it('thinking 与 delta 交替时切成多段，不跨类型合并', () => {
    const groups = buildMessageEventGroups([
      thinking('思考', 1),
      delta('正文', 2),
      thinking('思考', 3),
      delta('正文', 4),
    ])

    expect(groups.map(g => g.type)).toEqual([
      'thinking-group',
      'delta-group',
      'thinking-group',
      'delta-group',
    ])
  })

  it('同一 toolCall 的 started / response 合并到首次出现的位置', () => {
    const groups = buildMessageEventGroups([
      delta('开始', 1),
      toolStarted('t1', 2, { command: 'ls' }),
      toolResponse('t1', 3, 'file list'),
      delta('结束', 4),
    ])

    expect(groups.map(g => g.type)).toEqual(['delta-group', 'tool.call.response', 'delta-group'])
    // 后到事件的字段补齐，但 started 携带的 input 不被 response 覆盖
    expect(groups[1].toolCall).toMatchObject({
      id: 't1',
      status: 'completed',
      output: 'file list',
      input: { command: 'ls' },
    })
  })

  it('后到事件自带 input 时以它为准', () => {
    const groups = buildMessageEventGroups([
      toolStarted('t1', 1, { command: 'ls' }),
      {
        type: 'tool.call.response',
        timestamp: 2,
        toolCall: {
          id: 't1',
          name: 'bash',
          status: 'completed',
          input: { command: 'ls -la' },
        },
      },
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].toolCall?.input).toEqual({ command: 'ls -la' })
  })

  it('缺少 id 的工具调用不去重，原样透传', () => {
    const groups = buildMessageEventGroups([
      {
        type: 'tool.call.started',
        timestamp: 1,
        toolCall: { id: '', name: 'x', status: 'running' },
      },
      {
        type: 'tool.call.response',
        timestamp: 2,
        toolCall: { id: '', name: 'x', status: 'completed' },
      },
    ])

    expect(groups).toHaveLength(2)
  })

  it('提问等其它事件原样透传', () => {
    const asked: EventItem = { type: 'question.asked', timestamp: 1, payload: { questions: [] } }
    const groups = buildMessageEventGroups([asked])

    expect(groups).toEqual([asked])
  })
})

describe('isProcessGroup', () => {
  it('只把思考/工具调用/提问视为过程模块', () => {
    expect(isProcessGroup({ type: 'thinking-group' })).toBe(true)
    expect(isProcessGroup({ type: 'tool.call.started' })).toBe(true)
    expect(isProcessGroup({ type: 'question.rejected' })).toBe(true)
    expect(isProcessGroup({ type: 'delta-group' })).toBe(false)
    expect(isProcessGroup({ type: 'message.completed' })).toBe(false)
  })
})

describe('getMessageEventGroups（增量缓存）', () => {
  const timeline = (): EventItem[] => [
    thinking('思考', 1),
    delta('正', 2),
    toolStarted('t1', 3, { command: 'ls' }),
    toolResponse('t1', 4, 'ok'),
    delta('文', 5),
  ]

  beforeEach(() => {
    clearMessageEventGroupsCache()
  })

  it('逐条追加的结果与一次性构建完全一致', () => {
    const events = timeline()
    let incremental: ReturnType<typeof getMessageEventGroups> = []
    for (let i = 1; i <= events.length; i++) {
      incremental = getMessageEventGroups('m-incremental', events.slice(0, i))
    }

    expect(incremental).toEqual(buildMessageEventGroups(events))
  })

  it('事件数组引用不变时直接复用分组结果', () => {
    const events = timeline()
    const first = getMessageEventGroups('m-reuse', events)

    expect(getMessageEventGroups('m-reuse', events)).toBe(first)
  })

  it('尾部追加时复用累加器，只处理新增事件', () => {
    const base = timeline()
    const first = getMessageEventGroups('m-append', base)

    const appended = [...base, delta('尾巴', 6)]
    const second = getMessageEventGroups('m-append', appended)

    expect(second).toBe(first)
    expect(second[second.length - 1].events).toHaveLength(2)
  })

  it('非追加式变更（如消息完成后的 delta 收敛）会整体重建', () => {
    const base = timeline()
    const first = getMessageEventGroups('m-rebuild', base)

    const coalesced = [delta('正文全文', 2), toolStarted('t1', 3, { command: 'ls' })]
    const second = getMessageEventGroups('m-rebuild', coalesced)

    expect(second).not.toBe(first)
    expect(second).toEqual(buildMessageEventGroups(coalesced))
  })

  it('不同消息各自独立缓存', () => {
    const events = timeline()
    const a = getMessageEventGroups('m-a', events)
    const b = getMessageEventGroups('m-b', events)

    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})
