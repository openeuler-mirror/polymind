import { sessionService } from '../../services/session-service'
import type { EventItem } from '../../lib/types'

/**
 * 锁定 services/session-service.ts 的 transformMessage/transformEvents 行为：
 * - 已结束消息：连续 message.delta 收敛为文本段（coalesceStreamEvents）
 * - 生成中消息：保留逐段 delta 事件
 * - 空 delta 与 artifact.delta 被过滤
 * - 已完成消息的 running toolCall 归一化为 completed
 * - delta 字段映射进 content，timestamp 接受 number 或 ISO 字符串
 * 通过导出的单例 sessionService 进行测试（SessionService 类未导出）。
 */

const genMsg = (overrides: Record<string, any> = {}): Record<string, any> => ({
  id: 'm1',
  role: 'assistant',
  status: 'generating',
  ...overrides,
})

const finishedMsg = (overrides: Record<string, any> = {}): Record<string, any> => ({
  id: 'm1',
  role: 'assistant',
  status: 'completed',
  ...overrides,
})

const toolEvent = (id: string, timestamp = 2): EventItem => {
  const toolCall = { id, name: 'bash', status: 'completed' as const }
  return { type: 'tool.call.started', content: '正在调用工具：bash', timestamp, toolCall }
}

describe('sessionService.transformMessage', () => {
  describe('finished message event coalescing', () => {
    it('coalesces consecutive message.delta chunks into a single text segment in timeline order', () => {
      const msg = finishedMsg({
        content: '先看代码结论',
        events: [
          { type: 'message.delta', delta: '先看', timestamp: 1 },
          { type: 'message.delta', delta: '代码', timestamp: 2 },
          toolEvent('t1', 3),
          { type: 'message.delta', delta: '结论', timestamp: 4 },
        ],
      })

      const message = sessionService.transformMessage(msg)

      expect(message.events).toEqual([
        {
          type: 'message.delta',
          content: '先看代码',
          timestamp: 1,
          toolCall: undefined,
          payload: undefined,
        },
        // 工具调用事件保持在时间线上
        toolEvent('t1', 3),
        {
          type: 'message.delta',
          content: '结论',
          timestamp: 4,
          toolCall: undefined,
          payload: undefined,
        },
      ])
    })

    it('drops artifact.delta events and empty message.delta events', () => {
      const msg = finishedMsg({
        content: '正文',
        events: [
          { type: 'artifact.delta', content: 'x', timestamp: 1 },
          { type: 'message.delta', timestamp: 2 }, // 既无 delta 也无 content → 过滤
          { type: 'message.delta', content: '正文', timestamp: 3 },
        ],
      })

      const message = sessionService.transformMessage(msg)

      expect(message.events).toEqual([
        {
          type: 'message.delta',
          content: '正文',
          timestamp: 3,
          toolCall: undefined,
          payload: undefined,
        },
      ])
    })

    it('appends the missing tail when deltas are a strict prefix of the final content', () => {
      const msg = finishedMsg({
        content: '前后补齐',
        events: [
          { type: 'message.delta', delta: '前', timestamp: 1 },
          toolEvent('t1', 2),
          { type: 'message.delta', delta: '后', timestamp: 3 },
        ],
      })

      const message = sessionService.transformMessage(msg)

      expect(message.events).toEqual([
        {
          type: 'message.delta',
          content: '前',
          timestamp: 1,
          toolCall: undefined,
          payload: undefined,
        },
        toolEvent('t1', 2),
        {
          type: 'message.delta',
          content: '后补齐',
          timestamp: 3,
          toolCall: undefined,
          payload: undefined,
        },
      ])
    })

    it('drops every message.delta when deltas cannot be reconciled with the final content', () => {
      const msg = finishedMsg({
        content: '最终正文',
        events: [
          { type: 'message.delta', delta: '完全不同的内容', timestamp: 1 },
          toolEvent('t1', 2),
        ],
      })

      const message = sessionService.transformMessage(msg)

      // UI 回退到 message.content 渲染
      expect(message.events).toEqual([toolEvent('t1', 2)])
    })
  })

  describe('generating message event passthrough', () => {
    it('preserves per-chunk message.delta events un-merged', () => {
      const msg = genMsg({
        content: '先看',
        events: [
          { type: 'message.delta', delta: '先', timestamp: 1 },
          { type: 'message.delta', delta: '看', timestamp: 2 },
        ],
      })

      const message = sessionService.transformMessage(msg)

      expect(message.events).toEqual([
        {
          type: 'message.delta',
          content: '先',
          timestamp: 1,
          toolCall: undefined,
          payload: undefined,
        },
        {
          type: 'message.delta',
          content: '看',
          timestamp: 2,
          toolCall: undefined,
          payload: undefined,
        },
      ])
    })
  })

  describe('tool call status normalisation', () => {
    it('forces a running tool call to completed on a finished message', () => {
      const running = { id: 't1', name: 'bash', status: 'running' as const }
      const msg = finishedMsg({
        content: '',
        tool_calls: [running],
        events: [{ type: 'tool.call.started', content: 'x', timestamp: 1, toolCall: running }],
      })

      const message = sessionService.transformMessage(msg)

      expect(message.toolCalls?.[0]?.status).toBe('completed')
      expect(message.events?.[0]?.toolCall?.status).toBe('completed')
    })

    it('keeps a running tool call running on a generating message', () => {
      const running = { id: 't1', name: 'bash', status: 'running' as const }
      const msg = genMsg({
        content: '',
        tool_calls: [running],
        events: [{ type: 'tool.call.started', content: 'x', timestamp: 1, toolCall: running }],
      })

      const message = sessionService.transformMessage(msg)

      expect(message.toolCalls?.[0]?.status).toBe('running')
      expect(message.events?.[0]?.toolCall?.status).toBe('running')
    })
  })

  describe('field mapping', () => {
    it('maps the delta field into content and accepts number or ISO-string timestamps', () => {
      const iso = '2025-01-02T03:04:05.000Z'
      const msg = genMsg({
        content: '你好世界',
        events: [
          { type: 'message.delta', delta: '你好', timestamp: 1000 },
          { type: 'message.delta', delta: '世界', timestamp: iso },
        ],
      })

      const message = sessionService.transformMessage(msg)

      expect(message.events?.[0]?.content).toBe('你好')
      expect(message.events?.[0]?.timestamp).toBe(1000)
      expect(message.events?.[1]?.content).toBe('世界')
      expect(message.events?.[1]?.timestamp).toBe(new Date(iso).getTime())
    })
  })

  describe('snake_case passthrough', () => {
    it('keeps question_answers / artifact_events / tool_calls working', () => {
      const msg = finishedMsg({
        content: '',
        question_answers: [['yes']],
        artifact_events: [
          {
            id: 'a1',
            name: 'report.md',
            type: 'markdown',
            relative_path: 'report.md',
            status: 'ready',
          },
        ],
        tool_calls: [{ id: 't1', name: 'bash', status: 'completed' }],
      })

      const message = sessionService.transformMessage(msg)

      expect(message.questionAnswers).toEqual([['yes']])
      expect(message.artifacts?.[0]).toMatchObject({
        id: 'a1',
        name: 'report.md',
        type: 'markdown',
        relativePath: 'report.md',
        status: 'ready',
        version: 1,
      })
      expect(message.toolCalls?.[0]?.id).toBe('t1')
      expect(message.toolCalls?.[0]?.status).toBe('completed')
    })
  })
})
