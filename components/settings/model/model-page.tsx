'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Edit, Trash2, Zap, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { modelService } from '@/services/model-service'
import {
  ModelConfig,
  CreateModelRequest,
  UpdateModelRequest,
  ModelProvider,
  Compatibility,
} from '@/lib/types'
import { useToast } from '@/hooks/use-toast'
import { useChatStore } from '@/lib/store'
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
  const { t } = useTranslation('settings')
  const [models, setModels] = useState<ModelConfig[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingModel, setEditingModel] = useState<ModelConfig | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSetDefault, setIsSetDefault] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const { toast } = useToast()

  const [formData, setFormData] = useState({
    name: '',
    provider: ModelProvider.OPENAI,
    apiKey: '',
    apiBaseUrl: '',
    compatibility: 'openai' as Compatibility,
  })

  const [formErrors, setFormErrors] = useState<{
    provider?: string
    compatibility?: string
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
        title: t('model.toast.loadFailed'),
        description: t('model.toast.loadFailedDesc'),
        variant: 'destructive',
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
      setIsSetDefault(model.isDefault)
      setFormData({
        name: model.name,
        provider: model.provider as ModelProvider,
        apiKey: '',
        apiBaseUrl: model.apiBaseUrl || '',
        compatibility: model.compatibility || 'openai',
      })
    } else {
      setEditingModel(null)
      // 不存在"启用且为默认"的模型时（含全禁用/仅禁用默认），新建的第一个模型自动设为默认（F1 优化点 3）
      setIsSetDefault(!models.some(m => m.enabled && m.isDefault))
      const defaultProvider = aiProvidersConfig.providers.find(p => p.id === ModelProvider.OPENAI)
      const defaultModel =
        defaultProvider?.models.find(m => m.isDefault) || defaultProvider?.models[0]
      setFormData({
        name: defaultModel?.id || '',
        provider: ModelProvider.OPENAI,
        apiKey: '',
        apiBaseUrl: defaultProvider?.apiBaseUrl || '',
        compatibility: 'openai',
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
      name: providerId === ModelProvider.CUSTOM ? '' : defaultModel?.id || '',
      apiBaseUrl: provider?.apiBaseUrl || '',
      compatibility: 'openai',
    }))
    setFormErrors({})
  }

  const validateForm = () => {
    const errors: typeof formErrors = {}

    if (!formData.provider) {
      errors.provider = t('model.validation.providerRequired')
    }

    if (formData.provider === ModelProvider.CUSTOM && !formData.compatibility) {
      errors.compatibility = t('model.validation.compatibilityRequired')
    }

    if (!formData.name || !formData.name.trim()) {
      errors.name =
        formData.provider === ModelProvider.CUSTOM
          ? t('model.validation.modelIdRequired')
          : t('model.validation.modelRequired')
    }

    // 编辑时 apiKey 留空表示沿用现有密钥（handleSubmit 传 undefined，后端不更新），仅新建时必填。
    if (!editingModel && (!formData.apiKey || !formData.apiKey.trim())) {
      errors.apiKey = t('model.validation.apiKeyRequired')
    }

    if (
      formData.provider === ModelProvider.CUSTOM &&
      (!formData.apiBaseUrl || !formData.apiBaseUrl.trim())
    ) {
      errors.apiBaseUrl = t('model.validation.apiBaseUrlRequired')
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
          compatibility:
            formData.provider === ModelProvider.CUSTOM ? formData.compatibility : undefined,
          isDefault: isSetDefault,
        }
        await modelService.updateModel(editingModel.id, request)
      } else {
        const request: CreateModelRequest = {
          name: formData.name,
          provider: formData.provider,
          apiKey: formData.apiKey,
          apiBaseUrl: formData.apiBaseUrl,
          compatibility:
            formData.provider === ModelProvider.CUSTOM ? formData.compatibility : undefined,
          enabled: true,
          isDefault: isSetDefault,
        }
        await modelService.createModel(request)
      }
      // 在设置页把某个模型设为默认，同样算「配置过默认模型」。
      if (isSetDefault) {
        useChatStore.getState().setHasConfiguredDefaultModel(true)
      }
      handleCloseDialog()
      loadModels()
    } catch (error) {
      console.error('Failed to save model:', error)
      toast({
        title: t('model.toast.saveFailed'),
        description: editingModel
          ? t('model.toast.saveUpdateFailedDesc')
          : t('model.toast.saveCreateFailedDesc'),
        variant: 'destructive',
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
        title: t('model.toast.deleteFailed'),
        description: t('model.toast.deleteFailedDesc'),
        variant: 'destructive',
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
      custom: 'bg-gray-500',
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

  // 已有默认模型时，切换/取消默认给出提示，优化切换体验（F1 优化点 4）
  // 「正在编辑的是不是当前默认模型」以 models 列表里的当前默认为准，避免依赖打开弹窗时的快照。
  const currentDefaultModel = models.find(m => m.enabled && m.isDefault)
  const isEditingCurrentDefault = !!editingModel && editingModel.id === currentDefaultModel?.id
  const targetModelName = editingModel?.name || formData.name
  const defaultSwitchHint = (() => {
    // 启用默认：非当前默认模型 + 已存在有效默认 → 提示将替换
    if (isSetDefault && currentDefaultModel && !isEditingCurrentDefault) {
      return t('model.defaultSwitchHint.replace', {
        from: currentDefaultModel.name,
        to: targetModelName,
      })
    }
    // 取消当前默认模型的默认标记 → 提示将无默认
    if (!isSetDefault && isEditingCurrentDefault) {
      return t('model.defaultSwitchHint.remove')
    }
    return null
  })()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t('model.title')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('model.description')}</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" onClick={() => handleOpenDialog()}>
              <Plus className="w-4 h-4" />
              {t('model.addModel')}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>
                {editingModel ? t('model.dialog.editTitle') : t('model.dialog.addTitle')}
              </DialogTitle>
              <DialogDescription></DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="provider">
                  <span className="text-red-500">*</span> {t('model.dialog.providerLabel')}
                </Label>
                <Select value={formData.provider} onValueChange={handleProviderChange}>
                  <SelectTrigger
                    id="provider"
                    className={`w-full ${formErrors.provider ? 'border-red-500' : ''}`}
                  >
                    <SelectValue placeholder={t('model.dialog.providerPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {aiProvidersConfig.providers.map(provider => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                      </SelectItem>
                    ))}
                    <SelectItem value={ModelProvider.CUSTOM}>
                      {t('model.dialog.customProvider')}
                    </SelectItem>
                  </SelectContent>
                </Select>
                {formErrors.provider && (
                  <p className="text-sm text-red-500">{formErrors.provider}</p>
                )}
              </div>

              {formData.provider === ModelProvider.CUSTOM && (
                <div className="space-y-2">
                  <Label htmlFor="compatibility">
                    <span className="text-red-500">*</span> {t('model.dialog.compatibilityLabel')}
                  </Label>
                  <Select
                    value={formData.compatibility}
                    onValueChange={value => {
                      setFormData(prev => ({
                        ...prev,
                        compatibility: value as 'openai' | 'anthropic',
                      }))
                      setFormErrors(prev => ({ ...prev, compatibility: undefined }))
                    }}
                  >
                    <SelectTrigger
                      id="compatibility"
                      className={`w-full ${formErrors.compatibility ? 'border-red-500' : ''}`}
                    >
                      <SelectValue placeholder={t('model.dialog.compatibilityPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">{t('model.dialog.compatibilityOpenai')}</SelectItem>
                      <SelectItem value="anthropic">
                        {t('model.dialog.compatibilityAnthropic')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {formErrors.compatibility && (
                    <p className="text-sm text-red-500">{formErrors.compatibility}</p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="modelName">
                  <span className="text-red-500">*</span> {t('model.dialog.modelLabel')}
                </Label>
                {formData.provider === ModelProvider.CUSTOM ? (
                  <Input
                    id="modelName"
                    value={formData.name}
                    onChange={e => {
                      setFormData(prev => ({ ...prev, name: e.target.value }))
                      setFormErrors(prev => ({ ...prev, name: undefined }))
                    }}
                    placeholder={t('model.dialog.modelIdPlaceholder')}
                    className={`w-full ${formErrors.name ? 'border-red-500' : ''}`}
                  />
                ) : (
                  <Select
                    value={formData.name}
                    onValueChange={value => {
                      setFormData(prev => ({ ...prev, name: value }))
                      setFormErrors(prev => ({ ...prev, name: undefined }))
                    }}
                  >
                    <SelectTrigger
                      id="modelName"
                      className={`w-full ${formErrors.name ? 'border-red-500' : ''}`}
                    >
                      <SelectValue placeholder={t('model.dialog.modelPlaceholder')} />
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
                {formErrors.name && <p className="text-sm text-red-500">{formErrors.name}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="apiKey">
                  <span className="text-red-500">*</span> {t('model.dialog.apiKeyLabel')}
                </Label>
                <Input
                  id="apiKey"
                  value={formData.apiKey}
                  onChange={e => {
                    setFormData(prev => ({ ...prev, apiKey: e.target.value }))
                    setFormErrors(prev => ({ ...prev, apiKey: undefined }))
                  }}
                  placeholder={
                    editingModel
                      ? t('model.dialog.apiKeyEditPlaceholder')
                      : t('model.dialog.apiKeyPlaceholder')
                  }
                  className={`w-full [-webkit-text-security:disc] ${formErrors.apiKey ? 'border-red-500' : ''}`}
                  type="text"
                  autoComplete="off"
                />
                {formErrors.apiKey && <p className="text-sm text-red-500">{formErrors.apiKey}</p>}
              </div>

              {formData.provider === ModelProvider.CUSTOM && (
                <div className="space-y-2">
                  <Label htmlFor="apiBaseUrl">
                    <span className="text-red-500">*</span> {t('model.dialog.apiBaseUrlLabel')}
                  </Label>
                  <Input
                    id="apiBaseUrl"
                    value={formData.apiBaseUrl}
                    onChange={e => {
                      setFormData(prev => ({ ...prev, apiBaseUrl: e.target.value }))
                      setFormErrors(prev => ({ ...prev, apiBaseUrl: undefined }))
                    }}
                    placeholder={
                      formData.compatibility === 'anthropic'
                        ? 'e.g. https://api.anthropic.com'
                        : 'e.g. https://api.openai.com/v1'
                    }
                    className={`w-full ${formErrors.apiBaseUrl ? 'border-red-500' : ''}`}
                  />
                  {formErrors.apiBaseUrl && (
                    <p className="text-sm text-red-500">{formErrors.apiBaseUrl}</p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label
                    htmlFor="set-default"
                    className="text-sm font-medium"
                    onClick={() => setIsSetDefault(v => !v)}
                  >
                    {t('model.dialog.setDefaultLabel')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t('model.dialog.setDefaultDescription')}
                  </p>
                </div>
                <Switch
                  id="set-default"
                  checked={isSetDefault}
                  onCheckedChange={setIsSetDefault}
                  aria-label={t('model.dialog.setDefaultLabel')}
                />
              </div>
              {defaultSwitchHint && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>{t('model.dialog.defaultWillChange')}</AlertTitle>
                  <AlertDescription>{defaultSwitchHint}</AlertDescription>
                </Alert>
              )}
            </div>

            <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full mt-6">
              {isSubmitting
                ? editingModel
                  ? t('model.dialog.submittingEdit')
                  : t('model.dialog.submittingAdd')
                : editingModel
                  ? t('model.dialog.confirmEdit')
                  : t('model.dialog.confirmAdd')}
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
            <p className="text-muted-foreground">{t('model.empty')}</p>
            <Button variant="outline" className="mt-4" onClick={() => handleOpenDialog()}>
              {t('model.addFirstModel')}
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
                      <div
                        className={`w-10 h-10 rounded-lg ${getProviderColor(model.provider)} flex items-center justify-center`}
                      >
                        <Zap className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{modelConfig?.name || model.name}</h3>
                          {model.isDefault && (
                            <Badge variant="secondary" className="text-xs">
                              {t('model.default')}
                            </Badge>
                          )}
                          {!model.enabled && (
                            <Badge variant="outline" className="text-xs">
                              {t('model.disabled')}
                            </Badge>
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
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenDialog(model)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('common:action.edit')}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-red-500 hover:text-red-600"
                                  onClick={() =>
                                    setDeleteTarget({ id: model.id, name: model.name })
                                  }
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t('model.deleteDialog.title')}</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {t('model.deleteDialog.description', { name: deleteTarget?.name })}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t('common:action.cancel')}</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={handleDelete}
                                    className="bg-red-500 hover:bg-red-600"
                                  >
                                    {t('common:action.delete')}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TooltipTrigger>
                          <TooltipContent>{t('model.delete')}</TooltipContent>
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
