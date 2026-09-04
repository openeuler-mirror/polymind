'use client'

import { useEffect, useState } from 'react'
import { Cpu, Plus, PowerOff, RotateCw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { modelService } from '@/services/model-service'
import { ModelConfig } from '@/lib/types'
import { useChatStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'

/**
 * 默认模型首检弹窗。
 *
 * - 打开时机：首次进入首页，判定不存在「enabled && isDefault」的模型时拉起。
 * - 规则：可跳过（"暂不配置"），不持久化"不再提示"，下次进首页仍弹；配置成功后关闭。
 * - 每次打开都现取模型列表，避免"前端以为有默认、后端已删"的缓存错位。
 */
export function DefaultModelDialog() {
  const isOpen = useChatStore(state => state.isDefaultModelDialogOpen)
  const closeDialog = useChatStore(state => state.closeDefaultModelDialog)
  const { toast } = useToast()

  // models === null 表示正在加载（尚未取回任何数据）
  const [models, setModels] = useState<ModelConfig[] | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<string>('')
  const [loadError, setLoadError] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)

  // React 文档推荐：根据 prop 变化在渲染期调整状态，避免用 effect 触发 setState。
  const [prevOpen, setPrevOpen] = useState(isOpen)
  if (prevOpen !== isOpen) {
    setPrevOpen(isOpen)
    if (isOpen) {
      setModels(null)
      setSelectedModelId('')
      setLoadError(false)
    }
  }

  useEffect(() => {
    if (!isOpen) return

    let cancelled = false
    modelService
      .getModels()
      .then(list => {
        if (cancelled) return
        setModels(list)
        const firstEnabled = list.find(m => m.enabled)
        if (firstEnabled) setSelectedModelId(firstEnabled.id)
      })
      .catch(error => {
        if (cancelled) return
        console.error('Failed to load models:', error)
        setModels([])
        setLoadError(true)
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, reloadNonce])

  const isLoading = models === null
  // 仅列出已启用的模型作为可候选的默认模型；禁用模型无法成为有效默认。
  const enabledModels = (models ?? []).filter(m => m.enabled)
  const hasDisabledDefault = (models ?? []).some(m => m.isDefault && !m.enabled)
  const isSelectable = !isLoading && !loadError && enabledModels.length > 0

  const guideText = hasDisabledDefault
    ? '默认模型已被禁用，请从下方重新选择一个默认模型。'
    : '为保证智能体正常工作，请先选择一个默认模型。'

  /** 跳转到设置页的模型配置，并关闭本弹窗（复用设置页导航逻辑，额外确保右栏拉起）。 */
  const navigateToModels = () => {
    useChatStore.getState().openSettingsPanel('model')
    closeDialog()
  }

  const handleRetry = () => {
    setModels(null)
    setLoadError(false)
    setSelectedModelId('')
    setReloadNonce(n => n + 1)
  }

  const handleConfirm = async () => {
    if (!selectedModelId) return
    setIsSubmitting(true)
    try {
      await modelService.updateModel(selectedModelId, { isDefault: true })
      toast({ title: '已设为默认模型' })
      closeDialog()
    } catch (error) {
      console.error('Failed to set default model:', error)
      toast({
        title: '设置失败',
        description: '无法将所选模型设为默认，请稍后重试',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={open => {
        if (!open) closeDialog()
      }}
    >
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>配置默认模型</DialogTitle>
          <DialogDescription>
            智能体需要一个可用的默认模型才能正常对话与执行任务。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-1 min-h-[120px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <RotateCw className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">无法加载模型配置，请稍后重试。</p>
              <Button variant="outline" size="sm" onClick={handleRetry}>
                重试
              </Button>
            </div>
          ) : models.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Cpu className="h-7 w-7 text-primary" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">尚未配置任何模型</p>
                <p className="text-sm text-muted-foreground max-w-[260px]">
                  先添加一个模型配置，智能体才能正常对话与执行任务。
                </p>
              </div>
              <Button className="mt-2 gap-1.5" onClick={navigateToModels}>
                <Plus className="h-4 w-4" />
                前往设置添加模型
              </Button>
            </div>
          ) : enabledModels.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <PowerOff className="h-7 w-7 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">没有可用的已启用模型</p>
                <p className="text-sm text-muted-foreground max-w-[260px]">
                  请在设置中启用或添加一个模型，才能设置默认模型。
                </p>
              </div>
              <Button className="mt-2 gap-1.5" onClick={navigateToModels}>
                <Plus className="h-4 w-4" />
                前往设置
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{guideText}</p>
              <RadioGroup value={selectedModelId} onValueChange={setSelectedModelId}>
                {enabledModels.map(model => (
                  <div
                    key={model.id}
                    className={`flex items-center gap-3 rounded-md border p-3 transition-colors hover:bg-accent/50 ${
                      selectedModelId === model.id ? 'border-primary' : ''
                    }`}
                  >
                    <RadioGroupItem value={model.id} id={`default-model-${model.id}`} />
                    <Label
                      htmlFor={`default-model-${model.id}`}
                      className="flex-1 cursor-pointer text-sm font-normal"
                    >
                      {model.name}
                    </Label>
                    {model.isDefault && (
                      <Badge variant="secondary" className="text-xs">
                        默认
                      </Badge>
                    )}
                  </div>
                ))}
              </RadioGroup>
              <Separator className="my-1" />
              <p className="text-xs text-muted-foreground">
                保存后该模型将作为新默认模型，其余模型的默认标记会被自动清除。
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={closeDialog}>
            暂不配置
          </Button>
          {isSelectable && (
            <Button onClick={handleConfirm} disabled={isSubmitting || !selectedModelId}>
              {isSubmitting ? '设置中...' : '设为默认'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
