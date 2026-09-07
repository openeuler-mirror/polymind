import { handleStreamEvent } from '@/lib/stream-event-handler'
import { useChatStore } from '@/lib/store'
import { useScheduledTaskStore } from '@/lib/stores/scheduled-task-store'
import { MessageStatus } from '@/lib/types'
import { generateUUID } from '@/lib/utils'
import { messageService } from '@/services/message-service'
import { sessionService } from '@/services/session-service'
import { registerScheduledRunController } from '@/lib/stores/scheduled-run-controller'
import {
  runStatusToMessageStatus,
  scheduledTaskService,
  type ScheduledTask,
  type ScheduledTaskRun,
} from '@/services/scheduled-task-service'

/** 订阅执行事件流时，等待后端建流的总体上限（建流通常在数秒内完成）。 */
const STREAM_ATTACH_TIMEOUT_MS = 30_000
/** 后端流未激活时的重试间隔。 */
const STREAM_ATTACH_INTERVAL_MS = 1_000
/** 单次挂流请求“无任何事件”的最大等待时间，防止错过结束哨兵的挂死请求卡住状态。 */
const STREAM_ATTACH_ATTEMPT_TIMEOUT_MS = 15_000
/** 事件流终止事件集合：命中即认为会话消息已由流事件收尾。 */
const TERMINAL_EVENT_TYPES = new Set([
  'message.completed',
  'turn.completed',
  'stream.error',
  'client.error',
])

export interface RunToastOptions {
  title: string
  description?: string
  variant?: 'default' | 'destructive'
}

export type RunToast = (options: RunToastOptions) => void

interface SubscribeRunStreamOptions {
  task: ScheduledTask
  run: ScheduledTaskRun
  agentId: string
  sessionId: string
  conversationId: string
  assistantMessageId: string
  /** 调用方取消（如任务被删除）时中止挂流与收尾写入。 */
  signal?: AbortSignal
}

/** 会话是否仍存在于最新 store 状态（任务删除/清理后应停止一切写入）。 */
function conversationStillExists(conversationId: string): boolean {
  return !!useChatStore.getState().conversations.find(c => c.id === conversationId)
}

/**
 * 订阅定时任务执行的事件流，把执行过程实时渲染进会话。
 * 后端在 run 接口返回后才开始建流，存在短暂时序窗口；挂不上时按 run 状态有限重试，
 * 流结束后以服务端持久化内容回填，避免遗留“执行中”的空消息。
 */
async function subscribeRunStream(options: SubscribeRunStreamOptions) {
  const { task, run, agentId, sessionId, conversationId, assistantMessageId, signal } = options
  const deadline = Date.now() + STREAM_ATTACH_TIMEOUT_MS
  let terminalApplied = false
  let appliedAny = false

  const handleEvent = (eventData: any) => {
    if (!eventData?.type) return
    appliedAny = true
    if (TERMINAL_EVENT_TYPES.has(eventData.type)) terminalApplied = true
    const store = useChatStore.getState()
    handleStreamEvent(
      eventData,
      conversationId,
      assistantMessageId,
      store.updateMessage,
      store.setStreaming
    )
  }

  try {
    while (Date.now() < deadline) {
      if (signal?.aborted) break
      let events: unknown[] = []
      try {
        events = await messageService.reconnectStream(
          agentId,
          sessionId,
          handleEvent,
          STREAM_ATTACH_ATTEMPT_TIMEOUT_MS,
          signal
        )
      } catch (error) {
        // 已消费到事件后不再重试：后端 reconnect 会重放整段 buffer，
        // 而 delta 类事件是追加式更新，重试会把已渲染内容重复拼接。
        if (appliedAny) break
        if (signal?.aborted) break
        // 单次挂流失败（网络/HTTP 错误）不中断：按 run 状态决定重试或兜底。
        console.warn('Scheduled task stream attach failed, will retry:', error)
      }
      // 已消费到事件（正常结束或出错）即停止重试，避免重放 buffer 造成消息内容重复。
      if (events.length > 0) break
      // 状态查询失败（网络错误）与 404（run 已删除，getTaskRun 返回 null）必须区分：
      let runEnded: boolean
      try {
        const runState = await scheduledTaskService.getTaskRun(task.id, run.id)
        runEnded = runState === null || runState.status !== 'running'
      } catch (error) {
        console.warn('Scheduled task run status lookup failed, will retry:', error)
        runEnded = false
      }
      if (runEnded) break
      // 取消时退出重试，走收尾释放逻辑；会话已被清理（任务删除触发的 purge）则
      // 直接返回——会话已不存在，无需任何收尾写入。
      if (signal?.aborted) break
      if (!conversationStillExists(conversationId)) return
      await new Promise(resolve => setTimeout(resolve, STREAM_ATTACH_INTERVAL_MS))
    }
  } catch (error) {
    // 极端情况下循环自身出错也不能让状态卡死，继续走下面的收尾逻辑。
    console.error('Unexpected error while subscribing to run stream:', error)
  }

  // 调用方已取消（任务删除/面板关闭）：不再回填/合并，仅放开 skipReconnect，
  // 会话再次打开时由 ChatArea 自行重连恢复内容；若会话已随删除被 purge，
  // 该写入为空操作。
  const latest = useChatStore.getState()
  if (signal?.aborted) {
    latest.updateMessage(conversationId, assistantMessageId, { skipReconnect: false })
    return
  }

  // 无论挂流成功与否，都以服务端持久化内容为准收尾，避免遗留“执行中”的空消息。
  // 收尾查询失败（网络错误）≠ run 已删除（404 时 getTaskRun 返回 null 而非抛错）：
  // 网络失败时 run 可能仍在执行，保守保留占位消息与已渲染内容，仅放开
  // skipReconnect 交给 ChatArea 重连兜底，绝不删除本地内容。
  let runState: ScheduledTaskRun | null
  try {
    runState = await scheduledTaskService.getTaskRun(task.id, run.id)
  } catch (error) {
    console.error('Failed to fetch final run state for scheduled task:', error)
    latest.updateMessage(conversationId, assistantMessageId, { skipReconnect: false })
    return
  }
  // 收尾前用最新 state 重新校验会话仍存在：run 执行期间任务可能被删除
  // （purge 已移除本地会话），此时不再回填/合并，避免把已删除会话重建为孤儿占位。
  const conv = useChatStore.getState().conversations.find(c => c.id === conversationId)
  if (!conv?.sessionId) return

  if (!runState || runState.status !== 'running') {
    // run 已结束（或已不存在）：确保占位助手消息不残留“执行中”状态。
    if (!terminalApplied) {
      // 未消费到终止事件（如 skipped/校验失败/挂流超时/run 已删除）：
      // 先用服务端消息回填；后端若也没有消息，删除占位消息并清除流式状态。
      // 会话详情拉取失败（网络错误）与“后端没有消息”同样分开处理：
      // 前者保留占位消息（由下方 run 终态更新收尾），后者才删除占位。
      let detail: Awaited<ReturnType<typeof sessionService.getConversation>> | null = null
      let detailFetchFailed = false
      if (runState) {
        try {
          detail = await sessionService.getConversation(agentId, conv.sessionId)
        } catch (error) {
          detailFetchFailed = true
          console.error('Failed to fetch conversation for scheduled run backfill:', error)
        }
      }
      if (detail && (detail.messages || []).length > 0) {
        // getConversation 在途期间会话仍可能被清理，写入前再次校验。
        if (!conversationStillExists(conversationId)) return
        // 后台回填不切换用户当前会话，避免“查看执行过程”时聊天区被强制跳转。
        await latest.refreshConversation(agentId, conv.sessionId, {
          scheduledTaskId: task.id,
          activate: false,
        })
      } else if (!detailFetchFailed) {
        latest.deleteMessage(conversationId, assistantMessageId)
        latest.setStreaming(conversationId, false)
      }
    }
    if (runState && conversationStillExists(conversationId)) {
      // 用 run 的最终状态收尾助手消息，覆盖“无消息/事件未消费”等收不到终止事件的场景。
      latest.updateMessage(conversationId, assistantMessageId, {
        status: runStatusToMessageStatus(runState.status),
        isStreaming: false,
      })
      latest.setStreaming(conversationId, false)
    }
    // 事件已消费但缺终止事件时，同样放开 skipReconnect，让 ChatArea 可兜底恢复。
    latest.updateMessage(conversationId, assistantMessageId, { skipReconnect: false })
  } else {
    // run 仍在执行：订阅已放弃，放开 skipReconnect，用户打开会话时由
    // ChatArea 的重连逻辑补挂事件流（重连前会清空本地内容，不会重复拼接）。
    latest.updateMessage(conversationId, assistantMessageId, { skipReconnect: false })
  }
}

/**
 * 触发一次定时任务“立刻执行”：
 * 先建真实会话并把任务内容作为用户消息，再调用 run 接口；
 * 后端返回 skipped（任务/agent 忙碌）时清理会话并提示，不留下死会话。
 * 成功触发后返回取消函数，调用方可在任务被删除等场景中止挂流。
 */
export async function triggerScheduledTaskRun(
  task: ScheduledTask,
  toast: RunToast
): Promise<(() => void) | undefined> {
  const state = useChatStore.getState()
  const agent = state.agents.find(item => item.id === task.agent_id)
  if (!agent) {
    toast({
      title: '错误',
      description: '执行智能体不存在，请先确认任务配置',
      variant: 'destructive',
    })
    return
  }

  const controller = new AbortController()
  let conversationId: string | null = null
  try {
    // 先建真实会话：任务内容作为用户消息，后续执行过程通过 SSE 实时回流。
    // agentName 统一用“定时”而非真实 agent 名：与刷新后侧栏摘要条目的兜底一致，
    const session = await state.createNewSession(task.agent_id)
    conversationId = state.createLocalConversation(task.agent_id, '定时', session.id)
    state.setCurrentConversation(conversationId)
    state.addMessage(conversationId, {
      id: generateUUID(),
      role: 'user',
      content: task.content,
      timestamp: new Date(),
    })
    const assistantMessageId = generateUUID()
    state.addMessage(conversationId, {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
      // 事件流由 subscribeRunStream 统一驱动，避免 ChatArea 重连逻辑
      // 再挂一路导致同一事件被重复应用。
      skipReconnect: true,
      status: MessageStatus.GENERATING,
    })
    state.setStreaming(conversationId, true)

    const run = await scheduledTaskService.runTask(task.id, session.id)
    if (run.status === 'skipped') {
      // 任务/agent 忙碌：后端不会使用本次创建的会话，清理本地与会话服务端的
      // 空会话，避免留下“只有用户消息”的死会话和孤儿会话。
      console.warn('Scheduled task run was skipped:', run.error ?? run.status)
      await state.deleteConversation(conversationId)
      // 立即刷新任务列表，让“已跳过”记录尽快出现在执行记录页。
      void useScheduledTaskStore.getState().refresh(true)
      toast({
        title: '执行已跳过',
        description: '任务或智能体忙碌，本次未执行，请稍后重试',
      })
      return
    }

    // 会话已由后端标记为该任务的执行记录，本地同步打标，
    // 侧边栏立即按“定时任务”条目展示，不等会话列表轮询。
    state.markConversationScheduled(conversationId, task.id)
    toast({
      title: '成功',
      description: `已触发「${task.name}」执行，对话已加入左侧列表`,
    })
    // 立即拉一次任务列表，让侧栏的定时任务条目尽快出现，不必等 10s 轮询。
    void useScheduledTaskStore.getState().refresh(true)
    // 登记本次挂流控制器，供删除任务时统一中止；挂流收尾（完成/取消）后自动注销。
    const deregister = registerScheduledRunController(task.id, session.id, controller)
    void subscribeRunStream({
      task,
      run,
      agentId: task.agent_id,
      sessionId: session.id,
      conversationId,
      assistantMessageId,
      signal: controller.signal,
    }).finally(deregister)
    // 返回取消函数：任务被删除时由调用方中止挂流，避免对已清理上下文继续请求。
    return () => controller.abort()
  } catch (error) {
    console.error('Failed to run scheduled task:', error)
    if (conversationId) {
      // 触发失败时清理本地与会话服务端的空会话，避免残留。
      void useChatStore.getState().deleteConversation(conversationId)
    }
    toast({
      title: '错误',
      description: '触发执行失败',
      variant: 'destructive',
    })
  }
}
