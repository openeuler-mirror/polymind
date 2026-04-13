'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { agentService } from '@/services/agent-service'
import { SandboxType, SANDBOX_CONFIGS } from '@/lib/types'

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
    idleTimeout: 3600 // 默认 1 小时
  })
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  // 处理表单变化
  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setAgentForm(prev => ({
      ...prev,
      [name]: value
    }))
  }

  // 处理表单提交
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setLoading(true)
      // 调用创建智能体的 API
      console.log('Creating agent:', agentForm)
      
      // 获取沙箱配置的 value 值
      const sandboxValue = SANDBOX_CONFIGS[agentForm.sandboxType as SandboxType]?.value || 'docker'
      
      await agentService.createAgent({
        name: agentForm.name,
        description: agentForm.description,
        adapterType: agentForm.adapterType,
        sandboxConfig: {
          type: sandboxValue,
          timeout: agentForm.idleTimeout
        },
        idleTimeout: agentForm.idleTimeout
      })
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
            <Input
              id="name"
              name="name"
              value={agentForm.name}
              onChange={handleFormChange}
              placeholder="请输入智能体名称"
              required
            />
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