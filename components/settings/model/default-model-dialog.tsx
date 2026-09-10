'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Cpu, Info, Loader2, Plus, PowerOff, RotateCw } from 'lucide-react'
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
import { modelService } from '@/services/model-service'
import { ModelConfig } from '@/lib/types'
import { useChatStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

/** 空/异常态统一样式：圆形图标 + 标题 + 说明 + 可选操作。 */
function StateBlock({
  icon,
  iconClassName,
  title,
  description,
}: {
  icon: React.ReactNode
  iconClassName?: string
  title: string
  description?: string
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <div
        className={cn(
          'flex h-12 w-12 items-center justify-center rounded-full',
          iconClassName ?? 'bg-muted text-muted-foreground'
        )}
      >
        {icon}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {description && (
          <p className="mx-auto max-w-[280px] text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * 默认模型首检弹窗。
 *
 * - 打开时机：首次进入首页，判定不存在「enabled && isDefault」的模型时拉起。
 * - 规则：可跳过（"暂不配置"），不持久化"不再提示"，下次进首页仍弹；配置成功后关闭。
 * - 每次打开都现取模型列表，避免"前端以为有默认、后端已删"的缓存错位。
 */
export function DefaultModelDialog() {
  const { t } = useTranslation('settings')
  const isOpen = useChatStore(state => state.isDefaultModelDialogOpen)
  const closeDialog = useChatStore(state => state.closeDefaultModelDialog)
  const setHasConfiguredDefaultModel = useChatStore(state => state.setHasConfiguredDefaultModel)
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

  const guideText = hasDisabledDefault
    ? t('defaultModelDialog.guideDisabledDefault')
    : t('defaultModelDialog.guideSelectDefault')

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
      toast({ title: t('defaultModelDialog.toast.success') })
      // 先关弹窗再置位：判定会跳过「弹窗打开中」，否则引导气泡不会立即出现。
      closeDialog()
      setHasConfiguredDefaultModel(true)
    } catch (error) {
      console.error('Failed to set default model:', error)
      toast({
        title: t('defaultModelDialog.toast.failed'),
        description: t('defaultModelDialog.toast.failedDesc'),
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
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Cpu className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1.5 pt-0.5">
              <DialogTitle>{t('defaultModelDialog.title')}</DialogTitle>
              <DialogDescription className="text-xs leading-relaxed">
                {t('defaultModelDialog.description')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-[150px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-xs">{t('defaultModelDialog.loading')}</span>
            </div>
          ) : loadError ? (
            <StateBlock
              icon={<RotateCw className="h-5 w-5" />}
              title={t('defaultModelDialog.loadErrorTitle')}
              description={t('defaultModelDialog.loadErrorDescription')}
            />
          ) : models.length === 0 ? (
            <StateBlock
              icon={<Cpu className="h-5 w-5" />}
              iconClassName="bg-primary/10 text-primary"
              title={t('defaultModelDialog.emptyTitle')}
              description={t('defaultModelDialog.emptyDescription')}
            />
          ) : enabledModels.length === 0 ? (
            <StateBlock
              icon={<PowerOff className="h-5 w-5" />}
              title={t('defaultModelDialog.noEnabledTitle')}
              description={t('defaultModelDialog.noEnabledDescription')}
            />
          ) : (
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-muted-foreground">{guideText}</p>
              <RadioGroup
                value={selectedModelId}
                onValueChange={setSelectedModelId}
                className="max-h-[264px] gap-2 overflow-y-auto scrollbar-thin pr-0.5"
              >
                {enabledModels.map(model => {
                  const active = selectedModelId === model.id
                  return (
                    <div
                      key={model.id}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border p-3 transition-colors',
                        active ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/50'
                      )}
                    >
                      <RadioGroupItem value={model.id} id={`default-model-${model.id}`} />
                      {/* 整行点击交给原生 label：无需在非交互容器上挂 onClick，键盘/读屏语义天然正确 */}
                      <Label
                        htmlFor={`default-model-${model.id}`}
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 font-normal"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{model.name}</span>
                          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                            {model.provider}
                          </span>
                        </span>
                        {model.isDefault && (
                          <Badge variant="secondary" className="shrink-0 px-2 py-0.5 text-[11px]">
                            {t('defaultModelDialog.currentDefault')}
                          </Badge>
                        )}
                        {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
                      </Label>
                    </div>
                  )
                })}
              </RadioGroup>
              <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{t('defaultModelDialog.note')}</span>
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          {isLoading ? null : loadError ? (
            <Button onClick={handleRetry}>{t('defaultModelDialog.action.retry')}</Button>
          ) : models.length === 0 ? (
            <Button className="gap-1.5" onClick={navigateToModels}>
              <Plus className="h-4 w-4" />
              {t('defaultModelDialog.action.goToAddModel')}
            </Button>
          ) : enabledModels.length === 0 ? (
            <Button className="gap-1.5" onClick={navigateToModels}>
              <Plus className="h-4 w-4" />
              {t('defaultModelDialog.action.goToSettings')}
            </Button>
          ) : (
            <Button onClick={handleConfirm} disabled={isSubmitting || !selectedModelId}>
              {isSubmitting
                ? t('defaultModelDialog.action.submitting')
                : t('defaultModelDialog.action.setDefault')}
            </Button>
          )}
          <Button variant="outline" onClick={closeDialog}>
            {t('defaultModelDialog.action.skip')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
