/** @jest-environment jsdom */

import { create } from 'zustand'
import {
  canShowTemplateHint,
  createDefaultOnboardingSliceData,
  createOnboardingSlice,
  getTemplateHintAnchor,
  resetTemplateHintAnchor,
  TEMPLATE_HINT_STORAGE_KEY,
  type OnboardingStoreState,
} from '../onboarding-store'
import type { Agent } from '../../types'

function createTestStore() {
  return create<OnboardingStoreState>()((...a) => ({
    ...createOnboardingSlice(...a),
    agents: [],
    isDefaultModelDialogOpen: false,
  }))
}

function makeAgent(name: string): Agent {
  return {
    id: `agent-${name}`,
    name,
    adapterType: 'openclaw',
    sandboxType: 'docker',
    status: 'running',
    idleTimeoutSeconds: 300,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

/** 把 store 推进到「除被测条件外全部就绪」的状态。 */
function armHint(store: ReturnType<typeof createTestStore>, templateNames = ['issue-fixer']) {
  store.getState().setHasConfiguredDefaultModel(true)
  store.getState().reportTemplateWall({ ready: true, names: templateNames })
  store.getState().setTemplateHintAnchor(document.createElement('div'))
}

function readPersistedFlag(): unknown {
  const raw = window.localStorage.getItem(TEMPLATE_HINT_STORAGE_KEY)
  return raw ? JSON.parse(raw) : null
}

describe('onboarding-store', () => {
  beforeEach(() => {
    window.localStorage.clear()
    // 锚点是模块级 ref，用例之间必须复位
    resetTemplateHintAnchor()
  })

  describe('canShowTemplateHint', () => {
    const base = {
      ...createDefaultOnboardingSliceData(),
      agents: [] as Agent[],
      isDefaultModelDialogOpen: false,
      hasConfiguredDefaultModel: true,
      templateWallReady: true,
      templateNames: ['issue-fixer'],
      templateHintAnchorReady: true,
    }

    it('条件齐备时允许展示', () => {
      expect(canShowTemplateHint(base)).toBe(true)
    })

    it('未配置默认模型时不展示', () => {
      expect(canShowTemplateHint({ ...base, hasConfiguredDefaultModel: false })).toBe(false)
    })

    it('默认模型弹窗打开中不展示', () => {
      expect(canShowTemplateHint({ ...base, isDefaultModelDialogOpen: true })).toBe(false)
    })

    it('已消费标志时不展示', () => {
      expect(canShowTemplateHint({ ...base, templateHintConsumed: true })).toBe(false)
    })

    it('模版墙未就绪或缺少锚点时不展示', () => {
      expect(canShowTemplateHint({ ...base, templateWallReady: false })).toBe(false)
      expect(canShowTemplateHint({ ...base, templateHintAnchorReady: false })).toBe(false)
      expect(canShowTemplateHint({ ...base, templateNames: [] })).toBe(false)
    })

    it('已存在同名模版 agent 时不展示', () => {
      expect(canShowTemplateHint({ ...base, agents: [makeAgent('issue-fixer')] })).toBe(false)
      // 同名之外的其他 agent 不影响判定
      expect(canShowTemplateHint({ ...base, agents: [makeAgent('my-own-agent')] })).toBe(true)
    })
  })

  describe('evaluateTemplateHint', () => {
    it('仅有默认模型时不展示、不消费', () => {
      const store = createTestStore()
      store.getState().setHasConfiguredDefaultModel(true)
      expect(store.getState().templateHintVisible).toBe(false)
      expect(readPersistedFlag()).toBeNull()
    })

    it('条件齐备时展示并立即写入本地标志', () => {
      const store = createTestStore()
      armHint(store)

      expect(store.getState().templateHintVisible).toBe(true)
      expect(store.getState().templateHintConsumed).toBe(true)
      expect(readPersistedFlag()).toEqual({ consumedAt: expect.any(String) })
    })

    it('已有模版 agent 时既不展示也不消费', () => {
      const store = createTestStore()
      store.setState({ agents: [makeAgent('issue-fixer')] })
      armHint(store)

      expect(store.getState().templateHintVisible).toBe(false)
      expect(readPersistedFlag()).toBeNull()
    })

    it('模版墙就绪前不消费，就绪后仍可展示', () => {
      const store = createTestStore()
      store.getState().setHasConfiguredDefaultModel(true)
      store.getState().reportTemplateWall({ ready: false, names: [] })
      expect(readPersistedFlag()).toBeNull()

      store.getState().reportTemplateWall({ ready: true, names: ['issue-fixer'] })
      store.getState().setTemplateHintAnchor(document.createElement('div'))
      expect(store.getState().templateHintVisible).toBe(true)
    })

    it('本地已有标志时初始化即为已消费，且不再展示', () => {
      window.localStorage.setItem(
        TEMPLATE_HINT_STORAGE_KEY,
        JSON.stringify({ consumedAt: '2024-01-01T00:00:00.000Z' })
      )
      const store = createTestStore()
      expect(store.getState().templateHintConsumed).toBe(true)

      armHint(store)
      expect(store.getState().templateHintVisible).toBe(false)
    })

    it('dismiss 后不会再次展示', () => {
      const store = createTestStore()
      armHint(store)
      expect(store.getState().templateHintVisible).toBe(true)

      store.getState().dismissTemplateHint()
      expect(store.getState().templateHintVisible).toBe(false)

      store.getState().evaluateTemplateHint()
      expect(store.getState().templateHintVisible).toBe(false)
    })

    it('localStorage 写入失败时降级为内存级消费且不抛错', () => {
      // jsdom 的 localStorage 方法定义在 Storage.prototype 上，需从原型上打桩。
      const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })
      try {
        const store = createTestStore()
        armHint(store)

        expect(store.getState().templateHintVisible).toBe(true)
        expect(store.getState().templateHintConsumed).toBe(true)
      } finally {
        setItem.mockRestore()
      }
    })
  })

  describe('模版墙锚点（模块级 ref，不进 store）', () => {
    it('注册/清理锚点并同步就绪标志，DOM 节点不落到 store 状态里', () => {
      const store = createTestStore()
      const el = document.createElement('div')

      store.getState().setTemplateHintAnchor(el)
      expect(getTemplateHintAnchor()).toBe(el)
      expect(store.getState().templateHintAnchorReady).toBe(true)
      // store 只保留布尔标志：不能把 DOM 节点混进可观测状态
      expect('templateHintAnchorEl' in store.getState()).toBe(false)

      store.getState().setTemplateHintAnchor(null)
      expect(getTemplateHintAnchor()).toBeNull()
      expect(store.getState().templateHintAnchorReady).toBe(false)
    })
  })

  describe('createDefaultOnboardingSliceData', () => {
    it('提供全关的默认初始数据', () => {
      const data = createDefaultOnboardingSliceData()
      expect(data.hasConfiguredDefaultModel).toBe(false)
      expect(data.templateWallReady).toBe(false)
      expect(data.templateNames).toEqual([])
      expect(data.templateHintAnchorReady).toBe(false)
      expect(data.templateHintConsumed).toBe(false)
      expect(data.templateHintVisible).toBe(false)
    })
  })
})
