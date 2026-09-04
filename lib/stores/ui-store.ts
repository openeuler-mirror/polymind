import type { StateCreator } from 'zustand'
import { Package, Settings } from 'lucide-react'
import type { MCPTool } from '../types'
import type { Tab } from './utils'
import { defaultTools } from './utils'

export type SidebarSectionKey = 'pinned' | 'regular' | 'scheduled'

interface SidebarUIPersist {
  sections: Record<SidebarSectionKey, boolean>
  folders: Record<string, boolean>
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
  mcpTools: MCPTool[]
  rightPanelTabs: Tab[]
  activeRightPanelTab: string | null
  settingsActiveSection: string | null
  sidebarSectionsCollapsed: Record<SidebarSectionKey, boolean>
  scheduledTaskFoldersCollapsed: Record<string, boolean>
  toggleSidebar: () => void
  toggleRightPanel: () => void
  toggleTool: (toolId: string) => void
  addRightPanelTab: (tab: Tab) => void
  removeRightPanelTab: (tabId: string) => void
  setActiveRightPanelTab: (tabId: string | null) => void
  setSettingsActiveSection: (section: string | null) => void
  /** 产物面板当前选中的产物 id（卡片点击 / 面板切换共用） */
  selectedArtifactId: string | null
  /** 打开右侧产物面板并选中指定产物（幂等：tab 存在则不重复添加） */
  openArtifactPanel: (artifact: { id: string }) => void
  setSelectedArtifactId: (id: string | null) => void
  /** 打开设置面板并定位到指定 section；设置 tab 不存在时自动创建。 */
  openSettingsPanel: (section?: string) => void
  isDefaultModelDialogOpen: boolean
  openDefaultModelDialog: () => void
  closeDefaultModelDialog: () => void
  toggleSidebarSection: (key: SidebarSectionKey) => void
  toggleScheduledTaskFolder: (taskId: string) => void
  /** 任务删除后清理其文件夹折叠状态，避免 localStorage 残留死键。 */
  clearScheduledTaskFolderCollapsed: (taskId: string) => void
}

type UISliceData = Pick<
  UISlice,
  | 'isSidebarOpen'
  | 'isRightPanelOpen'
  | 'mcpTools'
  | 'rightPanelTabs'
  | 'activeRightPanelTab'
  | 'settingsActiveSection'
  | 'isDefaultModelDialogOpen'
  | 'selectedArtifactId'
  | 'sidebarSectionsCollapsed'
  | 'scheduledTaskFoldersCollapsed'
>

/**
 * UI slice 的默认初始数据（不含持久化、不含动作）。
 * 作为 store 初始值与此处 reset 用的唯一来源，避免测试里手写一份易漂移的平行副本。
 */
export function createDefaultUISliceData(): UISliceData {
  return {
    isSidebarOpen: true,
    isRightPanelOpen: false,
    mcpTools: defaultTools,
    rightPanelTabs: [],
    activeRightPanelTab: null,
    settingsActiveSection: null,
    isDefaultModelDialogOpen: false,
    selectedArtifactId: null,
    sidebarSectionsCollapsed: { pinned: false, regular: false, scheduled: false },
    scheduledTaskFoldersCollapsed: {},
  }
}

export const createUISlice: StateCreator<UISlice, [], [], UISlice> = set => {
  const persisted = loadSidebarUI()
  const defaults = createDefaultUISliceData()
  return {
    ...defaults,
    sidebarSectionsCollapsed: persisted?.sections ?? defaults.sidebarSectionsCollapsed,
    scheduledTaskFoldersCollapsed: persisted?.folders ?? defaults.scheduledTaskFoldersCollapsed,

    toggleSidebar: () => set(state => ({ isSidebarOpen: !state.isSidebarOpen })),
    toggleRightPanel: () => set(state => ({ isRightPanelOpen: !state.isRightPanelOpen })),
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
      set(state => {
        const rightPanelTabs = state.rightPanelTabs.some(t => t.id === 'artifacts')
          ? state.rightPanelTabs
          : [
              ...state.rightPanelTabs,
              { id: 'artifacts', name: '产物', icon: Package, color: 'text-orange-500' },
            ]
        return {
          rightPanelTabs,
          activeRightPanelTab: 'artifacts',
          isRightPanelOpen: true,
          selectedArtifactId: artifact.id,
        }
      })
    },
    setSelectedArtifactId: id => set({ selectedArtifactId: id }),
    openSettingsPanel: section => {
      set(state => {
        const hasSettingsTab = state.rightPanelTabs.some(tab => tab.id === 'settings')
        return {
          settingsActiveSection: section ?? state.settingsActiveSection,
          rightPanelTabs: hasSettingsTab
            ? state.rightPanelTabs
            : [
                ...state.rightPanelTabs,
                { id: 'settings', name: '设置', icon: Settings, color: 'text-gray-500' },
              ],
          activeRightPanelTab: 'settings',
          isRightPanelOpen: true,
        }
      })
    },
    openDefaultModelDialog: () => set({ isDefaultModelDialogOpen: true }),
    closeDefaultModelDialog: () => set({ isDefaultModelDialogOpen: false }),
    toggleSidebarSection: key => {
      set(state => {
        const next = {
          ...state.sidebarSectionsCollapsed,
          [key]: !state.sidebarSectionsCollapsed[key],
        }
        saveSidebarUI({ sections: next, folders: state.scheduledTaskFoldersCollapsed })
        return { sidebarSectionsCollapsed: next }
      })
    },
    toggleScheduledTaskFolder: taskId => {
      set(state => {
        const next = {
          ...state.scheduledTaskFoldersCollapsed,
          [taskId]: !state.scheduledTaskFoldersCollapsed[taskId],
        }
        saveSidebarUI({ sections: state.sidebarSectionsCollapsed, folders: next })
        return { scheduledTaskFoldersCollapsed: next }
      })
    },
    clearScheduledTaskFolderCollapsed: taskId => {
      set(state => {
        if (!(taskId in state.scheduledTaskFoldersCollapsed)) return state
        const next = { ...state.scheduledTaskFoldersCollapsed }
        delete next[taskId]
        saveSidebarUI({ sections: state.sidebarSectionsCollapsed, folders: next })
        return { scheduledTaskFoldersCollapsed: next }
      })
    },
  }
}
