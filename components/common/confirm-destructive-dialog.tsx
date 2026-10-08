'use client'

import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export interface ConfirmDestructiveDialogProps {
  /** 是否打开；关闭时机由父组件持有（父组件把 target 置空）。 */
  open: boolean
  title: ReactNode
  /**
   * 主描述。调用方用 t(key, { name }) 插值传入，不要传含标签的字符串：
   * Trans 会把插值结果里的 <br>/<strong>/<i>/<p> 当作 HTML 解析成真实元素。
   */
  description: ReactNode
  /** 可选强提示（如级联删除的补充说明），展示在描述下方。 */
  warning?: ReactNode
  /**
   * 执行删除：返回 false 表示失败（失败提示由调用方负责），对话框保持打开以便重试。
   * 抛出异常按同样语义处理，不会产生未处理的 Promise 拒绝。
   */
  onConfirm: () => Promise<boolean>
  onClose: () => void
  /** 按钮文案，默认取 common:action.cancel / common:action.delete。 */
  cancelLabel?: ReactNode
  confirmLabel?: ReactNode
  /** 删除进行中的确认按钮文案。 */
  pendingLabel?: ReactNode
}

/**
 * 删除类操作的统一二次确认对话框：AlertDialog 骨架、删除中状态、遮罩/Esc 防误关、
 * 失败留在原地重试等交互只在这里实现一次，会话 / 定时任务 / 渠道实例删除入口共用。
 */
export function ConfirmDestructiveDialog({
  open,
  title,
  description,
  warning,
  onConfirm,
  onClose,
  cancelLabel,
  confirmLabel,
  pendingLabel,
}: ConfirmDestructiveDialogProps) {
  const { t } = useTranslation('common')
  const [pending, setPending] = useState(false)

  const handleConfirm = async () => {
    setPending(true)
    try {
      if (await onConfirm()) onClose()
    } catch (error) {
      // 契约是返回 false 表示失败；抛错按同样语义处理，避免静默的未处理拒绝，
      // 并让对话框留在原地供用户重试（失败提示由调用方负责）。
      console.error('[ConfirmDestructiveDialog] confirm failed:', error)
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={nextOpen => {
        // 删除进行中不允许点击遮罩/Esc 关闭，避免请求在途时让用户误以为已取消。
        if (!nextOpen && !pending) onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {description}
            {warning ? (
              <span className="mt-2 block font-medium text-destructive">{warning}</span>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {cancelLabel ?? t('action.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={event => {
              // Radix 的 Action 默认点击即关闭；这里改为等待 onConfirm 的结果再决定。
              event.preventDefault()
              void handleConfirm()
            }}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pending ? (pendingLabel ?? t('action.delete')) : (confirmLabel ?? t('action.delete'))}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
