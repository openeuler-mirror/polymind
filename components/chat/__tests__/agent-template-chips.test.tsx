/** @jest-environment jsdom */
import { act, render, screen, waitFor, within } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { AgentTemplateChips } from '@/components/chat/agent-template-chips'
import i18n from '@/lib/i18n/config'
import { useChatStore } from '@/lib/store'
import { modelService } from '@/services/model-service'
import type { Agent, AgentTemplateInfo } from '@/lib/types'

/** os-perf-optimizer 声明的默认提问（后端 default_prompt），app-perf-optimizer 未声明。 */
const OS_DEFAULT_PROMPT = '帮我做一次 OS 层性能体检：先采集系统数据，再给出调优方案。'

const mockTemplates: AgentTemplateInfo[] = [
  {
    name: 'app-perf-optimizer',
    description: '应用层性能优化',
    version: '1.0.0',
    skillCount: 5,
    skills: [],
    sourceCommit: null,
    defaultPrompt: null,
  },
  {
    name: 'os-perf-optimizer',
    description: 'OS 层性能调优',
    version: '1.0.0',
    skillCount: 13,
    skills: [],
    sourceCommit: null,
    defaultPrompt: OS_DEFAULT_PROMPT,
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

/** 实例化未创建过的模版时后端返回的新 Agent。 */
const instantiatedAgent: Agent = {
  id: 'agent-2',
  name: 'os-perf-optimizer',
  description: '',
  adapterType: 'opencode',
  sandboxType: 'local_process',
  status: 'running',
  idleTimeoutSeconds: 300,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

jest.mock('@/services/agent-service', () => ({
  agentService: {
    getAgentTemplates: jest.fn(async () => mockTemplates),
    getAgents: jest.fn(async () => mockAgents),
    instantiateAgentTemplate: jest.fn(async () => instantiatedAgent),
  },
}))
jest.mock('@/services/model-service', () => ({
  modelService: {
    getModels: jest.fn(async () => [
      { id: 'model-1', name: 'gpt-4o', provider: 'openai', enabled: true, isDefault: true },
    ]),
  },
}))
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }))

/**
 * 模版墙文案（加载中 / 已创建 / 实例化提示）走 i18n，测试用真实语言资源渲染，
 * 断言保持用户实际看到的中文；不提供 provider 时 t() 只会回显 key，断言无从下手。
 */
function renderChips() {
  return render(
    <I18nextProvider i18n={i18n}>
      <AgentTemplateChips />
    </I18nextProvider>
  )
}

/** 每个用例都从「无 agent、无待填文本、无默认模型弹窗」的干净状态开始。 */
function resetChipsStore() {
  useChatStore.setState({
    agents: [],
    templateWallReady: false,
    templateNames: [],
    composerPrefill: null,
    currentAgentId: null,
    isDefaultModelDialogOpen: false,
  })
}

/** 通过可访问名（aria-label）定位 chip，并读回它的可访问名用于断言状态。 */
function chipLabel(templateName: string): string {
  const button = screen.getByRole('button', { name: new RegExp(templateName) })
  return button.getAttribute('aria-label') ?? ''
}

describe('AgentTemplateChips 与全局 store 的模版状态一致性', () => {
  beforeEach(resetChipsStore)

  // 有用例会切到 en-US 验证翻页按钮文案确实来自 i18n，跑完还原，免得影响断言中文的用例
  afterEach(async () => {
    if (i18n.language !== 'zh-CN') {
      await act(async () => {
        await i18n.changeLanguage('zh-CN')
      })
    }
  })

  it('挂载时按 store 中的 agent 列表标记「已创建」', async () => {
    renderChips()

    await waitFor(() => expect(useChatStore.getState().agents).toHaveLength(1))

    expect(await screen.findByRole('button', { name: /app-perf-optimizer/ })).toBeTruthy()
    expect(chipLabel('app-perf-optimizer')).toContain('已创建')
    expect(chipLabel('os-perf-optimizer')).toContain('实例化模板')
  })

  it('智能体页删除该 agent 后，模版墙状态同步回退为「未创建」', async () => {
    renderChips()

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

  it('os-perf-optimizer 存在时排在模版墙第一位（后端顺序中它在最后）', async () => {
    renderChips()

    const track = await waitFor(() => {
      const node = document.querySelector('[data-slot="scroll-carousel-track"]')
      expect(node).toBeTruthy()
      return node as HTMLElement
    })

    // 后端返回顺序为 [app-perf-optimizer, os-perf-optimizer]，置顶后应反转
    const chipNames = within(track)
      .getAllByRole('button')
      .map(button => button.textContent)
    expect(chipNames).toEqual(['os-perf-optimizer', 'app-perf-optimizer'])
  })

  // 切到 en-US：翻页按钮文案由 ScrollCarousel 内部取 common 命名空间
  // （action.scrollLeft/scrollRight），不传任何 props；只有换语言才能证明它真的走了
  // i18n（key 写错会回显 key 本身），也证明没有回退到硬编码中文
  it('翻页按钮文案取自 common 命名空间，而非组件内写死', async () => {
    await act(async () => {
      await i18n.changeLanguage('en-US')
    })
    renderChips()

    expect(await screen.findByRole('button', { name: 'Scroll left' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Scroll right' })).toBeTruthy()
  })
})

/**
 * 点击模版 = 实例化 + 把后端声明的 default_prompt 交给输入框。
 * 二者都走全局 store：模版墙只负责「写入一次性待填文本」，
 * 真正填进输入框由 chat-input 消费（见 chat-input.test.tsx）。
 */
describe('AgentTemplateChips 点击后填入模板默认提问', () => {
  beforeEach(resetChipsStore)

  it('实例化出 Agent 后，把 default_prompt 写入待填文本', async () => {
    renderChips()
    const chip = await screen.findByRole('button', { name: /os-perf-optimizer/ })

    await act(async () => {
      chip.click()
    })

    await waitFor(() => expect(useChatStore.getState().composerPrefill).toBe(OS_DEFAULT_PROMPT))
    // 填提问的前提是确实选中了 Agent，而不是单纯把文本塞进输入框
    expect(useChatStore.getState().currentAgentId).toBe('agent-2')
    // tooltip 先说清楚「点下去会填什么」，避免输入框被写入内容时用户没预期
    expect(chip.getAttribute('title')).toContain(OS_DEFAULT_PROMPT)
  })

  it('模版未声明 default_prompt 时不改动输入框（仅选中 Agent）', async () => {
    renderChips()
    const chip = await screen.findByRole('button', { name: /app-perf-optimizer/ })

    await act(async () => {
      chip.click()
    })

    await waitFor(() => expect(useChatStore.getState().currentAgentId).toBe('agent-1'))
    expect(useChatStore.getState().composerPrefill).toBeNull()
  })

  it('没有可用默认模型（实例化未成功）时不填提问，避免填了也发不出去', async () => {
    ;(modelService.getModels as jest.Mock).mockResolvedValueOnce([])
    renderChips()
    const chip = await screen.findByRole('button', { name: /os-perf-optimizer/ })

    await act(async () => {
      chip.click()
    })

    await waitFor(() => expect(useChatStore.getState().isDefaultModelDialogOpen).toBe(true))
    expect(useChatStore.getState().composerPrefill).toBeNull()
  })
})
