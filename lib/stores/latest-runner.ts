/**
 * 模块级“最新一次请求生效”并发控制器：
 * - 非 force 调用在已有请求在途时直接跳过（防轮询叠加）；
 * - force 调用总是发起新请求，旧请求的写操作通过 isLatest() 检查被丢弃；
 * - 只有最新请求的收尾才复位在途标记，避免旧请求提前复位导致并发交错。
 */
export function createLatestRunner() {
  let seq = 0
  let inFlight = false

  return {
    isInFlight: () => inFlight,

    async run(force: boolean, fn: (isLatest: () => boolean) => Promise<void>): Promise<void> {
      if (!force && inFlight) return
      inFlight = true
      const current = ++seq
      const isLatest = () => current === seq
      try {
        await fn(isLatest)
      } finally {
        if (isLatest()) {
          inFlight = false
        }
      }
    },
  }
}
