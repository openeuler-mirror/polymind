'use client'

import { useState } from 'react'
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
import { useToast } from '@/hooks/use-toast'
import { channelService, type ChannelInstance } from '@/services/channel-service'
import { channelErrorMessage } from './utils'

interface DeleteChannelInstanceDialogProps {
  instance: ChannelInstance | null
  /** 列表展示名（渠道展示名兜底），由页面算好传入避免重复依赖 catalog。 */
  displayName?: string
  onClose: () => void
  onDeleted: () => void
}

/**
 * 删除渠道实例的二次确认：删除会断开连接并清除路由与凭据，
 * 恢复必须重新接入（特性设计文档 6.2 的第三级兜底）。
 */
export function DeleteChannelInstanceDialog({
  instance,
  displayName,
  onClose,
  onDeleted,
}: DeleteChannelInstanceDialogProps) {
  const { t } = useTranslation('channel')
  const { toast } = useToast()
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!instance) return
    setDeleting(true)
    try {
      await channelService.deleteInstance(instance.id)
      toast({ title: t('detail.deleteDialog.succeeded') })
      onDeleted()
      onClose()
    } catch (error) {
      console.error('Failed to delete channel instance:', error)
      toast({
        title: t('detail.deleteDialog.failed'),
        description: channelErrorMessage(t, error, t('common:status.error')),
        variant: 'destructive',
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AlertDialog
      open={!!instance}
      onOpenChange={open => {
        if (!open) onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('detail.deleteDialog.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('detail.deleteDialog.description', { name: displayName ?? instance?.id ?? '' })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>{t('common:action.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={event => {
              event.preventDefault()
              void handleDelete()
            }}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? t('detail.deleteDialog.deleting') : t('detail.deleteDialog.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
