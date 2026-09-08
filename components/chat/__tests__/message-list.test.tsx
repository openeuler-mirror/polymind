/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import { MessageList } from '@/components/chat/message-list'
import type { Message } from '@/lib/types'

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
