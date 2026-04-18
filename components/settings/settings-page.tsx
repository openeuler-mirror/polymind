'use client'

import { useState, useEffect } from 'react'
import { User, Settings, Bot, Wrench, Sparkles, Cpu, Info } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'
import { useThemeWithStore } from '@/components/theme-provider'
import { ModelServiceType, MODEL_SERVICES } from '@/lib/types'
import { SkillsPage } from './skill'

export function SettingsPage() {
  const [activeSection, setActiveSection] = useState('general')
  const { settings, updateSettings } = useChatStore()
  const { setTheme } = useThemeWithStore()
  
  // 模型配置状态
  const [modelConfig, setModelConfig] = useState({
    adapterType: settings.modelConfig?.adapterType || ModelServiceType.OPENAI,
    apiKey: settings.modelConfig?.apiKey || '',
    apiBaseUrl: settings.modelConfig?.apiBaseUrl || ''
  })

  // 当主题设置变化时，更新next-themes的主题
  useEffect(() => {
    // 不再在组件挂载时强制设置主题，避免类型错误
  }, []) // 只在组件挂载时执行一次，避免无限循环
  
  // 处理模型配置变化
  const handleModelConfigChange = (field: string, value: string) => {
    setModelConfig(prev => {
      const newConfig = { ...prev, [field]: value }
      // 如果切换模型类型，重置配置
      if (field === 'adapterType') {
        newConfig.apiKey = ''
        newConfig.apiBaseUrl = ''
      }
      // 保存到全局设置
      updateSettings({ modelConfig: newConfig })
      return newConfig
    })
  }

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
    <div className="flex h-full bg-background">
      {/* Sidebar */}
      <div className="w-48 border-r border-border bg-sidebar p-4">
        <nav className="space-y-1">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
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
      <div className="flex-1 flex flex-col">
        {/* Header */}
        

        {/* Content */}
        <ScrollArea className="flex-1 p-6">
          {activeSection === 'general' && (
            <div className="space-y-8">
              {/* 基础设置 */}
              <div>
                <h2 className="text-sm font-medium mb-4">基础设置</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="theme">主题</Label>
                      <p className="text-xs text-muted-foreground">选择主题</p>
                    </div>
                    <Select value={settings.theme} onValueChange={(value) => setTheme(value as 'light' | 'dark' | 'system')}>
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
                      <p className="text-xs text-muted-foreground">选择您喜欢的按钮标签和应用内其他文本的语言</p>
                    </div>
                    <Select value={settings.language} onValueChange={(value) => updateSettings({ language: value as 'zh-CN' | 'en-US' })}>
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

          {/* 其他部分的内容可以根据需要添加 */}
          {activeSection === 'model' && (
            <div className="space-y-8">
              {/* 模型配置 */}
              <div>
                <h2 className="text-sm font-medium mb-4">模型配置</h2>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="modelType">模型服务类型</Label>
                    <Select 
                      value={modelConfig.adapterType} 
                      onValueChange={(value) => handleModelConfigChange('adapterType', value)}
                    >
                      <SelectTrigger id="modelType" className="w-full">
                        <SelectValue placeholder="选择模型服务类型" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(MODEL_SERVICES).map(service => (
                          <SelectItem key={service.type} value={service.type}>
                            {service.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="apiKey">API Key</Label>
                    <Input
                      id="apiKey"
                      value={modelConfig.apiKey}
                      onChange={(e) => handleModelConfigChange('apiKey', e.target.value)}
                      placeholder={`请输入 ${MODEL_SERVICES[modelConfig.adapterType as ModelServiceType]?.name || '模型'} API Key`}
                      className="w-full"
                      type="password"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="apiBaseUrl">API 地址</Label>
                    <Input
                      id="apiBaseUrl"
                      value={modelConfig.apiBaseUrl}
                      onChange={(e) => handleModelConfigChange('apiBaseUrl', e.target.value)}
                      placeholder={modelConfig.adapterType === ModelServiceType.AZURE 
                        ? '请输入 Azure OpenAI Endpoint' 
                        : `请输入 ${MODEL_SERVICES[modelConfig.adapterType as ModelServiceType]?.name || '模型'} API 地址 (默认: ${MODEL_SERVICES[modelConfig.adapterType as ModelServiceType]?.defaultApiUrl || ''})`}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'rules' && <SkillsPage />}
          
          {activeSection !== 'general' && activeSection !== 'model' && activeSection !== 'rules' && (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">{sections.find(s => s.id === activeSection)?.name} 页面内容</p>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  )
}
