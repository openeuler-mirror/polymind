/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import { MessageList } from '@/components/chat/message-list'
import { cacheHitRate, formatCompactTokens } from '@/components/chat/message-usage'
import type { Artifact, Message } from '@/lib/types'

jest.mock('mermaid', () => ({
  __esModule: true,
  default: { initialize: jest.fn(), render: jest.fn() },
}))
jest.mock('react-syntax-highlighter', () => ({ __esModule: true, Prism: () => null }))
jest.mock(
  'react-syntax-highlighter/dist/cjs/styles/prism',
  () => ({ __esModule: true, oneDark: {} }),
  {
    virtual: true,
  }
)
jest.mock('@/components/markdown/markdown-content', () => {
  const React = require('react')
  return {
    MarkdownContent: ({ content }: { content: string }) =>
      React.createElement('div', null, content),
  }
})

function makeMessage(events: Message['events'], content = ''): Message {
  return {
    id: 'm1',
    role: 'assistant',
    content,
    timestamp: new Date('2026-01-01T00:00:00Z'),
    isStreaming: false,
    events,
  }
}

const processEvents: Message['events'] = [
  { type: 'thinking', content: '第一段思考', timestamp: 1000 },
  { type: 'message.delta', content: '中途正文', timestamp: 2000 },
  { type: 'thinking', content: '第二段思考', timestamp: 2500 },
  {
    type: 'tool.call.started',
    timestamp: 3000,
    toolCall: { id: 't1', name: 'read', status: 'running', input: { file_path: '/a.ts' } },
  },
  {
    type: 'tool.call.response',
    timestamp: 4000,
    toolCall: { id: 't1', name: 'read', status: 'completed', output: 'file body' },
  },
  { type: 'message.delta', content: '最终回答', timestamp: 5000 },
]

/** 收尾是工具调用（没有尾随正文）的常见形态：正文都在过程模块之前。 */
const toolCallLastEvents: Message['events'] = processEvents.slice(0, 5)

describe('MessageList 过程模块折叠', () => {
  it('折叠态只保留最后一个过程事件之后的正文，展开后显示全部过程与正文', () => {
    render(<MessageList messages={[makeMessage(processEvents)]} />)

    expect(screen.getByText('最终回答')).toBeTruthy()
    expect(screen.queryByText('中途正文')).toBeNull()
    expect(screen.queryByText('深度思考')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /已完成/ }))

    expect(screen.getByText('中途正文')).toBeTruthy()
    expect(screen.getAllByText('深度思考').length).toBe(2)
    expect(screen.getByText('最终回答')).toBeTruthy()
  })

  it('展开后「已完成」与首个过程模块之间留出更大间距', () => {
    render(<MessageList messages={[makeMessage(processEvents)]} />)

    const toggle = screen.getByRole('button', { name: /已完成/ })
    expect(toggle.nextElementSibling?.className).toContain('mt-2')

    fireEvent.click(toggle)
    expect(toggle.nextElementSibling?.className).toContain('mt-3')
  })

  it('最后一个事件是工具调用时，折叠态回退展示最后一段正文而不是整条折叠', () => {
    render(<MessageList messages={[makeMessage(toolCallLastEvents)]} />)

    // 回归：此前会把所有分组都折叠，用户看到一条空消息
    expect(screen.getByText('中途正文')).toBeTruthy()
    expect(screen.queryByText('深度思考')).toBeNull()
  })

  it('收尾是工具调用且 message.content 有正文时，正文只渲染一次', () => {
    render(<MessageList messages={[makeMessage(toolCallLastEvents, '中途正文')]} />)

    expect(screen.getAllByText('中途正文')).toHaveLength(1)
  })
})

describe('MessageList 思考段自动展开/闭合', () => {
  it('生成中的思考段自动展开（即使已有正文 checkpoint）', () => {
    const streaming: Message = {
      ...makeMessage([{ type: 'thinking', content: '正在推演', timestamp: 1000 }], '已有正文'),
      isStreaming: true,
    }
    render(<MessageList messages={[streaming]} />)

    // 回归：此前用 message.content 判断思考是否结束，正文一开始回写就把
    // 「后续出现的思考段」误判为已完成，导致思考内容不自动展开
    expect(screen.getByText('正在推演')).toBeTruthy()
  })

  it('思考完毕后自动闭合，展开「已完成」也不会重新弹出思考内容', () => {
    const streaming: Message = {
      ...makeMessage([{ type: 'thinking', content: '正在推演', timestamp: 1000 }], '已有正文'),
      isStreaming: true,
    }
    const { rerender } = render(<MessageList messages={[streaming]} />)
    expect(screen.getByText('正在推演')).toBeTruthy()

    rerender(<MessageList messages={[{ ...streaming, isStreaming: false }]} />)

    fireEvent.click(screen.getByRole('button', { name: /已完成/ }))
    expect(screen.getByText('深度思考')).toBeTruthy()
    expect(screen.queryByText('正在推演')).toBeNull()
  })

  it('生成中用户手动闭合后保持闭合，阶段切换后恢复自动跟随', () => {
    const streaming: Message = {
      ...makeMessage([{ type: 'thinking', content: '正在推演', timestamp: 1000 }], '已有正文'),
      isStreaming: true,
    }
    const { rerender } = render(<MessageList messages={[streaming]} />)

    fireEvent.click(screen.getByRole('button', { name: /深度思考/ }))
    expect(screen.queryByText('正在推演')).toBeNull()

    // 结束生成再回到生成中：应重新自动展开
    rerender(<MessageList messages={[{ ...streaming, isStreaming: false }]} />)
    rerender(<MessageList messages={[streaming]} />)
    expect(screen.getByText('正在推演')).toBeTruthy()
  })
})

describe('MessageList 提问卡片', () => {
  const questionEvents: Message['events'] = [
    {
      type: 'question.asked',
      timestamp: 1000,
      payload: {
        question_id: 'q1',
        questions: [
          {
            header: '数据源',
            question: '你希望使用哪个数据源？',
            options: [{ label: '生产库' }],
          },
        ],
      },
    },
    {
      type: 'question.replied',
      timestamp: 2000,
      payload: { question_id: 'q1', answers: [['生产库']] },
    },
  ]

  function makeAskedMessage(): Message {
    return {
      ...makeMessage(questionEvents, '我选好了'),
      question: [
        { header: '数据源', question: '你希望使用哪个数据源？', options: [{ label: '生产库' }] },
      ],
      questionId: 'q1',
      questionStatus: 'replied',
      questionAnswers: [['生产库']],
    }
  }

  it('已回答的提问卡片同时展示原问题与答案', () => {
    render(<MessageList messages={[makeAskedMessage()]} />)
    fireEvent.click(screen.getByRole('button', { name: /已完成/ }))

    // 卡片行摘要 + 卡片正文里的完整问题
    expect(screen.getByText('你希望使用哪个数据源？')).toBeTruthy()
    expect(screen.getByText('回答')).toBeTruthy()
    expect(screen.getByText('生产库')).toBeTruthy()
  })

  it('已回答时卡片默认展开，用户手动闭合后保持闭合', () => {
    render(<MessageList messages={[makeAskedMessage()]} />)
    fireEvent.click(screen.getByRole('button', { name: /已完成/ }))

    expect(screen.getByText('你希望使用哪个数据源？')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /向用户提问/ }))
    expect(screen.queryByText('你希望使用哪个数据源？')).toBeNull()
  })
})

describe('MessageList 工具调用行', () => {
  it('工具行显示「标签 · 目标」以及短结果预览', () => {
    const events: Message['events'] = [
      {
        type: 'tool.call.started',
        timestamp: 1000,
        toolCall: {
          id: 't1',
          name: 'read',
          status: 'completed',
          input: { file_path: 'components/chat/message-list.tsx' },
          output: '文件内容',
        },
      },
      { type: 'message.delta', content: '收尾正文', timestamp: 2000 },
    ]
    render(<MessageList messages={[makeMessage(events, '收尾正文')]} />)
    fireEvent.click(screen.getByRole('button', { name: /已完成/ }))

    expect(screen.getByText('读取')).toBeTruthy()
    expect(screen.getByText('components/chat/message-list.tsx')).toBeTruthy()
    expect(screen.getByText('文件内容')).toBeTruthy()
  })

  it('运行类工具显示命令内容，未知工具回落为原始工具名', () => {
    const events: Message['events'] = [
      {
        type: 'tool.call.started',
        timestamp: 1000,
        toolCall: { id: 't1', name: 'exec', status: 'running', input: { command: 'pnpm lint' } },
      },
      {
        type: 'tool.call.started',
        timestamp: 1500,
        toolCall: { id: 't2', name: 'mystery_tool', status: 'running', input: {} },
      },
      { type: 'message.delta', content: '收尾正文', timestamp: 2000 },
    ]
    render(<MessageList messages={[makeMessage(events, '收尾正文')]} />)
    fireEvent.click(screen.getByRole('button', { name: /已完成/ }))

    expect(screen.getByText('运行')).toBeTruthy()
    expect(screen.getByText('pnpm lint')).toBeTruthy()
    expect(screen.getAllByText('mystery_tool').length).toBe(1)
  })

  it('tool.call.delta 的增量输出展示为「输出」，不会被当成命令', () => {
    // 回归：增量输出曾被当作 inputRaw，exec 展开面板会把它渲染成 `$ <stdout>`
    const events: Message['events'] = [
      {
        type: 'tool.call.started',
        timestamp: 1000,
        toolCall: {
          id: 't1',
          name: 'exec',
          status: 'running',
          input: { command: 'pnpm test' },
          outputRaw: 'RUN v24.18.0\nPASS lib/x.test.ts',
        },
      },
      { type: 'message.delta', content: '收尾正文', timestamp: 2000 },
    ]
    render(<MessageList messages={[makeMessage(events, '收尾正文')]} />)
    fireEvent.click(screen.getByRole('button', { name: /已完成/ }))
    fireEvent.click(screen.getByRole('button', { name: /运行/ }))

    // `$` 提示符那一行只有命令本身，增量输出绝不混进来
    const commandLine = screen.getByText('$').parentElement as HTMLElement
    expect(commandLine.textContent).toContain('pnpm test')
    expect(commandLine.textContent).not.toContain('PASS')

    expect(screen.getByText(/PASS lib\/x\.test\.ts/)).toBeTruthy()
  })

  it('增量输出在普通工具里走「输出」区域', () => {
    const events: Message['events'] = [
      {
        type: 'tool.call.started',
        timestamp: 1000,
        toolCall: {
          id: 't1',
          name: 'edit',
          status: 'running',
          input: { file_path: 'lib/x.ts' },
          outputRaw: 'applying patch...',
        },
      },
      { type: 'message.delta', content: '收尾正文', timestamp: 2000 },
    ]
    render(<MessageList messages={[makeMessage(events, '收尾正文')]} />)
    fireEvent.click(screen.getByRole('button', { name: /已完成/ }))
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }))

    expect(screen.getByText('输出')).toBeTruthy()
    expect(screen.getByText('applying patch...')).toBeTruthy()
  })
})

describe('MessageList 本轮用量', () => {
  const usage: Message['usage'] = {
    inputTokens: 94460,
    outputTokens: 83484,
    cacheReadTokens: 11684480,
    cacheWriteTokens: 0,
    reasoningTokens: 43660,
    totalTokens: 11862424,
    totalCost: 0.0042,
  }

  it('完成后在复制/重新生成同排展示紧凑用量，点击展开明细', () => {
    render(<MessageList messages={[{ ...makeMessage(undefined, '正文'), usage }]} />)

    const badge = screen.getByRole('button', { name: /用量 11\.9M tok/ })
    fireEvent.click(badge)

    expect(screen.getByText('本轮用量')).toBeTruthy()
    expect(screen.getByText('11,862,424 tok')).toBeTruthy()
    expect(screen.getByText('99.2%')).toBeTruthy()
    expect(screen.getByText('94,460 tok')).toBeTruthy()
    expect(screen.getByText('11,684,480 tok')).toBeTruthy()
    expect(screen.getByText('83,484 tok（其中推理 43,660 tok）')).toBeTruthy()
    // 小额成本保留 4 位小数，避免显示成 $0.00
    expect(screen.getByText('$0.0042')).toBeTruthy()
    // 缓存写为 0 时不占位
    expect(screen.queryByText('缓存写入')).toBeNull()
  })

  it('流式期间不展示用量（后端跨 step 累计，收尾才完整）', () => {
    render(
      <MessageList messages={[{ ...makeMessage(undefined, '正文'), usage, isStreaming: true }]} />
    )

    expect(screen.queryByRole('button', { name: /用量/ })).toBeNull()
  })

  it('没有用量时不渲染徽标', () => {
    render(<MessageList messages={[makeMessage(undefined, '正文')]} />)

    expect(screen.queryByRole('button', { name: /用量/ })).toBeNull()
  })

  it('上游只给总量时不渲染明细行', () => {
    render(
      <MessageList
        messages={[{ ...makeMessage(undefined, '正文'), usage: { totalTokens: 500 } }]}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /用量 500 tok/ }))

    expect(screen.getByText('500 tok')).toBeTruthy()
    expect(screen.queryByText('缓存命中')).toBeNull()
    expect(screen.queryByText('成本')).toBeNull()
  })
})

describe('MessageList 悬停显隐', () => {
  const usage: Message['usage'] = { inputTokens: 94460, outputTokens: 83484, totalTokens: 11862424 }

  it('用量徽标与复制/重新生成同层淡入淡出：悬停消息时才一起出现', () => {
    render(<MessageList messages={[{ ...makeMessage(undefined, '正文'), usage }]} />)

    const badge = screen.getByRole('button', { name: /用量 11\.9M tok/ })
    // 徽标与复制/重新生成共用具名 group 容器：一次悬停同时显隐，二者显示逻辑对称
    const hoverLayer = badge.closest('[class*="group-hover/msg:"]')
    expect(hoverLayer).toBeTruthy()
    expect(hoverLayer?.querySelectorAll('button').length).toBe(3)
    expect(hoverLayer?.className).toContain('opacity-0')
  })

  const artifacts: Artifact[] = [
    {
      id: 'a1',
      name: 'snake.html',
      type: 'html',
      status: 'ready',
      version: 1,
      relativePath: 'snake.html',
      size: 7065,
    },
    {
      id: 'a2',
      name: 'report.md',
      type: 'markdown',
      status: 'ready',
      version: 1,
      relativePath: 'report.md',
      size: 2048,
    },
  ]

  it('产物卡片按钮只跟本卡片的悬停：不被消息悬停或相邻卡片连带点亮', () => {
    render(<MessageList messages={[{ ...makeMessage(undefined, '正文'), artifacts }]} />)

    const cards = document.querySelectorAll('[class~="group/artifact"]')
    expect(cards.length).toBe(2)

    for (const card of Array.from(cards)) {
      const actions = card.querySelector('[class*="group-hover/artifact:"]')
      expect(actions?.className).toContain('opacity-0')
      // 具名 group：只响应本卡片自身的悬停，而不是外层消息的 group
      expect(actions?.className).toContain('group-hover/artifact:opacity-100')
      expect(actions?.className).not.toContain('group-hover:opacity-100')
    }
  })
})

describe('用量格式化', () => {
  it('万以下保留千分位，万/百万才缩写', () => {
    expect(formatCompactTokens(999)).toBe('999')
    expect(formatCompactTokens(9999)).toBe('9,999')
    expect(formatCompactTokens(19954)).toBe('20.0K')
    expect(formatCompactTokens(11862424)).toBe('11.9M')
  })

  it('缓存命中率在缺项或除零时返回 null', () => {
    expect(cacheHitRate({ cacheReadTokens: 19840, inputTokens: 140 })).toBe('99.3%')
    expect(cacheHitRate({ cacheReadTokens: 0, inputTokens: 0 })).toBeNull()
    expect(cacheHitRate({ cacheReadTokens: 10 })).toBeNull()
    expect(cacheHitRate({ inputTokens: 10 })).toBeNull()
  })
})
