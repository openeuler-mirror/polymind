import type { StateCreator } from 'zustand'
import type { MCPTool } from '../types'
import type { Tab } from './utils'
import { defaultTools } from './utils'
import { PANEL_TAB_META, type PanelTabId } from '../panel-tabs'

export type SidebarSectionKey = 'pinned' | 'regular' | 'scheduled'

/** 设置弹窗支持的 section；与 settings-dialog 的 SECTIONS 保持一致。 */
export type SettingsSectionId = 'general' | 'model'

/** 侧边栏宽度范围：默认取原 w-72（288px），拖拽时按此区间收敛。 */
export const SIDEBAR_MIN_WIDTH = 220
export const SIDEBAR_MAX_WIDTH = 400
export const SIDEBAR_DEFAULT_WIDTH = 288

/**
 * 把宽度收敛到 [SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH]。
 * 拖拽期间的实时预览同样要收敛（否则拖出边界会在松手时回跳），故对外导出复用。
 */
export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)))
}

interface SidebarUIPersist {
  sections: Record<SidebarSectionKey, boolean>
  folders: Record<string, boolean>
  width?: number
}

const SIDEBAR_UI_STORAGE_KEY = 'pm_sidebar_ui'

function loadSidebarUI(): SidebarUIPersist | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SIDEBAR_UI_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SidebarUIPersist>
    return {
      sections: {
        ...{ pinned: false, regular: false, scheduled: false },
        ...(parsed.sections ?? {}),
      },
      folders: parsed.folders ?? {},
      width: typeof parsed.width === 'number' ? parsed.width : undefined,
    }
  } catch {
    return null
  }
}

function saveSidebarUI(value: SidebarUIPersist): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SIDEBAR_UI_STORAGE_KEY, JSON.stringify(value))
  } catch {
    // localStorage 不可用（隐私模式/配额）时静默降级为不持久化。
  }
}

export interface UISlice {
  isSidebarOpen: boolean
  isRightPanelOpen: boolean
  /** 侧边栏展开时的宽度（px），拖拽调整并持久化。 */
  sidebarWidth: number
  mcpTools: MCPTool[]
  rightPanelTabs: Tab[]
  activeRightPanelTab: string | null
  settingsActiveSection: SettingsSectionId | null
  sidebarSectionsCollapsed: Record<SidebarSectionKey, boolean>
  scheduledTaskFoldersCollapsed: Record<string, boolean>
  toggleSidebar: () => void
  toggleRightPanel: () => void
  /** 设置侧边栏宽度并持久化，超出 [SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH] 时收敛。 */
  setSidebarWidth: (width: number) => void
  /**
   * 挂载后从 localStorage 恢复侧边栏 UI（宽度 / 分区折叠 / 文件夹折叠）。
   * 必须在客户端 effect 中调用，不能在 store 创建时读取：宽度会被渲染进内联 style，
   * 而 React 水合不会修补内联 style，首帧 SSR 默认值与客户端持久值不一致就必然残留错值。
   * 判定规则：凡会被首帧（含 SSR 输出）读取的值都要延迟到挂载后 hydrate；
   * 只在 effect / 用户交互里读取的值（如 settings 的 theme / language）可以在创建期读取。
   */
  hydrateSidebarUI: () => void
  toggleTool: (toolId: string) => void
  addRightPanelTab: (tab: Tab) => void
  removeRightPanelTab: (tabId: string) => void
  setActiveRightPanelTab: (tabId: string | null) => void
  setSettingsActiveSection: (section: SettingsSectionId | null) => void
  /** 产物面板当前选中的产物 id（卡片点击 / 面板切换共用） */
  selectedArtifactId: string | null
  /** 打开右侧产物面板并选中指定产物（幂等：tab 存在则不重复添加） */
  openArtifactPanel: (artifact: { id: string }) => void
  setSelectedArtifactId: (id: string | null) => void
  /**
   * 打开右侧面板指定 tab（幂等 add + activate + 展开面板）。
   * tab 元信息统一查 PANEL_TAB_META，调用方只需传 tabId。
   */
  openPanelTab: (tabId: PanelTabId) => void
  /** 设置弹窗开关（设置已弹窗化，不再占用右侧面板 tab）。 */
  isSettingsDialogOpen: boolean
  /** 打开设置弹窗并定位到指定 section（默认 general）。 */
  openSettingsDialog: (section?: SettingsSectionId) => void
  closeSettingsDialog: () => void
  isDefaultModelDialogOpen: boolean
  openDefaultModelDialog: () => void
  closeDefaultModelDialog: () => void
  toggleSidebarSection: (key: SidebarSectionKey) => void
  toggleScheduledTaskFolder: (taskId: string) => void
  /** 任务删除后清理其文件夹折叠状态，避免 localStorage 残留死键。 */
  clearScheduledTaskFolderCollapsed: (taskId: string) => void

  /**
   * 一次性待填入聊天输入框的文本（如模版墙点击后的「默认提问」）。
   * 生命周期只有「入口写入 → 输入框消费后立即清空」一种：常驻会把输入框内容
   * 变成全局状态，还会在输入框重挂载（切换会话、回到欢迎态）时重复灌入旧文本。
   */
  composerPrefill: string | null
  /** 请求把一段文本填入聊天输入框（一次性，由输入框消费后清空）。 */
  prefillComposer: (text: string) => void
  /** 输入框取走待填文本后清空，保证同一段文本只生效一次。 */
  consumeComposerPrefill: () => void
}

type UISliceData = Pick<
  UISlice,
  | 'isSidebarOpen'
  | 'isRightPanelOpen'
  | 'sidebarWidth'
  | 'mcpTools'
  | 'rightPanelTabs'
  | 'activeRightPanelTab'
  | 'settingsActiveSection'
  | 'isDefaultModelDialogOpen'
  | 'isSettingsDialogOpen'
  | 'selectedArtifactId'
  | 'sidebarSectionsCollapsed'
  | 'scheduledTaskFoldersCollapsed'
  | 'composerPrefill'
>

/**
 * UI slice 的默认初始数据（不含持久化、不含动作）。
 * 作为 store 初始值与此处 reset 用的唯一来源，避免测试里手写一份易漂移的平行副本。
 */
export function createDefaultUISliceData(): UISliceData {
  return {
    isSidebarOpen: true,
    isRightPanelOpen: false,
    sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
    mcpTools: defaultTools,
    rightPanelTabs: [],
    activeRightPanelTab: null,
    settingsActiveSection: null,
    isDefaultModelDialogOpen: false,
    isSettingsDialogOpen: false,
    selectedArtifactId: null,
    sidebarSectionsCollapsed: { pinned: false, regular: false, scheduled: false },
    scheduledTaskFoldersCollapsed: {},
    composerPrefill: null,
  }
}

export const createUISlice: StateCreator<UISlice, [], [], UISlice> = set => {
  const defaults = createDefaultUISliceData()

  /** 幂等追加面板 tab（元信息查 PANEL_TAB_META），返回需要合并的 partial。 */
  const withPanelTab = (state: UISlice, tabId: PanelTabId): Partial<UISlice> => {
    if (state.rightPanelTabs.some(t => t.id === tabId)) return {}
    const meta = PANEL_TAB_META[tabId]
    // name 只是兜底：渲染层会按 meta.i18nKey 翻译，这里存 id 即可。
    const tab: Tab = { id: tabId, name: tabId, icon: meta.icon, color: meta.color }
    return { rightPanelTabs: [...state.rightPanelTabs, tab] }
  }

  return {
    ...defaults,

    toggleSidebar: () => set(state => ({ isSidebarOpen: !state.isSidebarOpen })),
    toggleRightPanel: () => set(state => ({ isRightPanelOpen: !state.isRightPanelOpen })),
    // 挂载后应用持久化值：首帧保持默认，避免 SSR/水合不一致。
    hydrateSidebarUI: () => {
      const persisted = loadSidebarUI()
      if (!persisted) return
      set(state => ({
        sidebarWidth: clampSidebarWidth(persisted.width ?? state.sidebarWidth),
        sidebarSectionsCollapsed: persisted.sections,
        scheduledTaskFoldersCollapsed: persisted.folders,
      }))
    },
    // 每次调用都会同步落盘，因此只在「提交点」调用（拖拽结束 / 键盘调整），
    // 拖拽过程中的实时宽度由组件本地持有，不要逐帧写入。
    setSidebarWidth: width => {
      set(state => {
        const next = clampSidebarWidth(width)
        if (next === state.sidebarWidth) return state
        saveSidebarUI({
          sections: state.sidebarSectionsCollapsed,
          folders: state.scheduledTaskFoldersCollapsed,
          width: next,
        })
        return { sidebarWidth: next }
      })
    },
    toggleTool: toolId => {
      set(state => ({
        mcpTools: state.mcpTools.map(t => (t.id === toolId ? { ...t, enabled: !t.enabled } : t)),
      }))
    },
    addRightPanelTab: tab => {
      set(state => {
        const existingTab = state.rightPanelTabs.find(t => t.id === tab.id)
        if (existingTab) return state
        return { rightPanelTabs: [...state.rightPanelTabs, tab] }
      })
    },
    removeRightPanelTab: tabId => {
      set(state => {
        const updatedTabs = state.rightPanelTabs.filter(tab => tab.id !== tabId)
        let newActiveTab = state.activeRightPanelTab
        if (newActiveTab === tabId) {
          newActiveTab = updatedTabs.length > 0 ? updatedTabs[0].id : null
        }
        return {
          rightPanelTabs: updatedTabs,
          activeRightPanelTab: newActiveTab,
        }
      })
    },
    setActiveRightPanelTab: tabId => set({ activeRightPanelTab: tabId }),
    setSettingsActiveSection: section => set({ settingsActiveSection: section }),
    openArtifactPanel: artifact => {
      set(state => ({
        ...withPanelTab(state, 'artifacts'),
        activeRightPanelTab: 'artifacts',
        isRightPanelOpen: true,
        selectedArtifactId: artifact.id,
      }))
    },
    setSelectedArtifactId: id => set({ selectedArtifactId: id }),
    openPanelTab: tabId => {
      set(state => ({
        ...withPanelTab(state, tabId),
        activeRightPanelTab: tabId,
        isRightPanelOpen: true,
      }))
    },
    openSettingsDialog: section => {
      set({ isSettingsDialogOpen: true, settingsActiveSection: section ?? 'general' })
    },
    closeSettingsDialog: () => set({ isSettingsDialogOpen: false }),
    openDefaultModelDialog: () => set({ isDefaultModelDialogOpen: true }),
    closeDefaultModelDialog: () => set({ isDefaultModelDialogOpen: false }),
    toggleSidebarSection: key => {
      set(state => {
        const next = {
          ...state.sidebarSectionsCollapsed,
          [key]: !state.sidebarSectionsCollapsed[key],
        }
        saveSidebarUI({
          sections: next,
          folders: state.scheduledTaskFoldersCollapsed,
          width: state.sidebarWidth,
        })
        return { sidebarSectionsCollapsed: next }
      })
    },
    toggleScheduledTaskFolder: taskId => {
      set(state => {
        const next = {
          ...state.scheduledTaskFoldersCollapsed,
          [taskId]: !state.scheduledTaskFoldersCollapsed[taskId],
        }
        saveSidebarUI({
          sections: state.sidebarSectionsCollapsed,
          folders: next,
          width: state.sidebarWidth,
        })
        return { scheduledTaskFoldersCollapsed: next }
      })
    },
    prefillComposer: text => set({ composerPrefill: text }),
    consumeComposerPrefill: () => set({ composerPrefill: null }),

    clearScheduledTaskFolderCollapsed: taskId => {
      set(state => {
        if (!(taskId in state.scheduledTaskFoldersCollapsed)) return state
        const next = { ...state.scheduledTaskFoldersCollapsed }
        delete next[taskId]
        saveSidebarUI({
          sections: state.sidebarSectionsCollapsed,
          folders: next,
          width: state.sidebarWidth,
        })
        return { scheduledTaskFoldersCollapsed: next }
      })
    },
  }
}
