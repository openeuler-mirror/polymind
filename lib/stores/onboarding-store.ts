import type { StateCreator } from 'zustand'
import type { StoreState } from './index'

/**
 * 模版引导气泡的本地标志。
 * 只记录「已展示过」，不参与其它业务判定；改版本号可让全部用户重新看到一次。
 */
export const TEMPLATE_HINT_STORAGE_KEY = 'pm_onboarding_template_hint_v1'

interface TemplateHintPersist {
  /** 首次展示时间（ISO 字符串），仅用于排查，不参与判定。 */
  consumedAt: string
}

function loadTemplateHint(): TemplateHintPersist | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(TEMPLATE_HINT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<TemplateHintPersist>
    return typeof parsed?.consumedAt === 'string' ? { consumedAt: parsed.consumedAt } : null
  } catch {
    return null
  }
}

function saveTemplateHint(value: TemplateHintPersist): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(TEMPLATE_HINT_STORAGE_KEY, JSON.stringify(value))
  } catch {
    // localStorage 不可用（隐私模式/配额）时静默降级：内存态仍保证本次会话只弹一次。
  }
}

/**
 * 气泡锚点（模版墙根 DOM）。
 * DOM 节点不进 store：store 是全局可观测状态，放不可序列化对象会污染 devtools/持久化，
 * 也容易在组件卸载后留下游离节点。这里用模块级 ref 持有，store 只保留一个布尔量
 * templateHintAnchorReady 供组件响应式订阅「锚点是否就绪」。
 */
let templateHintAnchorEl: HTMLElement | null = null

/** 读取气泡锚点（仅在 templateHintAnchorReady 为 true 时有效）。 */
export function getTemplateHintAnchor(): HTMLElement | null {
  return templateHintAnchorEl
}

/** 仅供测试：清理模块级锚点，避免用例之间相互影响。 */
export function resetTemplateHintAnchor(): void {
  templateHintAnchorEl = null
}

export interface OnboardingSlice {
  /**
   * 是否曾配置出「enabled && isDefault」的默认模型。
   * 只用于一次性引导，置 true 后不随模型被删除/禁用回退，勿当作实时状态使用。
   */
  hasConfiguredDefaultModel: boolean
  /** 模版墙是否已就绪（列表加载成功且非空）；未就绪时气泡无处可指。 */
  templateWallReady: boolean
  /** 当前模版名称列表，用于判定「是否已创建模版 agent」。 */
  templateNames: string[]
  /** 气泡锚点是否已注册（锚点本体在模块级 ref 中，见 getTemplateHintAnchor）。 */
  templateHintAnchorReady: boolean
  /** 引导是否已被消费（本地标志；localStorage 不可用时退化为内存级）。 */
  templateHintConsumed: boolean
  /** 气泡是否可见。 */
  templateHintVisible: boolean

  setHasConfiguredDefaultModel: (value: boolean) => void
  reportTemplateWall: (state: { ready: boolean; names: string[] }) => void
  setTemplateHintAnchor: (el: HTMLElement | null) => void
  /** 统一判定入口：条件齐备则置为可见，并立即消费本地标志（保证「仅第一次」）。 */
  evaluateTemplateHint: () => void
  dismissTemplateHint: () => void
}

type OnboardingSliceData = Pick<
  OnboardingSlice,
  | 'hasConfiguredDefaultModel'
  | 'templateWallReady'
  | 'templateNames'
  | 'templateHintAnchorReady'
  | 'templateHintConsumed'
  | 'templateHintVisible'
>

/**
 * slice 的默认初始数据（不含持久化、不含动作）。
 * 作为 store 初始值与测试 reset 的唯一来源，避免平行副本漂移。
 */
export function createDefaultOnboardingSliceData(): OnboardingSliceData {
  return {
    hasConfiguredDefaultModel: false,
    templateWallReady: false,
    templateNames: [],
    templateHintAnchorReady: false,
    templateHintConsumed: false,
    templateHintVisible: false,
  }
}

/**
 * 判定气泡是否应当展示（纯函数，便于单测）。
 * 条件：已配置过默认模型 + 未消费标志 + 模版墙就绪且锚点已注册 + 尚无模版 agent + 默认模型弹窗未打开。
 */
export function canShowTemplateHint(
  state: OnboardingSliceData & Pick<StoreState, 'agents' | 'isDefaultModelDialogOpen'>
): boolean {
  if (state.templateHintVisible || state.templateHintConsumed) return false
  if (state.isDefaultModelDialogOpen) return false
  if (!state.hasConfiguredDefaultModel) return false
  if (!state.templateWallReady || !state.templateHintAnchorReady) return false
  if (state.templateNames.length === 0) return false
  return !state.agents.some(agent => state.templateNames.includes(agent.name))
}

/** 本 slice 运行所需的跨 slice 上下文（agents 来自 AgentSlice，弹窗开关来自 UISlice）。 */
export type OnboardingStoreState = OnboardingSlice &
  Pick<StoreState, 'agents' | 'isDefaultModelDialogOpen'>

export const createOnboardingSlice: StateCreator<OnboardingStoreState, [], [], OnboardingSlice> = (
  set,
  get
) => ({
  ...createDefaultOnboardingSliceData(),
  // 初值来自本地标志：已消费过则本次会话不再展示。
  templateHintConsumed: loadTemplateHint() !== null,

  setHasConfiguredDefaultModel: value => {
    set({ hasConfiguredDefaultModel: value })
    get().evaluateTemplateHint()
  },

  reportTemplateWall: ({ ready, names }) => {
    set({ templateWallReady: ready, templateNames: names })
    get().evaluateTemplateHint()
  },

  setTemplateHintAnchor: el => {
    templateHintAnchorEl = el
    set({ templateHintAnchorReady: !!el })
    get().evaluateTemplateHint()
  },

  evaluateTemplateHint: () => {
    if (!canShowTemplateHint(get())) return
    saveTemplateHint({ consumedAt: new Date().toISOString() })
    set({ templateHintVisible: true, templateHintConsumed: true })
  },

  dismissTemplateHint: () => set({ templateHintVisible: false }),
})
