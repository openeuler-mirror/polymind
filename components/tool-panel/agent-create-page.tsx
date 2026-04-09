'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { agentService } from '@/services/agent-service'
import { ModelServiceType, MODEL_SERVICES } from '@/lib/types'

interface AgentCreatePageProps {
  onBack: () => void
  onCreated: () => void
}

export function AgentCreatePage({ onBack, onCreated }: AgentCreatePageProps) {
  const [agentForm, setAgentForm] = useState({
    name: '',
    description: '',
    adapterType: ModelServiceType.OPENAI,
    config: {
      apiKey: '',
      apiBaseUrl: ''
    }
  })
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  // 处理表单变化
  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    if (name.startsWith('config.')) {
      // 处理 config 对象中的字段
      const configField = name.replace('config.', '')
      setAgentForm(prev => ({
        ...prev,
        config: {
          ...prev.config,
          [configField]: value
        }
      }))
    } else if (name === 'adapterType') {
      // 处理模型服务类型字段，转换为 ModelServiceType 枚举
      setAgentForm(prev => ({
        ...prev,
        adapterType: value as ModelServiceType,
        // 重置配置字段
        config: {
          apiKey: '',
          apiBaseUrl: ''
        }
      }))
    } else {
      // 处理其他普通字段
      setAgentForm(prev => ({
        ...prev,
        [name]: value
      }))
    }
  }

  // 处理选择变化
  const handleSelectChange = (value: string) => {
    setAgentForm(prev => ({
      ...prev,
      adapterType: value as ModelServiceType,
      // 重置配置字段
      config: {
        apiKey: '',
        apiBaseUrl: ''
      }
    }))
  }

  // 处理表单提交
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setLoading(true)
      // 这里应该调用创建智能体的API
      console.log('Creating agent:', agentForm)
      // 模拟创建成功
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
            <label htmlFor="adapterType" className="text-sm font-medium">模型服务类型</label>
            <Select value={agentForm.adapterType} onValueChange={handleSelectChange}>
              <SelectTrigger id="adapterType" className="w-full">
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
            <label className="text-sm font-medium">配置</label>
            <div className="rounded-md border border-input bg-background p-4 text-sm">
              <p className="text-muted-foreground mb-2">根据选择的模型服务类型，配置相应的参数</p>
              <div className="space-y-2">
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label htmlFor="config.apiKey" className="text-xs font-medium">API Key</label>
                    <Input
                      id="config.apiKey"
                      name="config.apiKey"
                      value={agentForm.config.apiKey}
                      onChange={handleFormChange}
                      placeholder={`请输入 ${MODEL_SERVICES[agentForm.adapterType].name} API Key`}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="config.apiBaseUrl" className="text-xs font-medium">
                      API 地址 {agentForm.adapterType === ModelServiceType.AZURE && '(Endpoint)'}
                    </label>
                    <Input
                      id="config.apiBaseUrl"
                      name="config.apiBaseUrl"
                      value={agentForm.config.apiBaseUrl}
                      onChange={handleFormChange}
                      placeholder={agentForm.adapterType === ModelServiceType.AZURE 
                        ? '请输入 Azure OpenAI Endpoint' 
                        : `请输入 ${MODEL_SERVICES[agentForm.adapterType].name} API 地址 (默认: ${MODEL_SERVICES[agentForm.adapterType].defaultApiUrl})`}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            </div>
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