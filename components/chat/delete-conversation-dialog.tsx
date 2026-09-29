'use client'

import { useTranslation } from 'react-i18next'

import { ConfirmDestructiveDialog } from '@/components/common/confirm-destructive-dialog'
import type { ConversationDeleteTarget } from '@/lib/types'

interface DeleteConversationDialogProps {
  target: ConversationDeleteTarget | null
  onClose: () => void
  onConfirm: () => Promise<boolean>
}

/**
 * 删除会话的统一二次确认对话框（普通会话行与定时任务会话行共用）：
 * - 默认展示会话标题 + 「删除后不可恢复」提示，避免误触直接硬删；
 * - 绑定定时任务的会话（scheduledTaskId 非空）升级为强提示：删除会话会连带
 *   删除该任务的执行记录（后端外键级联），必须显式告知。
 * 删除编排（本地条目 / 仅摘要条目两条路径）由调用方的 deleteConversationByTarget 负责。
 */
export function DeleteConversationDialog({
  target,
  onClose,
  onConfirm,
}: DeleteConversationDialogProps) {
  const { t } = useTranslation('chat')

  return (
    <ConfirmDestructiveDialog
      open={!!target}
      title={t('conversation.deleteDialog.title')}
      description={t('conversation.deleteDialog.description', { title: target?.title ?? '' })}
      warning={
        target?.scheduledTaskId ? t('conversation.deleteDialog.scheduledWarning') : undefined
      }
      pendingLabel={t('conversation.deleteDialog.deleting')}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  )
}
