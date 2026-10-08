'use client'

import { useTranslation } from 'react-i18next'

import { ConfirmDestructiveDialog } from '@/components/common/confirm-destructive-dialog'
import { useToast } from '@/hooks/use-toast'
import { ApiError } from '@/lib/error-handler'
import { useScheduledTaskStore } from '@/lib/stores/scheduled-task-store'
import type { ScheduledTask } from '@/services/scheduled-task-service'

interface DeleteScheduledTaskDialogProps {
  /** 待删除的任务；为 null 时对话框关闭。 */
  task: ScheduledTask | null
  onClose: () => void
}

/**
 * 删除定时任务的统一确认对话框（侧栏文件夹与任务管理页共用）：
 * 封装 deleteTaskAndPurge 调用与结果提示；
 * 后端在任务运行中拒绝删除（409 TASK_BUSY）时给出专属提示。
 */
export function DeleteScheduledTaskDialog({ task, onClose }: DeleteScheduledTaskDialogProps) {
  const { t } = useTranslation('tool-panel')
  const { toast } = useToast()

  const handleDelete = async (): Promise<boolean> => {
    if (!task) return true
    try {
      await useScheduledTaskStore.getState().deleteTaskAndPurge(task.id)
      toast({
        title: t('scheduledTask.delete.deletedTitle'),
        description: t('scheduledTask.delete.deletedDescription', { name: task.name }),
      })
      return true
    } catch (error) {
      console.error('Failed to delete scheduled task:', error)
      const isBusy = error instanceof ApiError && error.statusCode === 409
      toast({
        title: isBusy ? t('scheduledTask.delete.busyTitle') : t('scheduledTask.delete.failedTitle'),
        description: isBusy
          ? t('scheduledTask.delete.busyDescription')
          : t('scheduledTask.delete.failedDescription'),
        variant: 'destructive',
      })
      return false
    }
  }

  return (
    <ConfirmDestructiveDialog
      open={!!task}
      title={t('scheduledTask.delete.dialogTitle')}
      description={t('scheduledTask.delete.dialogDescription', { name: task?.name ?? '' })}
      pendingLabel={t('scheduledTask.delete.deleting')}
      onConfirm={handleDelete}
      onClose={onClose}
    />
  )
}
