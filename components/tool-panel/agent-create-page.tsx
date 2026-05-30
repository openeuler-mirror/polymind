'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { agentService } from '@/services/agent-service'
import { SandboxType, SANDBOX_CONFIGS } from '@/lib/types'
import { useChatStore } from '@/lib/store'
import {
  Bot,
  Brain,
  MessageSquare,
  Code,
  Lightbulb,
  Settings,
  Search,
  Database
} from 'lucide-react'

interface AgentCreatePageProps {
  onBack: () => void
  onCreated: () => void
}

export function AgentCreatePage({ onBack, onCreated }: AgentCreatePageProps) {
  const [agentForm, setAgentForm] = useState({
    name: '',
    description: '',
    adapterType: 'openclaw', // 默认为 openclaw
    sandboxType: SandboxType.DOCKER,
    idleTimeout: 3600, // 默认 1 小时
    icon: 'bot' // 默认图标
  })
  const [showIconSelector, setShowIconSelector] = useState(false)
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  const iconSelectorRef = useRef<HTMLDivElement>(null)
  const addAgent = useChatStore(state => state.addAgent)
  const setCurrentAgent = useChatStore(state => state.setCurrentAgent)

  // 处理表单变化
  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setAgentForm(prev => ({
      ...prev,
      [name]: value
    }))
  }

  // 处理图标选择
  const handleIconSelect = (icon: string) => {
    setAgentForm(prev => ({
      ...prev,
      icon
    }))
    setShowIconSelector(false)
  }

  // 点击外部关闭图标选择器
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (iconSelectorRef.current && !iconSelectorRef.current.contains(event.target as Node)) {
        setShowIconSelector(false)
      }
    }

    if (showIconSelector) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showIconSelector])

  // 图标列表
  const icons = [
    { name: 'bot', component: Bot },
    { name: 'brain', component: Brain },
    { name: 'message', component: MessageSquare },
    { name: 'code', component: Code },
    { name: 'lightbulb', component: Lightbulb },
    { name: 'settings', component: Settings },
    { name: 'search', component: Search },
    { name: 'database', component: Database }
  ]

  // 处理表单提交
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setLoading(true)
      // 调用创建智能体的 API
      console.log('Creating agent:', agentForm)
      
      const newAgent = await agentService.createAgent({
        name: agentForm.name,
        description: agentForm.description,
        adapterType: agentForm.adapterType,
        sandboxType: agentForm.sandboxType,
        idleTimeoutSeconds: agentForm.idleTimeout
      })
      
      // 添加到全局store，同步到conversation-sidebar
      addAgent(newAgent)
      setCurrentAgent(newAgent.id)

      toast({
        title: '成功',
        description: '智能体创建成功',
        duration: 1000
      })
      // 通知父组件创建成功
      onCreated()
      // 返回到列表页面
      onBack()
    } catch (err) {
      console.error('Failed to create agent:', err)
      toast({
        title: '错误',
        description: '智能体创建失败',
        variant: 'destructive',
        duration: 1000
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card className="border border-border shadow-sm bg-background w-full cursor-default">
      <CardHeader>
        <CardTitle>创建智能体</CardTitle>
        <CardDescription>配置智能体的基本信息和设置</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">智能体名称</label>
            <div className="flex items-center space-x-3">
              <div className="relative">
                <div 
                  className="w-10 h-10 rounded border border-border flex items-center justify-center cursor-pointer hover:border-primary transition-colors"
                  onClick={() => setShowIconSelector(!showIconSelector)}
                >
                  {(() => {
                    const selectedIcon = icons.find(i => i.name === agentForm.icon);
                    if (selectedIcon) {
                      const IconComponent = selectedIcon.component;
                      return <IconComponent size={18} className="text-muted-foreground" />;
                    }
                    return <Bot size={18} className="text-muted-foreground" />;
                  })()}
                </div>
                
                {/* 图标选择器 */}
                {showIconSelector && (
                  <div ref={iconSelectorRef} className="absolute left-0 top-full mt-2 w-48 bg-background border border-border rounded-md shadow-lg p-2 z-10">
                    <div className="grid grid-cols-4 gap-2">
                      {icons.map(icon => {
                        const IconComponent = icon.component;
                        return (
                          <div
                            key={icon.name}
                            className={`w-8 h-8 rounded flex items-center justify-center cursor-pointer transition-colors ${
                              agentForm.icon === icon.name 
                                ? 'border-2 border-primary bg-primary/10' 
                                : 'border border-border hover:border-primary'
                            }`}
                            onClick={() => handleIconSelect(icon.name)}
                          >
                            <IconComponent size={16} className="text-muted-foreground" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <Input
                id="name"
                name="name"
                value={agentForm.name}
                onChange={handleFormChange}
                placeholder="请输入智能体名称"
                required
                className="flex-1"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-medium">描述</label>
            <textarea
              id="description"
              name="description"
              value={agentForm.description}
              onChange={handleFormChange}
              placeholder="请输入智能体描述"
              className="w-full rounded-md border border-input px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              rows={3}
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="adapterType" className="text-sm font-medium">适配器类型</label>
            <Select 
              value={agentForm.adapterType} 
              onValueChange={(value) => setAgentForm(prev => ({ ...prev, adapterType: value }))}
            >
              <SelectTrigger id="adapterType" className="w-full">
                <SelectValue placeholder="选择适配器类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openclaw">OpenClaw</SelectItem>
                <SelectItem value="opencode">OpenCode</SelectItem>
                <SelectItem value="claude-code">Claude Code</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <label htmlFor="sandboxType" className="text-sm font-medium">沙箱类型</label>
            <Select 
              value={agentForm.sandboxType} 
              onValueChange={(value) => setAgentForm(prev => ({ ...prev, sandboxType: value as SandboxType }))}
            >
              <SelectTrigger id="sandboxType" className="w-full">
                <SelectValue placeholder="选择沙箱类型" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(SANDBOX_CONFIGS).map(sandbox => (
                  <SelectItem key={sandbox.type} value={sandbox.type}>
                    {sandbox.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onBack} disabled={loading}>
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? '创建中...' : '创建智能体'}
            </Button>
          </div>
        </form>
      </CardContent>
      </Card>
    </div>
  )
}