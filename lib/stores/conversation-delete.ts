import { appConfig } from '@/app/config'
import { useChatStore } from '@/lib/store'
import { abortScheduledRunForSession } from '@/lib/stores/scheduled-run-controller'
import { refreshScheduledAfterConversationDelete } from '@/lib/stores/scheduled-task-store'
import { sessionService } from '@/services/session-service'
import type { ConversationDeleteTarget } from '@/lib/types'

/**
 * 删除会话（侧栏「删除」确认框的唯一入口）。
 *
 * 两类删除对象共用同一条编排，避免组件层各自实现一套后端真相规则：
 * - 已加载到本地的会话：交给 chat store 的 deleteConversation（后端成功才移除本地，
 *   mock 模式跳过后端；定时会话在 store 内中止挂流），并刷新对应任务列表；
 * - 只存在于后端摘要中的定时会话：本地无条目可移除，直接删后端 session
 *   （成功后由外键级联清理 run 记录），中止本地挂流并强制刷新任务列表。
 *
 * 返回 false 表示删除失败（后端失败、mock 模式下的结论一致），调用方负责提示并保持确认框打开。
 */
export async function deleteConversationByTarget(
  target: ConversationDeleteTarget
): Promise<boolean> {
  const state = useChatStore.getState()
  const existing = state.conversations.find(
    c => (!!target.sessionId && c.sessionId === target.sessionId) || c.id === target.id
  )

  if (existing) {
    const deleted = await state.deleteConversation(existing.id)
    if (!deleted) return false
    // 定时会话：服务端已连带删除执行记录，刷新可丢弃在途轮询与缓存。
    refreshScheduledAfterConversationDelete(existing)
    return true
  }

  // 落到这里说明本地没有该会话的条目，只有带齐定位信息才可能删得动；
  // 否则视为失败（而不是静默当作成功），避免用户看到确认框关闭、条目却仍在。
  if (!target.agentId || !target.sessionId) {
    console.warn(
      '[conversation-delete] skip delete: no local conversation and incomplete target',
      target.id
    )
    return false
  }

  const sessionId = target.sessionId
  if (!appConfig.app.useMockData) {
    try {
      await sessionService.deleteSession(target.agentId, sessionId)
    } catch (error) {
      console.error('Failed to delete scheduled conversation:', error)
      return false
    }
  }
  // 后端删除成功后才中止本地挂流：失败时保留挂流，让用户能重试而不是留下半截状态。
  abortScheduledRunForSession(sessionId)
  refreshScheduledAfterConversationDelete(target)
  return true
}
