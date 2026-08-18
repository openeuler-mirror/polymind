import type { StateCreator } from 'zustand'
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
  toggleSidebarSection: (key: SidebarSectionKey) => void
  toggleScheduledTaskFolder: (taskId: string) => void
  /** 任务删除后清理其文件夹折叠状态，避免 localStorage 残留死键。 */
  clearScheduledTaskFolderCollapsed: (taskId: string) => void
}

export const createUISlice: StateCreator<UISlice, [], [], UISlice> = set => {
  const persisted = loadSidebarUI()
  return {
    isSidebarOpen: true,
    isRightPanelOpen: false,
    mcpTools: defaultTools,
    rightPanelTabs: [],
    activeRightPanelTab: null,
    settingsActiveSection: null,
    sidebarSectionsCollapsed: persisted?.sections ?? {
      pinned: false,
      regular: false,
      scheduled: false,
    },
    scheduledTaskFoldersCollapsed: persisted?.folders ?? {},

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
