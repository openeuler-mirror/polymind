import { create } from 'zustand'
import {
  createUISlice,
  createDefaultUISliceData,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  type UISlice,
} from '../ui-store'

const useTestStore = create<UISlice>()((...a) => ({
  ...createUISlice(...a),
}))

describe('UISlice', () => {
  beforeEach(() => {
    // 用 store 的默认初始数据重置，新增字段自动同步，避免手写平行副本漂移。
    useTestStore.setState({
      ...createDefaultUISliceData(),
      mcpTools: [
        { id: 'web-search', name: '网络搜索', description: '', category: 'search', enabled: true },
        { id: 'code-exec', name: '代码执行', description: '', category: 'code', enabled: true },
      ],
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

  describe('Sidebar width', () => {
    it('should default to the original w-72 width', () => {
      expect(useTestStore.getState().sidebarWidth).toBe(SIDEBAR_DEFAULT_WIDTH)
    })

    it('should accept a width within range', () => {
      useTestStore.getState().setSidebarWidth(320)
      expect(useTestStore.getState().sidebarWidth).toBe(320)
    })

    it('should clamp widths below the minimum', () => {
      useTestStore.getState().setSidebarWidth(SIDEBAR_MIN_WIDTH - 100)
      expect(useTestStore.getState().sidebarWidth).toBe(SIDEBAR_MIN_WIDTH)
    })

    it('should clamp widths above the maximum', () => {
      useTestStore.getState().setSidebarWidth(SIDEBAR_MAX_WIDTH + 100)
      expect(useTestStore.getState().sidebarWidth).toBe(SIDEBAR_MAX_WIDTH)
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

  describe('Settings dialog', () => {
    it('should default to closed', () => {
      expect(useTestStore.getState().isSettingsDialogOpen).toBe(false)
    })

    it('should open settings dialog and default to general section', () => {
      useTestStore.getState().openSettingsDialog()
      const state = useTestStore.getState()
      expect(state.isSettingsDialogOpen).toBe(true)
      expect(state.settingsActiveSection).toBe('general')
    })

    it('should open settings dialog at the given section', () => {
      useTestStore.getState().openSettingsDialog('model')
      const state = useTestStore.getState()
      expect(state.isSettingsDialogOpen).toBe(true)
      expect(state.settingsActiveSection).toBe('model')
    })

    it('should close settings dialog', () => {
      useTestStore.getState().openSettingsDialog()
      useTestStore.getState().closeSettingsDialog()
      expect(useTestStore.getState().isSettingsDialogOpen).toBe(false)
    })

    it('should not touch the right panel when opening settings', () => {
      useTestStore.getState().openSettingsDialog('model')
      const state = useTestStore.getState()
      expect(state.rightPanelTabs.some(tab => tab.id === 'settings')).toBe(false)
      expect(state.isRightPanelOpen).toBe(false)
    })
  })

  describe('Panel tab registry', () => {
    it('should open a registered tab with meta applied', () => {
      useTestStore.getState().openPanelTab('skills')
      const state = useTestStore.getState()
      expect(state.activeRightPanelTab).toBe('skills')
      expect(state.isRightPanelOpen).toBe(true)
      const tab = state.rightPanelTabs.find(t => t.id === 'skills')
      expect(tab).toBeTruthy()
      expect(tab?.icon).toBeTruthy()
      expect(tab?.color).toBeTruthy()
    })

    it('should be idempotent when opening the same tab twice', () => {
      useTestStore.getState().openPanelTab('mcp')
      useTestStore.getState().openPanelTab('mcp')
      expect(useTestStore.getState().rightPanelTabs.filter(t => t.id === 'mcp').length).toBe(1)
    })

    it('should switch active tab when opening another tab', () => {
      useTestStore.getState().openPanelTab('agent')
      useTestStore.getState().openPanelTab('mcp')
      const state = useTestStore.getState()
      expect(state.activeRightPanelTab).toBe('mcp')
      expect(state.rightPanelTabs.length).toBe(2)
    })

    it('should open artifact panel and select the artifact', () => {
      useTestStore.getState().openArtifactPanel({ id: 'a-1' })
      const state = useTestStore.getState()
      expect(state.activeRightPanelTab).toBe('artifacts')
      expect(state.isRightPanelOpen).toBe(true)
      expect(state.selectedArtifactId).toBe('a-1')
      expect(state.rightPanelTabs.some(t => t.id === 'artifacts')).toBe(true)
    })
  })

  describe('Default model dialog', () => {
    it('should default to closed', () => {
      expect(useTestStore.getState().isDefaultModelDialogOpen).toBe(false)
    })

    it('should open default model dialog', () => {
      useTestStore.getState().openDefaultModelDialog()
      expect(useTestStore.getState().isDefaultModelDialogOpen).toBe(true)
    })

    it('should close default model dialog', () => {
      useTestStore.getState().openDefaultModelDialog()
      useTestStore.getState().closeDefaultModelDialog()
      expect(useTestStore.getState().isDefaultModelDialogOpen).toBe(false)
    })
  })

  describe('Composer prefill', () => {
    it('should default to no pending text', () => {
      expect(useTestStore.getState().composerPrefill).toBeNull()
    })

    it('should keep the text until the composer consumes it', () => {
      useTestStore.getState().prefillComposer('帮我做一次系统巡检')
      expect(useTestStore.getState().composerPrefill).toBe('帮我做一次系统巡检')
    })

    it('should clear the text once consumed, so it only applies once', () => {
      useTestStore.getState().prefillComposer('帮我做一次系统巡检')
      useTestStore.getState().consumeComposerPrefill()
      expect(useTestStore.getState().composerPrefill).toBeNull()
    })

    it('should accept a later text after the previous one was consumed', () => {
      useTestStore.getState().prefillComposer('第一条')
      useTestStore.getState().consumeComposerPrefill()
      useTestStore.getState().prefillComposer('第二条')
      expect(useTestStore.getState().composerPrefill).toBe('第二条')
    })
  })

  describe('Sidebar sections', () => {
    it('should toggle a section collapse state', () => {
      useTestStore.getState().toggleSidebarSection('scheduled')
      expect(useTestStore.getState().sidebarSectionsCollapsed.scheduled).toBe(true)

      useTestStore.getState().toggleSidebarSection('scheduled')
      expect(useTestStore.getState().sidebarSectionsCollapsed.scheduled).toBe(false)
    })

    it('should toggle a scheduled task folder collapse state', () => {
      useTestStore.getState().toggleScheduledTaskFolder('task-1')
      expect(useTestStore.getState().scheduledTaskFoldersCollapsed['task-1']).toBe(true)

      useTestStore.getState().toggleScheduledTaskFolder('task-1')
      expect(useTestStore.getState().scheduledTaskFoldersCollapsed['task-1']).toBe(false)
    })
  })
})
