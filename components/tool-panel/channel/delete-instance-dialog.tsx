'use client'

import { useTranslation } from 'react-i18next'

import { ConfirmDestructiveDialog } from '@/components/common/confirm-destructive-dialog'
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

  const handleDelete = async (): Promise<boolean> => {
    if (!instance) return true
    try {
      await channelService.deleteInstance(instance.id)
      toast({ title: t('detail.deleteDialog.succeeded') })
      onDeleted()
      return true
    } catch (error) {
      console.error('Failed to delete channel instance:', error)
      toast({
        title: t('detail.deleteDialog.failed'),
        description: channelErrorMessage(t, error, t('common:status.error')),
        variant: 'destructive',
      })
      return false
    }
  }

  return (
    <ConfirmDestructiveDialog
      open={!!instance}
      title={t('detail.deleteDialog.title')}
      description={t('detail.deleteDialog.description', {
        name: displayName ?? instance?.id ?? '',
      })}
      confirmLabel={t('detail.deleteDialog.confirm')}
      pendingLabel={t('detail.deleteDialog.deleting')}
      onConfirm={handleDelete}
      onClose={onClose}
    />
  )
}
