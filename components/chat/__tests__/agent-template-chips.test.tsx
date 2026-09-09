/** @jest-environment jsdom */
import { act, render, screen, waitFor } from '@testing-library/react'
import { AgentTemplateChips } from '@/components/chat/agent-template-chips'
import { useChatStore } from '@/lib/store'
import type { Agent, AgentTemplateInfo } from '@/lib/types'

const mockTemplates: AgentTemplateInfo[] = [
  {
    name: 'app-perf-optimizer',
    description: '应用层性能优化',
    version: '1.0.0',
    skillCount: 5,
    skills: [],
    sourceCommit: null,
  },
  {
    name: 'os-perf-optimizer',
    description: 'OS 层性能调优',
    version: '1.0.0',
    skillCount: 13,
    skills: [],
    sourceCommit: null,
  },
]

const mockAgents: Agent[] = [
  {
    id: 'agent-1',
    name: 'app-perf-optimizer',
    description: '',
    adapterType: 'opencode',
    sandboxType: 'local_process',
    status: 'running',
    idleTimeoutSeconds: 300,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
]

jest.mock('@/services/agent-service', () => ({
  agentService: {
    getAgentTemplates: jest.fn(async () => mockTemplates),
    getAgents: jest.fn(async () => mockAgents),
  },
}))
jest.mock('@/services/model-service', () => ({
  modelService: { getModels: jest.fn(async () => []) },
}))
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }))

/** 通过可访问名（aria-label）定位 chip，并读回它的可访问名用于断言状态。 */
function chipLabel(templateName: string): string {
  const button = screen.getByRole('button', { name: new RegExp(templateName) })
  return button.getAttribute('aria-label') ?? ''
}

describe('AgentTemplateChips 与全局 store 的模版状态一致性', () => {
  beforeEach(() => {
    useChatStore.setState({ agents: [], templateWallReady: false, templateNames: [] })
  })

  it('挂载时按 store 中的 agent 列表标记「已创建」', async () => {
    render(<AgentTemplateChips />)

    await waitFor(() => expect(useChatStore.getState().agents).toHaveLength(1))

    expect(await screen.findByRole('button', { name: /app-perf-optimizer/ })).toBeTruthy()
    expect(chipLabel('app-perf-optimizer')).toContain('已创建')
    expect(chipLabel('os-perf-optimizer')).toContain('实例化模板')
  })

  it('智能体页删除该 agent 后，模版墙状态同步回退为「未创建」', async () => {
    render(<AgentTemplateChips />)

    await waitFor(() => expect(useChatStore.getState().agents).toHaveLength(1))
    expect(chipLabel('app-perf-optimizer')).toContain('已创建')

    // 智能体页删除 agent 走的是同一个 store action（removeAgent）
    act(() => {
      useChatStore.getState().removeAgent('agent-1')
    })

    await waitFor(() => {
      expect(chipLabel('app-perf-optimizer')).toContain('实例化模板')
    })
  })
})
