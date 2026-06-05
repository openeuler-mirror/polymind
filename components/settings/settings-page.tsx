'use client'

import { useState, useEffect } from 'react'
import { User, Settings, Bot, Wrench, Sparkles, Cpu, Info } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'
import { useThemeWithStore } from '@/components/theme-provider'
import { SkillsPage } from './skill'
import { ModelPage } from './model/model-page'
import { McpPage } from './mcp/mcp-page'

export function SettingsPage() {
  const { settings, updateSettings, settingsActiveSection, setSettingsActiveSection } =
    useChatStore()
  const { setTheme } = useThemeWithStore()

  const [localActiveSection, setLocalActiveSection] = useState(settingsActiveSection || 'general')

  useEffect(() => {
    if (settingsActiveSection) {
      setLocalActiveSection(settingsActiveSection)
      setSettingsActiveSection(null)
    }
  }, [settingsActiveSection, setSettingsActiveSection])

  const activeSection = localActiveSection

  const sections = [
    { id: 'account', name: '账号', icon: User },
    { id: 'general', name: '通用', icon: Settings },
    { id: 'model', name: '模型', icon: Cpu },
    { id: 'agent', name: '智能体', icon: Bot },
    { id: 'rules', name: 'Skill', icon: Sparkles },
    { id: 'mcp', name: 'MCP', icon: Wrench },
    { id: 'about', name: '关于', icon: Info },
  ]

  return (
    <div className="flex h-full min-h-0 bg-background">
      {/* Sidebar */}
      <div className="w-48 border-r border-border bg-sidebar p-4">
        <nav className="space-y-1">
          {sections.map(section => (
            <button
              key={section.id}
              onClick={() => setLocalActiveSection(section.id)}
              className={cn(
                'flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md transition-colors',
                activeSection === section.id
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'hover:bg-sidebar-accent/50'
              )}
            >
              <section.icon className="h-4 w-4" />
              <span>{section.name}</span>
              {activeSection === section.id && (
                <div className="ml-auto w-1.5 h-5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0 flex-col">
        {/* Header */}

        {/* Content */}
        <ScrollArea className="min-h-0 flex-1 p-6">
          {activeSection === 'general' && (
            <div className="space-y-8">
              <div>
                <h2 className="text-sm font-medium mb-4">基础设置</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="theme">主题</Label>
                      <p className="text-xs text-muted-foreground">选择主题</p>
                    </div>
                    <Select
                      value={settings.theme}
                      onValueChange={value => setTheme(value as 'light' | 'dark' | 'system')}
                    >
                      <SelectTrigger id="theme" className="w-40">
                        <SelectValue placeholder="选择主题" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">浅色</SelectItem>
                        <SelectItem value="dark">暗色</SelectItem>
                        <SelectItem value="system">跟随系统</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="language">语言</Label>
                      <p className="text-xs text-muted-foreground">
                        选择您喜欢的按钮标签和应用内其他文本的语言
                      </p>
                    </div>
                    <Select
                      value={settings.language}
                      onValueChange={value =>
                        updateSettings({ language: value as 'zh-CN' | 'en-US' })
                      }
                    >
                      <SelectTrigger id="language" className="w-40">
                        <SelectValue placeholder="选择语言" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="zh-CN">简体中文</SelectItem>
                        <SelectItem value="en-US">English (US)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'model' && <ModelPage />}

          {activeSection === 'rules' && <SkillsPage />}

          {activeSection === 'mcp' && <McpPage />}

          {activeSection !== 'general' &&
            activeSection !== 'model' &&
            activeSection !== 'rules' &&
            activeSection !== 'mcp' && (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">
                  {sections.find(s => s.id === activeSection)?.name} 页面内容
                </p>
              </div>
            )}
        </ScrollArea>
      </div>
    </div>
  )
}
