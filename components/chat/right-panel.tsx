'use client'

import { useState } from 'react'
import { X, Code, FileText, Terminal, Globe, GitBranch, Figma, Bot, Settings, LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'

export function RightPanel() {
  const { isRightPanelOpen, toggleRightPanel } = useChatStore()

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

  return (
    <div className="flex h-full flex-col border-l border-border bg-sidebar">
      

      {/* Tools Content */}
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
              >
                <tool.icon className={`h-6 w-6 ${tool.color}`} />
                <span className="text-xs">{tool.name}</span>
              </Button>
            ))}
          </div>
        </div>
      </div>
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
        isRightPanelOpen ? "bg-accent" : "hover:bg-accent"
      )}
    >
      <LayoutGrid className="h-5 w-5" />
      <span className="sr-only">切换工具面板</span>
    </Button>
  )
}