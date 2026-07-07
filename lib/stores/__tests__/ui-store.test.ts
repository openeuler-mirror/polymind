import { create } from 'zustand'
import { createUISlice, type UISlice } from '../ui-store'

const useTestStore = create<UISlice>()((...a) => ({
  ...createUISlice(...a),
}))

describe('UISlice', () => {
  beforeEach(() => {
    useTestStore.setState({
      isSidebarOpen: true,
      isRightPanelOpen: false,
      mcpTools: [
        { id: 'web-search', name: '网络搜索', description: '', category: 'search', enabled: true },
        { id: 'code-exec', name: '代码执行', description: '', category: 'code', enabled: true },
      ],
      rightPanelTabs: [],
      activeRightPanelTab: null,
      settingsActiveSection: null,
    })
  })

  describe('Sidebar', () => {
    it('should toggle sidebar from open to closed', () => {
      useTestStore.getState().toggleSidebar()
      expect(useTestStore.getState().isSidebarOpen).toBe(false)
    })

    it('should toggle sidebar from closed to open', () => {
      useTestStore.setState({ isSidebarOpen: false })
      useTestStore.getState().toggleSidebar()
      expect(useTestStore.getState().isSidebarOpen).toBe(true)
    })
  })

  describe('Right panel', () => {
    it('should toggle right panel from closed to open', () => {
      useTestStore.getState().toggleRightPanel()
      expect(useTestStore.getState().isRightPanelOpen).toBe(true)
    })

    it('should toggle right panel from open to closed', () => {
      useTestStore.setState({ isRightPanelOpen: true })
      useTestStore.getState().toggleRightPanel()
      expect(useTestStore.getState().isRightPanelOpen).toBe(false)
    })
  })

  describe('MCP Tools', () => {
    it('should toggle a tool from enabled to disabled', () => {
      useTestStore.getState().toggleTool('web-search')
      const tool = useTestStore.getState().mcpTools.find(t => t.id === 'web-search')
      expect(tool?.enabled).toBe(false)
    })

    it('should toggle a tool from disabled to enabled', () => {
      useTestStore.getState().toggleTool('web-search') // disable
      useTestStore.getState().toggleTool('web-search') // enable
      const tool = useTestStore.getState().mcpTools.find(t => t.id === 'web-search')
      expect(tool?.enabled).toBe(true)
    })

    it('should not affect other tools when toggling one', () => {
      useTestStore.getState().toggleTool('web-search')
      const codeTool = useTestStore.getState().mcpTools.find(t => t.id === 'code-exec')
      expect(codeTool?.enabled).toBe(true) // unchanged
    })
  })

  describe('Right panel tabs', () => {
    it('should add a right panel tab', () => {
      const tab = { id: 'test-tab', name: 'Test Tab' }
      useTestStore.getState().addRightPanelTab(tab)
      const state = useTestStore.getState()
      expect(state.rightPanelTabs.length).toBe(1)
      expect(state.rightPanelTabs[0].id).toBe('test-tab')
    })

    it('should not add duplicate right panel tab', () => {
      const tab = { id: 'test-tab', name: 'Test Tab' }
      useTestStore.getState().addRightPanelTab(tab)
      useTestStore.getState().addRightPanelTab(tab)
      expect(useTestStore.getState().rightPanelTabs.length).toBe(1)
    })

    it('should remove a right panel tab', () => {
      const tab = { id: 'test-tab', name: 'Test Tab' }
      useTestStore.getState().addRightPanelTab(tab)
      useTestStore.getState().removeRightPanelTab('test-tab')
      expect(useTestStore.getState().rightPanelTabs.length).toBe(0)
    })

    it('should clear active tab when removing the active tab', () => {
      const tab = { id: 'tab-1', name: 'Tab 1' }
      useTestStore.getState().addRightPanelTab(tab)
      useTestStore.getState().setActiveRightPanelTab('tab-1')
      useTestStore.getState().removeRightPanelTab('tab-1')
      expect(useTestStore.getState().activeRightPanelTab).toBeNull()
    })

    it('should switch to next tab when removing active tab with other tabs present', () => {
      useTestStore.getState().addRightPanelTab({ id: 'tab-1', name: 'Tab 1' })
      useTestStore.getState().addRightPanelTab({ id: 'tab-2', name: 'Tab 2' })
      useTestStore.getState().setActiveRightPanelTab('tab-1')
      useTestStore.getState().removeRightPanelTab('tab-1')
      expect(useTestStore.getState().activeRightPanelTab).toBe('tab-2')
    })

    it('should set active right panel tab', () => {
      useTestStore.getState().addRightPanelTab({ id: 'tab-1', name: 'Tab 1' })
      useTestStore.getState().setActiveRightPanelTab('tab-1')
      expect(useTestStore.getState().activeRightPanelTab).toBe('tab-1')
    })

    it('should set active right panel tab to null', () => {
      useTestStore.getState().addRightPanelTab({ id: 'tab-1', name: 'Tab 1' })
      useTestStore.getState().setActiveRightPanelTab('tab-1')
      useTestStore.getState().setActiveRightPanelTab(null)
      expect(useTestStore.getState().activeRightPanelTab).toBeNull()
    })
  })

  describe('Settings active section', () => {
    it('should set settings active section', () => {
      useTestStore.getState().setSettingsActiveSection('general')
      expect(useTestStore.getState().settingsActiveSection).toBe('general')
    })

    it('should clear settings active section', () => {
      useTestStore.getState().setSettingsActiveSection('general')
      useTestStore.getState().setSettingsActiveSection(null)
      expect(useTestStore.getState().settingsActiveSection).toBeNull()
    })
  })
})
