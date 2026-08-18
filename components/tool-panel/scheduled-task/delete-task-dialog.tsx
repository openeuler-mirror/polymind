'use client'

import { useState } from 'react'

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
  const { toast } = useToast()
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!task) return
    setDeleting(true)
    try {
      await useScheduledTaskStore.getState().deleteTaskAndPurge(task.id)
      toast({
        title: '已删除',
        description: `定时任务「${task.name}」及其会话、执行记录已删除`,
      })
      onClose()
    } catch (error) {
      console.error('Failed to delete scheduled task:', error)
      const isBusy = error instanceof ApiError && error.statusCode === 409
      toast({
        title: isBusy ? '任务运行中' : '删除失败',
        description: isBusy ? '该任务正在执行，请稍后再试' : '删除定时任务失败',
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
          <AlertDialogTitle>删除定时任务</AlertDialogTitle>
          <AlertDialogDescription>
            确定要删除「{task?.name}
            」吗？删除后任务将不再调度，其全部会话与执行记录将一并删除，且不可恢复。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={event => {
              event.preventDefault()
              void handleDelete()
            }}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? '删除中...' : '删除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
