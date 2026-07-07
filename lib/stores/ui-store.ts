import type { StateCreator } from 'zustand'
import type { MCPTool } from '../types'
import type { Tab } from './utils'
import { defaultTools } from './utils'

export interface UISlice {
  isSidebarOpen: boolean
  isRightPanelOpen: boolean
  mcpTools: MCPTool[]
  rightPanelTabs: Tab[]
  activeRightPanelTab: string | null
  settingsActiveSection: string | null
  toggleSidebar: () => void
  toggleRightPanel: () => void
  toggleTool: (toolId: string) => void
  addRightPanelTab: (tab: Tab) => void
  removeRightPanelTab: (tabId: string) => void
  setActiveRightPanelTab: (tabId: string | null) => void
  setSettingsActiveSection: (section: string | null) => void
}

export const createUISlice: StateCreator<UISlice, [], [], UISlice> = set => ({
  isSidebarOpen: true,
  isRightPanelOpen: false,
  mcpTools: defaultTools,
  rightPanelTabs: [],
  activeRightPanelTab: null,
  settingsActiveSection: null,

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
})
