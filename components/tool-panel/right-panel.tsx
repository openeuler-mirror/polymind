'use client'

import {
  X,
  Bot,
  Settings,
  LayoutGrid,
  ChevronRight,
  Plus,
  Bug,
  Wrench,
  Sparkles,
  Cpu,
  Activity,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'
import { SettingsPage } from '@/components/settings'
import { AgentPage } from './agent-page'
import { CvePage } from './cve-page'
import { BackportPage } from './backport-page'
import { InsightPage } from './insight-page'

export function RightPanel() {
  const {
    isRightPanelOpen,
    toggleRightPanel,
    rightPanelTabs,
    activeRightPanelTab,
    addRightPanelTab,
    removeRightPanelTab,
    setActiveRightPanelTab,
    setSettingsActiveSection,
  } = useChatStore()

  const tools = [
    { id: 'agent', name: '智能体', icon: Bot, color: 'text-cyan-500' },
    { id: 'insight', name: '监测系统', icon: Activity, color: 'text-emerald-500' },
    { id: 'cve', name: 'CVE', icon: Bug, color: 'text-rose-500' },
    { id: 'backport', name: 'Backport', icon: Wrench, color: 'text-blue-500' },
    {
      id: 'settings',
      name: '设置',
      icon: Settings,
      color: 'text-gray-500',
      settingsSection: 'general',
    },
    {
      id: 'skills',
      name: '技能',
      icon: Sparkles,
      color: 'text-amber-500',
      settingsSection: 'rules',
    },
    { id: 'model', name: '模型', icon: Cpu, color: 'text-indigo-500', settingsSection: 'model' },
  ]

  const handleToolClick = (tool: {
    id: string
    name: string
    icon: React.ElementType
    color: string
    settingsSection?: string
  }) => {
    if (tool.settingsSection) {
      setSettingsActiveSection(tool.settingsSection)
      const existingTab = rightPanelTabs.find(tab => tab.id === 'settings')
      if (!existingTab) {
        addRightPanelTab({ id: 'settings', name: '设置', icon: Settings, color: 'text-gray-500' })
      }
      setActiveRightPanelTab('settings')
    } else {
      const existingTab = rightPanelTabs.find(tab => tab.id === tool.id)
      if (!existingTab) {
        addRightPanelTab({ id: tool.id, name: tool.name, icon: tool.icon, color: tool.color })
      }
      setActiveRightPanelTab(tool.id)
    }
  }

  if (!isRightPanelOpen) {
    return null
  }

  const handleCloseTab = (tabId: string) => {
    if (tabId === 'settings') {
      const previousActiveTab = rightPanelTabs.filter(tab => tab.id !== 'settings').at(-1)?.id

      if (previousActiveTab) {
        setActiveRightPanelTab(previousActiveTab)
      } else {
        toggleRightPanel()
      }
    }
    removeRightPanelTab(tabId)
  }

  return (
    <div className="flex h-full flex-col border-l border-border bg-sidebar">
      {/* Header */}

      {/* Tabs */}
      <div className="border-b border-sidebar-border px-4 py-2 flex items-center gap-2 overflow-x-auto flex-shrink-0 min-h-[44px]">
        <div className="flex items-center gap-2">
          {rightPanelTabs.map(tab => {
            const tool = tools.find(t => t.id === tab.id)
            const Icon = tool?.icon || (() => null)
            const color = tool?.color || ''
            return (
              <div
                key={tab.id}
                className={cn(
                  'flex items-center gap-2 px-3 py-1 rounded-md text-sm whitespace-nowrap cursor-pointer',
                  activeRightPanelTab === tab.id ? 'bg-accent' : 'hover:bg-accent/50'
                )}
                onClick={() => setActiveRightPanelTab(tab.id)}
              >
                <Icon className={`h-4 w-4 ${color}`} />
                <span>{tab.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={e => {
                    e.stopPropagation()
                    handleCloseTab(tab.id)
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )
          })}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Plus className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {tools
                .filter(tool => !rightPanelTabs.some(tab => tab.id === tool.id))
                .map(tool => (
                  <DropdownMenuItem key={tool.id} onClick={() => handleToolClick(tool)}>
                    <tool.icon className={`h-4 w-4 ${tool.color} mr-2`} />
                    {tool.name}
                  </DropdownMenuItem>
                ))}
              {tools.filter(tool => !rightPanelTabs.some(tab => tab.id === tool.id)).length ===
                0 && <div className="px-4 py-2 text-sm text-muted-foreground">所有工具已打开</div>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Content */}
      {activeRightPanelTab ? (
        <div className="flex-1 h-full min-h-0">
          {activeRightPanelTab === 'settings' ? (
            <SettingsPage />
          ) : activeRightPanelTab === 'agent' ? (
            <AgentPage />
          ) : activeRightPanelTab === 'insight' ? (
            <InsightPage />
          ) : activeRightPanelTab === 'cve' ? (
            <CvePage />
          ) : activeRightPanelTab === 'backport' ? (
            <BackportPage />
          ) : (
            <div className="p-4">
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">
                    这里是 {rightPanelTabs.find(tab => tab.id === activeRightPanelTab)?.name} 页面
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-xs">
            <div className="text-center mb-8">
              <p className="text-sm text-muted-foreground">使用工具，扩展更多能力</p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {tools.map(tool => (
                <Button
                  key={tool.id}
                  variant="outline"
                  className="flex flex-col items-center justify-center gap-2 p-4 h-24 w-full"
                  onClick={() => handleToolClick(tool)}
                >
                  <tool.icon className={`h-6 w-6 ${tool.color}`} />
                  <span className="text-xs">{tool.name}</span>
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function RightPanelToggle() {
  const { isRightPanelOpen, toggleRightPanel } = useChatStore()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleRightPanel}
      className={cn('transition-colors', 'hover:bg-accent')}
    >
      {isRightPanelOpen ? <ChevronRight className="h-5 w-5" /> : <LayoutGrid className="h-5 w-5" />}
      <span className="sr-only">切换工具面板</span>
    </Button>
  )
}
