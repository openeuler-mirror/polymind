'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { agentService } from '@/services/agent-service'
import { modelService } from '@/services/model-service'
import { SandboxType, ModelConfig } from '@/lib/types'
import { useChatStore } from '@/lib/store'
import {
  Bot,
  Brain,
  MessageSquare,
  Code,
  Lightbulb,
  Settings,
  Search,
  Database,
} from 'lucide-react'

interface AgentCreatePageProps {
  onBack: () => void
  onCreated: () => void
}

export function AgentCreatePage({ onBack, onCreated }: AgentCreatePageProps) {
  const [agentForm, setAgentForm] = useState({
    name: '',
    description: '',
    adapterType: 'openclaw',
    sandboxType: SandboxType.LOCAL_PROCESS,
    idleTimeout: 3600,
    icon: 'bot',
    modelId: '',
    mcpServerName: '',
    mcpServerConfig: '',
  })
  const [models, setModels] = useState<ModelConfig[]>([])
  const [existingAgentNames, setExistingAgentNames] = useState<string[]>([])
  const [nameError, setNameError] = useState('')
  const [showIconSelector, setShowIconSelector] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mcpConfigError, setMcpConfigError] = useState('')
  const { toast } = useToast()
  const iconSelectorRef = useRef<HTMLDivElement>(null)
  const addAgent = useChatStore(state => state.addAgent)
  const setCurrentAgent = useChatStore(state => state.setCurrentAgent)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [modelsData, agentsData] = await Promise.all([
          modelService.getModels(),
          agentService.getAgents(),
        ])
        setModels(modelsData)
        setExistingAgentNames(agentsData.map(agent => agent.name))
      } catch (error) {
        console.error('Failed to fetch data:', error)
      }
    }
    fetchData()
  }, [])

  const validateAgentName = (name: string) => {
    if (!name.trim()) {
      setNameError('请输入智能体名称')
      return false
    }
    if (existingAgentNames.includes(name.trim())) {
      setNameError('智能体名称已存在')
      return false
    }
    setNameError('')
    return true
  }

  // 处理表单变化
  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setAgentForm(prev => ({
      ...prev,
      [name]: value,
    }))
  }

  // 处理图标选择
  const handleIconSelect = (icon: string) => {
    setAgentForm(prev => ({
      ...prev,
      icon,
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
    { name: 'database', component: Database },
  ]

  const validateMcpConfig = (configStr: string): boolean => {
    if (!configStr.trim()) {
      setMcpConfigError('')
      return true
    }
    try {
      JSON.parse(configStr)
      setMcpConfigError('')
      return true
    } catch {
      setMcpConfigError('MCP配置必须是有效的JSON格式')
      return false
    }
  }

  // 处理MCP配置变化
  const handleMcpConfigChange = (value: string) => {
    setAgentForm(prev => ({
      ...prev,
      mcpServerConfig: value,
    }))
    validateMcpConfig(value)
  }

  // 处理表单提交
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateAgentName(agentForm.name)) {
      return
    }

    if (!agentForm.modelId) {
      toast({
        title: '错误',
        description: '请选择模型配置',
        variant: 'destructive',
      })
      return
    }

    if (!validateMcpConfig(agentForm.mcpServerConfig)) {
      return
    }

    const hasMcpName = agentForm.mcpServerName.trim() !== ''
    const hasMcpConfig = agentForm.mcpServerConfig.trim() !== ''

    if (hasMcpName !== hasMcpConfig) {
      toast({
        title: '错误',
        description: 'MCP Server 名称和配置必须同时填写或同时不填',
        variant: 'destructive',
      })
      return
    }

    try {
      setLoading(true)
      console.log('Creating agent:', agentForm)

      const mcpConfig = agentForm.mcpServerConfig.trim()
        ? JSON.parse(agentForm.mcpServerConfig)
        : undefined

      const newAgent = await agentService.createAgent({
        name: agentForm.name,
        description: agentForm.description,
        adapterType: agentForm.adapterType,
        sandboxType: agentForm.sandboxType,
        idleTimeoutSeconds: agentForm.idleTimeout,
        modelId: agentForm.modelId || undefined,
        mcpServerName: agentForm.mcpServerName || undefined,
        mcpServerConfig: mcpConfig,
      })

      // 添加到全局store，同步到conversation-sidebar
      addAgent(newAgent)
      setCurrentAgent(newAgent.id)

      toast({
        title: '成功',
        description: '智能体创建成功',
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
              <label htmlFor="name" className="text-sm font-medium">
                智能体名称 <span className="text-destructive">*</span>
              </label>
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <div
                    className="w-10 h-10 rounded border border-border flex items-center justify-center cursor-pointer hover:border-primary transition-colors"
                    onClick={() => setShowIconSelector(!showIconSelector)}
                  >
                    {(() => {
                      const selectedIcon = icons.find(i => i.name === agentForm.icon)
                      if (selectedIcon) {
                        const IconComponent = selectedIcon.component
                        return <IconComponent size={18} className="text-muted-foreground" />
                      }
                      return <Bot size={18} className="text-muted-foreground" />
                    })()}
                  </div>

                  {/* 图标选择器 */}
                  {showIconSelector && (
                    <div
                      ref={iconSelectorRef}
                      className="absolute left-0 top-full mt-2 w-48 bg-background border border-border rounded-md shadow-lg p-2 z-10"
                    >
                      <div className="grid grid-cols-4 gap-2">
                        {icons.map(icon => {
                          const IconComponent = icon.component
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
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
                <Input
                  id="name"
                  name="name"
                  value={agentForm.name}
                  onChange={e => {
                    handleFormChange(e)
                    validateAgentName(e.target.value)
                  }}
                  placeholder="请输入智能体名称"
                  required
                  className={`flex-1 ${nameError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                />
                {nameError && <p className="text-sm text-destructive">{nameError}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-medium">
                描述
              </label>
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
              <label htmlFor="adapterType" className="text-sm font-medium">
                适配器类型
              </label>
              <Select
                value={agentForm.adapterType}
                onValueChange={value => setAgentForm(prev => ({ ...prev, adapterType: value }))}
              >
                <SelectTrigger id="adapterType" className="w-full">
                  <SelectValue placeholder="选择适配器类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openclaw">OpenClaw</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="sandboxType" className="text-sm font-medium">
                沙箱类型
              </label>
              <Select
                value={agentForm.sandboxType}
                onValueChange={value =>
                  setAgentForm(prev => ({ ...prev, sandboxType: value as SandboxType }))
                }
              >
                <SelectTrigger id="sandboxType" className="w-full">
                  <SelectValue placeholder="选择沙箱类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SandboxType.LOCAL_PROCESS}>本地进程</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="modelId" className="text-sm font-medium">
                模型配置 <span className="text-destructive">*</span>
              </label>
              <Select
                value={agentForm.modelId}
                onValueChange={value => setAgentForm(prev => ({ ...prev, modelId: value }))}
              >
                <SelectTrigger id="modelId" className="w-full">
                  <SelectValue placeholder="请选择模型配置" />
                </SelectTrigger>
                <SelectContent>
                  {models.map(model => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name} ({model.provider})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="mcpServerName" className="text-sm font-medium">
                MCP Server 名称
              </label>
              <Input
                id="mcpServerName"
                name="mcpServerName"
                value={agentForm.mcpServerName}
                onChange={handleFormChange}
                placeholder="输入MCP Server名称（可选）"
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="mcpServerConfig" className="text-sm font-medium">
                MCP Server 配置
              </label>
              <textarea
                id="mcpServerConfig"
                name="mcpServerConfig"
                value={agentForm.mcpServerConfig}
                onChange={e => handleMcpConfigChange(e.target.value)}
                placeholder="输入MCP配置（JSON格式，可选）"
                className={`w-full rounded-md border px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                  mcpConfigError
                    ? 'border-destructive focus-visible:ring-destructive'
                    : 'border-input focus-visible:ring-ring'
                }`}
                rows={4}
              />
              {mcpConfigError && <p className="text-sm text-destructive">{mcpConfigError}</p>}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onBack} disabled={loading}>
                取消
              </Button>
              <Button type="submit" disabled={loading} className="relative">
                {loading ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    创建中...
                  </>
                ) : (
                  '创建智能体'
                )}
              </Button>
            </div>

            {loading && (
              <div className="mt-4 p-3 bg-muted/50 rounded-md">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                    <span
                      className="w-2 h-2 rounded-full bg-primary/60 animate-pulse"
                      style={{ animationDelay: '0.2s' }}
                    ></span>
                    <span
                      className="w-2 h-2 rounded-full bg-primary/30 animate-pulse"
                      style={{ animationDelay: '0.4s' }}
                    ></span>
                  </div>
                  <span>正在创建智能体，此过程可能需要1-2分钟，请耐心等待...</span>
                </div>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
