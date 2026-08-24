import { appConfig } from '@/app/config'
import { sessionService } from '@/services/session-service'

/**
 * 内存级“待删除会话”集合，用于处理删除请求本身失败（网络/后端不可达）的边界。
 *
 * 后端删除成功后列表自然不再返回该会话；只有 HTTP 删除请求失败时才需要
 * 在本地暂时隐藏，并在下一次成功拉取到会话列表时补删一次。该集合不持久化、
 * 不参与定时任务级联删除，避免重蹈墓碑状态机的覆辙。
 */
const pendingDeletes = new Set<string>()

export function markSessionPendingDelete(sessionId: string): void {
  if (sessionId) pendingDeletes.add(sessionId)
}

export function isSessionPendingDelete(sessionId: string | undefined | null): boolean {
  return !!sessionId && pendingDeletes.has(sessionId)
}

export function clearSessionPendingDelete(sessionId: string): void {
  pendingDeletes.delete(sessionId)
}

/** 对服务端仍返回的待删除会话补删一次；成功或会话已消失后摘除。 */
export function retryPendingSessionDeletes(
  sessions: Array<{ agentId: string; sessionId: string }>
): void {
  if (appConfig.app.useMockData) return
  for (const { agentId, sessionId } of sessions) {
    if (!pendingDeletes.has(sessionId)) continue
    void sessionService
      .deleteSession(agentId, sessionId)
      .then(() => pendingDeletes.delete(sessionId))
      .catch(() => {
        // 仍失败：保留 pending，下次列表刷新再试。
      })
  }
}
