'use client'

import { useState, useEffect } from 'react'
import { X, Code, FileText, Terminal, Globe, GitBranch, Figma, Bot, Settings, LayoutGrid, ChevronRight, ChevronLeft, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'
import { SettingsPage } from '@/components/settings'
import { AgentPage } from './agent-page'

export function RightPanel() {
  const { isRightPanelOpen, toggleRightPanel, rightPanelTabs, activeRightPanelTab, addRightPanelTab, removeRightPanelTab, setActiveRightPanelTab } = useChatStore()

  if (!isRightPanelOpen) {
    return null
  }

  const tools = [
    { id: 'editor', name: '编辑器', icon: Code, color: 'text-green-500' },
    { id: 'terminal', name: '终端', icon: Terminal, color: 'text-yellow-500' },
    { id: 'browser', name: '浏览器', icon: Globe, color: 'text-red-500' },
    { id: 'code-change', name: '代码变更', icon: GitBranch, color: 'text-purple-500' },
    { id: 'agent', name: '智能体', icon: Bot, color: 'text-cyan-500' },
    { id: 'mcp', name: 'MCP', icon: Terminal, color: 'text-orange-500' },
  ]

  const handleToolClick = (tool: { id: string; name: string; icon: React.ElementType; color: string }) => {
    const existingTab = rightPanelTabs.find(tab => tab.id === tool.id)
    if (!existingTab) {
      addRightPanelTab({ id: tool.id, name: tool.name, icon: tool.icon, color: tool.color })
    }
    setActiveRightPanelTab(tool.id)
  }

  // 保存设置前的活跃标签页
  const [previousActiveTab, setPreviousActiveTab] = useState<string | null>(null);

  // 监听活跃标签页变化，当打开设置时保存当前标签页
  useEffect(() => {
    // 当标签页列表变化时，检查是否有设置标签页
    const hasSettingsTab = rightPanelTabs.some(tab => tab.id === 'settings');
    if (hasSettingsTab && activeRightPanelTab === 'settings') {
      // 找到除了设置之外的所有标签页
      const otherTabs = rightPanelTabs.filter(tab => tab.id !== 'settings');
      if (otherTabs.length > 0) {
        // 保存之前的活跃标签页
        setPreviousActiveTab(otherTabs[otherTabs.length - 1].id);
      }
    }
  }, [activeRightPanelTab, rightPanelTabs]);

  const handleCloseTab = (tabId: string) => {
    if (tabId === 'settings') {
      if (previousActiveTab) {
        // 当关闭设置标签页时，恢复到之前的活跃标签页
        setActiveRightPanelTab(previousActiveTab);
        setPreviousActiveTab(null);
      } else {
        // 当关闭设置标签页且之前没有其他标签页时，关闭右侧面板
        toggleRightPanel();
      }
    }
    removeRightPanelTab(tabId)
  }

  return (
    <div className="flex h-full flex-col border-l border-border bg-sidebar">
      {/* Header */}
      

      {/* Tabs */}
      <div className="border-b border-sidebar-border px-4 py-2 flex items-center gap-2 overflow-x-auto">
        <div className="flex items-center gap-2">
          {rightPanelTabs.map((tab) => {
            const tool = tools.find(t => t.id === tab.id);
            const Icon = tool?.icon || (() => null);
            const color = tool?.color || '';
            return (
              <div
                key={tab.id}
                className={cn(
                  "flex items-center gap-2 px-3 py-1 rounded-md text-sm whitespace-nowrap cursor-pointer",
                  activeRightPanelTab === tab.id ? "bg-accent" : "hover:bg-accent/50"
                )}
                onClick={() => setActiveRightPanelTab(tab.id)}
              >
                <Icon className={`h-4 w-4 ${color}`} />
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
            );
          })}          
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
              {tools.filter(tool => !rightPanelTabs.some(tab => tab.id === tool.id)).map((tool) => (
                <DropdownMenuItem key={tool.id} onClick={() => handleToolClick(tool)}>
                  <tool.icon className={`h-4 w-4 ${tool.color} mr-2`} />
                  {tool.name}
                </DropdownMenuItem>
              ))}
              {tools.filter(tool => !rightPanelTabs.some(tab => tab.id === tool.id)).length === 0 && (
                <div className="px-4 py-2 text-sm text-muted-foreground">
                  所有工具已打开
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Content */}
      {activeRightPanelTab ? (
        <div className="flex-1">
          {activeRightPanelTab === 'settings' ? (
            <SettingsPage />
          ) : activeRightPanelTab === 'agent' ? (
            <AgentPage />
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