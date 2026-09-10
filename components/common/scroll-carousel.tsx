'use client'

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'

interface ScrollCarouselProps extends React.ComponentProps<'div'> {
  /**
   * 是否在左侧仍有未显示内容时显示左缘毛玻璃遮罩（默认关闭）。
   *
   * 默认只做右缘：滚到中间时左缘直接切边、翻页按钮压住的内容显得突兀，
   * 需要左右对称的场景（如输入框上方的模版墙）打开此项即可。
   */
  leftMask?: boolean
}

/** 边缘毛玻璃遮罩：模糊 + 背景色渐隐，让切边处过渡自然。 */
function EdgeMask({ side }: { side: 'left' | 'right' }) {
  const isLeft = side === 'left'
  return (
    <div
      aria-hidden
      data-slot={`scroll-carousel-mask-${side}`}
      className={cn(
        'pointer-events-none absolute inset-y-0 z-10 w-12',
        isLeft ? 'left-0' : 'right-0'
      )}
    >
      <div
        className={cn(
          'absolute inset-0 backdrop-blur-md',
          isLeft
            ? '[mask-image:linear-gradient(to_right,black,transparent)]'
            : '[mask-image:linear-gradient(to_left,black,transparent)]'
        )}
      />
      <div
        className={cn(
          'absolute inset-0 to-transparent from-background via-background/60',
          isLeft ? 'bg-gradient-to-r' : 'bg-gradient-to-l'
        )}
      />
    </div>
  )
}

/**
 * 单行横向滚动容器：隐藏原生滚动条，改用左右翻页按钮，边缘配毛玻璃遮罩。
 *
 * 智能体页的「精选智能体」与输入框上方的模版墙共用同一实现，保证两处滚动交互、
 * 溢出提示与视觉风格完全一致；此前两处各自手写，模版墙直接 flex-wrap 换行。
 *
 * 未溢出的方向不渲染遮罩、按钮以 visibility 隐藏（常驻 DOM，不卸载、不 disabled），
 * 因此条目很少时退化为一条普通静态排列，不会多出任何控件。
 *
 * 翻页按钮文案取 `common:action.scrollLeft/scrollRight`（通用动作词，不随调用方模块变化）：
 * 组件内自带 i18n 而不是由调用方传入，避免同一句话在每个调用点各抄一份、
 * 也避免漏传时静默退回硬编码中文。
 */
function ScrollCarousel({
  children,
  className,
  leftMask = false,
  ref,
  ...props
}: ScrollCarouselProps) {
  const { t } = useTranslation('common')
  const viewportRef = React.useRef<HTMLDivElement>(null)
  const trackRef = React.useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = React.useState(false)
  const [canScrollRight, setCanScrollRight] = React.useState(false)

  const syncScrollState = React.useCallback(() => {
    const el = viewportRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    setCanScrollLeft(el.scrollLeft > 1)
    setCanScrollRight(el.scrollLeft < maxScroll - 1)
  }, [])

  // 用 ResizeObserver 代替同步 setState：视口尺寸或内容宽度变化后自动重算按钮可见性
  // （容器随侧边栏开合、标签页切换改变宽度时也要重算）。
  React.useEffect(() => {
    const viewport = viewportRef.current
    const track = trackRef.current
    if (!viewport) return
    viewport.addEventListener('scroll', syncScrollState, { passive: true })
    // 先同步一次：测试环境没有 ResizeObserver，此时也能得到正确的初始状态。
    syncScrollState()
    if (typeof ResizeObserver === 'undefined') {
      return () => viewport.removeEventListener('scroll', syncScrollState)
    }
    const observer = new ResizeObserver(syncScrollState)
    observer.observe(viewport)
    if (track) observer.observe(track)
    return () => {
      viewport.removeEventListener('scroll', syncScrollState)
      observer.disconnect()
    }
  }, [syncScrollState])

  const pageBy = (direction: 1 | -1) => {
    const el = viewportRef.current
    if (!el) return
    // 一次翻约一屏（略小于一屏，露出下一条的边，提示还有更多）
    const step = Math.max(el.clientWidth * 0.85, 260)
    el.scrollBy({ left: direction * step, behavior: 'smooth' })
  }

  const arrowClassName =
    'absolute top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-accent'

  return (
    <div data-slot="scroll-carousel" className={cn('relative', className)} ref={ref} {...props}>
      <div
        ref={viewportRef}
        data-slot="scroll-carousel-viewport"
        className="overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div ref={trackRef} data-slot="scroll-carousel-track" className="flex gap-4">
          {children}
        </div>
      </div>

      {/* 边缘毛玻璃遮罩：各自只在对应方向还有未显示内容时出现 */}
      {leftMask && canScrollLeft && <EdgeMask side="left" />}
      {canScrollRight && <EdgeMask side="right" />}

      {/* 左右翻页按钮：常驻 DOM，无未显示内容时用 visibility 隐藏（不卸载、不 disabled） */}
      <button
        type="button"
        aria-label={t('action.scrollLeft')}
        onClick={() => pageBy(-1)}
        className={cn(arrowClassName, 'left-1', !canScrollLeft && 'invisible')}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label={t('action.scrollRight')}
        onClick={() => pageBy(1)}
        className={cn(arrowClassName, 'right-1', !canScrollRight && 'invisible')}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

export { ScrollCarousel }
