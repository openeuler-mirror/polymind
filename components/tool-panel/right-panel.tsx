'use client'

import { useState } from 'react'
import { X, Code, FileText, Terminal, Globe, GitBranch, Figma, Bot, Settings, LayoutGrid, ChevronRight, ChevronLeft, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'
import { SettingsPage } from '@/components/settings'

export function RightPanel() {
  const { isRightPanelOpen, toggleRightPanel } = useChatStore()
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [tabs, setTabs] = useState<Array<{ id: string; name: string }>>([])

  if (!isRightPanelOpen) {
    return null
  }

  const tools = [
    { id: 'editor', name: '编辑器', icon: Code, color: 'text-green-500' },
    { id: 'document', name: '文档', icon: FileText, color: 'text-blue-500' },
    { id: 'terminal', name: '终端', icon: Terminal, color: 'text-yellow-500' },
    { id: 'browser', name: '浏览器', icon: Globe, color: 'text-red-500' },
    { id: 'code-change', name: '代码变更', icon: GitBranch, color: 'text-purple-500' },
    { id: 'figma', name: 'Figma', icon: Figma, color: 'text-pink-500' },
    { id: 'agent', name: '智能体', icon: Bot, color: 'text-cyan-500' },
    { id: 'mcp', name: 'MCP', icon: Terminal, color: 'text-orange-500' },
    { id: 'settings', name: '设置', icon: Settings, color: 'text-gray-500' },
  ]

  const handleToolClick = (tool: { id: string; name: string }) => {
    const existingTab = tabs.find(tab => tab.id === tool.id)
    if (!existingTab) {
      setTabs([...tabs, { id: tool.id, name: tool.name }])
    }
    setActiveTab(tool.id)
  }

  const handleCloseTab = (tabId: string) => {
    const updatedTabs = tabs.filter(tab => tab.id !== tabId)
    setTabs(updatedTabs)
    if (activeTab === tabId) {
      setActiveTab(updatedTabs.length > 0 ? updatedTabs[0].id : null)
    }
  }

  return (
    <div className="flex h-full flex-col border-l border-border bg-sidebar">
      {/* Header */}
      

      {/* Tabs */}
      <div className="border-b border-sidebar-border px-4 py-2 flex items-center gap-2 overflow-x-auto">
        <div className="flex items-center gap-2">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={cn(
                "flex items-center gap-2 px-3 py-1 rounded-md text-sm whitespace-nowrap cursor-pointer",
                activeTab === tab.id ? "bg-accent" : "hover:bg-accent/50"
              )}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.name}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseTab(tab.id);
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {tools.filter(tool => !tabs.some(tab => tab.id === tool.id)).map((tool) => (
                <DropdownMenuItem key={tool.id} onClick={() => handleToolClick(tool)}>
                  <tool.icon className={`h-4 w-4 ${tool.color} mr-2`} />
                  {tool.name}
                </DropdownMenuItem>
              ))}
              {tools.filter(tool => !tabs.some(tab => tab.id === tool.id)).length === 0 && (
                <div className="px-4 py-2 text-sm text-muted-foreground">
                  所有工具已打开
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Content */}
      {activeTab ? (
        <div className="flex-1">
          {activeTab === 'settings' ? (
            <SettingsPage />
          ) : (
            <div className="p-4">
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">
                    这里是 {tabs.find(tab => tab.id === activeTab)?.name} 页面
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
              {tools.map((tool) => (
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
      className={cn(
        "transition-colors",
        "hover:bg-accent"
      )}
    >
      {isRightPanelOpen ? (
        <ChevronRight className="h-5 w-5" />
      ) : (
        <LayoutGrid className="h-5 w-5" />
      )}
      <span className="sr-only">切换工具面板</span>
    </Button>
  )
}