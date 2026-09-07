/**
 * 定时任务“立刻执行”在途挂流的取消控制器注册表（模块级单例，非响应式状态）。
 *
 * - 每次触发执行都会登记一个 AbortController，删除任务或停止生成时统一中止。
 * - 挂流收尾（成功/失败/取消）后通过返回的注销函数移除，避免集合持续膨胀。
 * - 注销时做身份校验，防止“旧 run 的迟到注销”误删新 run 的登记。
 */
const runControllersByTask = new Map<string, Set<AbortController>>()
const runControllersBySession = new Map<string, Set<AbortController>>()

function addToIndex(
  index: Map<string, Set<AbortController>>,
  key: string,
  controller: AbortController
): Set<AbortController> {
  let controllers = index.get(key)
  if (!controllers) {
    controllers = new Set()
    index.set(key, controllers)
  }
  controllers.add(controller)
  return controllers
}

function removeFromIndex(
  index: Map<string, Set<AbortController>>,
  key: string,
  expected: Set<AbortController>,
  controller: AbortController
): void {
  const current = index.get(key)
  if (current !== expected) return
  current.delete(controller)
  if (current.size === 0) index.delete(key)
}

/**
 * 登记某任务的一次执行挂流控制器，返回注销函数。
 * 调用方需在挂流收尾后调用一次注销。
 */
export function registerScheduledRunController(
  taskId: string,
  sessionId: string,
  controller: AbortController
): () => void {
  const taskSet = addToIndex(runControllersByTask, taskId, controller)
  const sessionSet = addToIndex(runControllersBySession, sessionId, controller)
  return () => {
    // abortScheduledTaskRuns/abortScheduledRunForSession 会删除整个 Set；
    // 这里按引用校验，避免旧 run 的注销误删新 run 的登记。
    removeFromIndex(runControllersByTask, taskId, taskSet, controller)
    removeFromIndex(runControllersBySession, sessionId, sessionSet, controller)
  }
}

/** 中止某任务全部进行中的挂流（删除任务前调用），并清空其登记。 */
export function abortScheduledTaskRuns(taskId: string): void {
  const controllers = runControllersByTask.get(taskId)
  if (!controllers) return
  for (const controller of controllers) controller.abort()
  runControllersByTask.delete(taskId)
}

/** 中止指定会话进行中的定时挂流（停止生成按钮调用），并清空其登记。 */
export function abortScheduledRunForSession(sessionId: string): void {
  const controllers = runControllersBySession.get(sessionId)
  if (!controllers) return
  for (const controller of controllers) controller.abort()
  runControllersBySession.delete(sessionId)
}
