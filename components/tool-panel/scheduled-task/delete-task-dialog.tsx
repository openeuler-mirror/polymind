'use client'

import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'

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
 * 封装 deleteTaskAndPurge 调用、删除中状态与结果提示；
 * 后端在任务运行中拒绝删除（409 TASK_BUSY）时给出专属提示。
 */
export function DeleteScheduledTaskDialog({ task, onClose }: DeleteScheduledTaskDialogProps) {
  const { t } = useTranslation('tool-panel')
  const { toast } = useToast()
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!task) return
    setDeleting(true)
    try {
      await useScheduledTaskStore.getState().deleteTaskAndPurge(task.id)
      toast({
        title: t('scheduledTask.delete.deletedTitle'),
        description: t('scheduledTask.delete.deletedDescription', { name: task.name }),
      })
      onClose()
    } catch (error) {
      console.error('Failed to delete scheduled task:', error)
      const isBusy = error instanceof ApiError && error.statusCode === 409
      toast({
        title: isBusy
          ? t('scheduledTask.delete.busyTitle')
          : t('scheduledTask.delete.failedTitle'),
        description: isBusy
          ? t('scheduledTask.delete.busyDescription')
          : t('scheduledTask.delete.failedDescription'),
        variant: 'destructive',
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AlertDialog
      open={!!task}
      onOpenChange={open => {
        if (!open) onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('scheduledTask.delete.dialogTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            <Trans
              i18nKey="scheduledTask.delete.dialogDescription"
              ns="tool-panel"
              values={{ name: task ? task.name : '' }}
              shouldUnescape={false}
            />
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
            {deleting ? t('scheduledTask.delete.deleting') : t('common:action.delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
