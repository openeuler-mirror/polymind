'use client'

import { memo } from 'react'
import { cn } from '@/lib/utils'

/**
 * ShimmerText — 生成态文字扫光（「生成回复中」/「深度思考」）。
 *
 * 性能要点（实测：主线程每 200ms 被占满 120ms 的压力下）
 * - 只动画 `transform`：动画跑在合成器线程，主线程被 React 重渲染占满时依然不掉帧
 *   （实测 0 dropped frames；旧实现 mask-position 动画掉 69/187 帧，每帧重绘）。
 * - 不用 mask-position / background-position / background-clip:text —— 这些属性每帧都要
 *   主线程重绘文字，是流式输出场景下卡顿的根因。
 */
export const ShimmerText = memo(function ShimmerText({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  return (
    <span className={cn('shimmer', className)}>
      <span className="shimmer__base">{text}</span>
      <span className="shimmer__window" aria-hidden="true">
        <span className="shimmer__copy">{text}</span>
      </span>
    </span>
  )
})
