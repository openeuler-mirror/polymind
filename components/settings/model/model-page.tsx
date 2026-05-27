'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit, Trash2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { modelService } from '@/services/model-service'
import { ModelConfig, CreateModelRequest, UpdateModelRequest, ModelProvider, ApiFormat } from '@/lib/types'
import { useToast } from '@/hooks/use-toast'
import aiProvidersConfig from '@/lib/ai-providers-config.json'

interface Provider {
  id: string
  name: string
  website: string
  apiKeyUrl: string
  apiBaseUrl: string
  logoUrl: string
  supportsToolCalls: boolean
  supportsReasoning: boolean
  supportsStreaming: boolean
  models: Model[]
}

interface Model {
  id: string
  name: string
  description: string
  contextWindow: number
  maxTokens: number
  maxOutputTokens?: number
  price: {
    input: number
    output: number
    currency: string
    per: string
  }
  capabilities: {
    imageInput: boolean
    imageOutput: boolean
    audioInput: boolean
    audioOutput: boolean
    toolCalls: boolean
    reasoning: boolean
    structuredOutputs: boolean
    functionCalling: boolean
  }
  isDefault: boolean
  isDeprecated: boolean
}

export function ModelPage() {
  const [models, setModels] = useState<ModelConfig[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingModel, setEditingModel] = useState<ModelConfig | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const { toast } = useToast()

  const [formData, setFormData] = useState({
    name: '',
    provider: ModelProvider.OPENAI,
    apiKey: '',
    apiBaseUrl: '',
    apiFormat: 'openai' as ApiFormat
  })

  const [formErrors, setFormErrors] = useState<{
    provider?: string
    apiFormat?: string
    name?: string
    apiKey?: string
    apiBaseUrl?: string
  }>({})

  useEffect(() => {
    loadModels()
  }, [])

  const loadModels = async () => {
    setIsLoading(true)
    try {
      const data = await modelService.getModels()
      setModels(data)
    } catch (error) {
      console.error('Failed to load models:', error)
      toast({
        title: '加载失败',
        description: '无法加载模型配置列表',
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenDialog = (model?: ModelConfig) => {
    setFormErrors({})
    setIsSubmitting(false)
    if (model) {
      setEditingModel(model)
      setFormData({
        name: model.name,
        provider: model.provider as ModelProvider,
        apiKey: '',
        apiBaseUrl: model.apiBaseUrl || '',
        apiFormat: model.apiFormat || 'openai'
      })
    } else {
      setEditingModel(null)
      const defaultProvider = aiProvidersConfig.providers.find(p => p.id === ModelProvider.OPENAI)
      const defaultModel = defaultProvider?.models.find(m => m.isDefault) || defaultProvider?.models[0]
      setFormData({
        name: defaultModel?.id || '',
        provider: ModelProvider.OPENAI,
        apiKey: '',
        apiBaseUrl: defaultProvider?.apiBaseUrl || '',
        apiFormat: 'openai'
      })
    }
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingModel(null)
    setFormErrors({})
  }

  const handleProviderChange = (providerId: string) => {
    const provider = aiProvidersConfig.providers.find(p => p.id === providerId)
    const defaultModel = provider?.models.find(m => m.isDefault) || provider?.models[0]
    
    setFormData(prev => ({
      ...prev,
      provider: providerId as ModelProvider,
      name: providerId === ModelProvider.CUSTOM ? '' : (defaultModel?.id || ''),
      apiBaseUrl: provider?.apiBaseUrl || '',
      apiFormat: 'openai'
    }))
    setFormErrors({})
  }

  const validateForm = () => {
    const errors: typeof formErrors = {}

    if (!formData.provider) {
      errors.provider = '请选择服务商'
    }

    if (formData.provider === ModelProvider.CUSTOM && !formData.apiFormat) {
      errors.apiFormat = '请选择 API 格式'
    }

    if (!formData.name || !formData.name.trim()) {
      errors.name = formData.provider === ModelProvider.CUSTOM ? '请输入模型 ID' : '请选择模型'
    }

    if (!formData.apiKey || !formData.apiKey.trim()) {
      errors.apiKey = '请输入 API 密钥'
    }

    if (formData.provider === ModelProvider.CUSTOM && (!formData.apiBaseUrl || !formData.apiBaseUrl.trim())) {
      errors.apiBaseUrl = '请输入自定义请求地址'
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async () => {
    if (!validateForm()) {
      return
    }
    setIsSubmitting(true)
    try {
      if (editingModel) {
        const request: UpdateModelRequest = {
          name: formData.name,
          provider: formData.provider,
          apiKey: formData.apiKey || undefined,
          apiBaseUrl: formData.apiBaseUrl,
          apiFormat: formData.provider === ModelProvider.CUSTOM ? formData.apiFormat : undefined
        }
        await modelService.updateModel(editingModel.id, request)
      } else {
        const request: CreateModelRequest = {
          name: formData.name,
          provider: formData.provider,
          apiKey: formData.apiKey,
          apiBaseUrl: formData.apiBaseUrl,
          apiFormat: formData.provider === ModelProvider.CUSTOM ? formData.apiFormat : undefined,
          enabled: true,
          isDefault: false
        }
        await modelService.createModel(request)
      }
      handleCloseDialog()
      loadModels()
    } catch (error) {
      console.error('Failed to save model:', error)
      toast({
        title: '保存失败',
        description: editingModel ? '无法更新模型配置' : '无法创建模型配置',
        variant: 'destructive'
      })
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    
    try {
      await modelService.deleteModel(deleteTarget.id)
      setDeleteTarget(null)
      loadModels()
    } catch (error) {
      console.error('Failed to delete model:', error)
      toast({
        title: '删除失败',
        description: '无法删除模型配置',
        variant: 'destructive'
      })
    }
  }

  const getProviderName = (providerId: string) => {
    const provider = aiProvidersConfig.providers.find(p => p.id === providerId)
    return provider?.name || providerId
  }

  const getProviderColor = (providerId: string) => {
    const colors: Record<string, string> = {
      openai: 'bg-blue-500',
      anthropic: 'bg-cyan-500',
      alibaba: 'bg-orange-500',
      deepseek: 'bg-amber-500',
      zhipuai: 'bg-red-500',
      minimax: 'bg-pink-500',
      moonshotai: 'bg-indigo-500',
      google: 'bg-green-500',
      xai: 'bg-yellow-500',
      siliconflow: 'bg-teal-500',
      azure: 'bg-sky-500',
      custom: 'bg-gray-500'
    }
    return colors[providerId] || 'bg-gray-500'
  }

  const getAvailableModelsForProvider = (providerId: string) => {
    const provider = aiProvidersConfig.providers.find(p => p.id === providerId)
    return provider?.models.map(m => m.id) || []
  }

  const getProviderConfig = (providerId: string) => {
    return aiProvidersConfig.providers.find(p => p.id === providerId)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">模型配置管理</h2>
          <p className="text-sm text-muted-foreground mt-1">管理大模型配置，支持多种模型提供商</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" onClick={() => handleOpenDialog()}>
              <Plus className="w-4 h-4" />
              添加模型
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{editingModel ? '编辑模型配置' : '添加模型配置'}</DialogTitle>
              <DialogDescription></DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="provider"><span className="text-red-500">*</span> 服务商</Label>
                <Select
                  value={formData.provider}
                  onValueChange={handleProviderChange}
                >
                  <SelectTrigger id="provider" className={`w-full ${formErrors.provider ? 'border-red-500' : ''}`}>
                    <SelectValue placeholder="选择服务商" />
                  </SelectTrigger>
                  <SelectContent>
                    {aiProvidersConfig.providers.map(provider => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                      </SelectItem>
                    ))}
                    <SelectItem value={ModelProvider.CUSTOM}>自定义配置</SelectItem>
                  </SelectContent>
                </Select>
                {formErrors.provider && (
                  <p className="text-sm text-red-500">{formErrors.provider}</p>
                )}
              </div>

              {formData.provider === ModelProvider.CUSTOM && (
                <div className="space-y-2">
                  <Label htmlFor="apiFormat"><span className="text-red-500">*</span> API 格式</Label>
                  <Select
                    value={formData.apiFormat}
                    onValueChange={(value) => {
                      setFormData(prev => ({ ...prev, apiFormat: value as 'openai' | 'anthropic' }))
                      setFormErrors(prev => ({ ...prev, apiFormat: undefined }))
                    }}
                  >
                    <SelectTrigger id="apiFormat" className={`w-full ${formErrors.apiFormat ? 'border-red-500' : ''}`}>
                      <SelectValue placeholder="选择 API 格式" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI Chat Completions 格式</SelectItem>
                      <SelectItem value="anthropic">Anthropic Messages 格式</SelectItem>
                    </SelectContent>
                  </Select>
                  {formErrors.apiFormat && (
                    <p className="text-sm text-red-500">{formErrors.apiFormat}</p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="modelName"><span className="text-red-500">*</span> 模型</Label>
                {formData.provider === ModelProvider.CUSTOM ? (
                  <Input
                    id="modelName"
                    value={formData.name}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, name: e.target.value }))
                      setFormErrors(prev => ({ ...prev, name: undefined }))
                    }}
                    placeholder="请输入模型 ID"
                    className={`w-full ${formErrors.name ? 'border-red-500' : ''}`}
                  />
                ) : (
                  <Select
                    value={formData.name}
                    onValueChange={(value) => {
                      setFormData(prev => ({ ...prev, name: value }))
                      setFormErrors(prev => ({ ...prev, name: undefined }))
                    }}
                  >
                    <SelectTrigger id="modelName" className={`w-full ${formErrors.name ? 'border-red-500' : ''}`}>
                      <SelectValue placeholder="选择模型" />
                    </SelectTrigger>
                    <SelectContent side="bottom" className="max-h-[300px]">
                      {getAvailableModelsForProvider(formData.provider).map(modelId => {
                        const providerConfig = getProviderConfig(formData.provider)
                        const modelConfig = providerConfig?.models.find(m => m.id === modelId)
                        return (
                          <SelectItem key={modelId} value={modelId}>
                            {modelConfig?.name || modelId}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                )}
                {formErrors.name && (
                  <p className="text-sm text-red-500">{formErrors.name}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="apiKey"><span className="text-red-500">*</span> API密钥</Label>
                <Input
                  id="apiKey"
                  value={formData.apiKey}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, apiKey: e.target.value }))
                    setFormErrors(prev => ({ ...prev, apiKey: undefined }))
                  }}
                  placeholder="请输入 API Key"
                  className={`w-full [-webkit-text-security:disc] ${formErrors.apiKey ? 'border-red-500' : ''}`}
                  type="text"
                  autoComplete="off"
                />
                {formErrors.apiKey && (
                  <p className="text-sm text-red-500">{formErrors.apiKey}</p>
                )}
              </div>

              {formData.provider === ModelProvider.CUSTOM && (
                <div className="space-y-2">
                  <Label htmlFor="apiBaseUrl"><span className="text-red-500">*</span> 自定义请求地址</Label>
                  <Input
                    id="apiBaseUrl"
                    value={formData.apiBaseUrl}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, apiBaseUrl: e.target.value }))
                      setFormErrors(prev => ({ ...prev, apiBaseUrl: undefined }))
                    }}
                    placeholder={formData.apiFormat === 'anthropic' ? 'e.g. https://api.anthropic.com' : 'e.g. https://api.openai.com/v1'}
                    className={`w-full ${formErrors.apiBaseUrl ? 'border-red-500' : ''}`}
                  />
                  {formErrors.apiBaseUrl && (
                    <p className="text-sm text-red-500">{formErrors.apiBaseUrl}</p>
                  )}
                </div>
              )}
            </div>

            <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full mt-6">
              {isSubmitting
                ? (editingModel ? '保存中...' : '添加中...')
                : (editingModel ? '保存更改' : '添加模型')}
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : models.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">暂无模型配置</p>
            <Button variant="outline" className="mt-4" onClick={() => handleOpenDialog()}>
              添加第一个模型
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {models.map(model => {
            const providerConfig = getProviderConfig(model.provider)
            const modelConfig = providerConfig?.models.find(m => m.id === model.name)
            
            return (
              <Card key={model.id} className="group hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-lg ${getProviderColor(model.provider)} flex items-center justify-center`}>
                        <Zap className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{modelConfig?.name || model.name}</h3>
                          {model.isDefault && (
                            <Badge variant="secondary" className="text-xs">默认</Badge>
                          )}
                          {!model.enabled && (
                            <Badge variant="outline" className="text-xs">已禁用</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                          <span>{getProviderName(model.provider)}</span>
                        </div>

                      </div>
                    </div>

                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(model)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>编辑</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" onClick={() => setDeleteTarget({ id: model.id, name: model.name })}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>确认删除</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    确定要删除模型配置 "{deleteTarget?.name}" 吗？此操作无法撤销。
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>取消</AlertDialogCancel>
                                  <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">删除</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TooltipTrigger>
                          <TooltipContent>删除</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
