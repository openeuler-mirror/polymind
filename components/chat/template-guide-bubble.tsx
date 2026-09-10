'use client'

import { useEffect, useMemo } from 'react'
import type { RefObject } from 'react'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'
import { getTemplateHintAnchor } from '@/lib/stores/onboarding-store'

/**
 * 首次配置完默认模型后的模版引导气泡。
 *
 * - 挂载位置：ChatArea 欢迎态（空会话）分支，与模版墙同屏。
 * - 锚点：AgentTemplateChips 注册到 store 的模版墙根节点，通过 Radix Popover 的
 *   virtualRef 跨子树定位，布局变化（侧栏/右栏开合）时由 floating-ui 自动跟随。
 * - 可见性完全由 OnboardingSlice 判定，本组件不持有任何持久化逻辑。
 * - 只由显式操作收起：点「知道了」或点模版。页面其它位置的点击一律不关闭——
 *   引导只会展示一次，被一次误点吃掉就再也看不到了。
 */
export function TemplateGuideBubble() {
  const visible = useChatStore(state => state.templateHintVisible)
  const anchorReady = useChatStore(state => state.templateHintAnchorReady)
  const dismissTemplateHint = useChatStore(state => state.dismissTemplateHint)
  const evaluateTemplateHint = useChatStore(state => state.evaluateTemplateHint)
  // 锚点本体在模块级 ref（store 不持有 DOM 节点），仅在就绪标志为真时读取
  const anchorEl = anchorReady ? getTemplateHintAnchor() : null

  // 欢迎态重建（例如从会话返回）时补一次判定：条件可能已在此前齐备。
  useEffect(() => {
    evaluateTemplateHint()
  }, [evaluateTemplateHint])

  // 卸载（离开欢迎态）时复位可见性：气泡已不在 DOM 中，避免 store 里留下永久的 visible=true。
  // 以「锚点是否仍注册」区分真实卸载与 StrictMode 的开发期假卸载：假卸载后锚点会被立刻重新注册，
  // 此时若复位，引导就被消费掉却一次都没显示过。
  useEffect(
    () => () => {
      if (!getTemplateHintAnchor()) dismissTemplateHint()
    },
    [dismissTemplateHint]
  )

  // Radix 用 virtualRef 指向跨子树的锚点元素；仅在 anchorEl 非空时渲染，故此处断言安全。
  const virtualRef = useMemo(() => ({ current: anchorEl }) as RefObject<HTMLElement>, [anchorEl])

  if (!visible || !anchorEl) return null

  return (
    <Popover
      open
      onOpenChange={open => {
        if (!open) dismissTemplateHint()
      }}
    >
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent
        side="top"
        align="start"
        sideOffset={12}
        collisionPadding={12}
        aria-label="模版使用引导"
        // 气泡只是提示，不抢占输入框焦点。
        onOpenAutoFocus={event => event.preventDefault()}
        // 点击页面其它位置不关闭气泡（默认行为会让一次误点永久消耗掉这次引导）。
        onInteractOutside={event => event.preventDefault()}
        className="group w-auto max-w-[320px] rounded-2xl border-primary/20 p-0 shadow-xl shadow-primary/5"
      >
        {/* 顶部渐变高光，让提示卡有层次；圆角与卡片一致，避免高光溢出圆角 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-14 rounded-t-2xl bg-gradient-to-b from-primary/10 to-transparent" />
        <div className="relative p-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold leading-snug">试试点一个模版开始</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              点任意模版即可一键创建对应的 Agent，并直接开始对话。
            </p>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[11px] leading-none text-muted-foreground/70">仅提示一次</span>
            <Button
              size="sm"
              className="h-7 rounded-full px-3 text-xs"
              onClick={dismissTemplateHint}
            >
              知道了
            </Button>
          </div>
        </div>
        {/* 小三角：旋转 45° 的方块只描两条相邻边，与卡片底边拼成缺口；
            纯 fill 的白色三角在浅色背景上看不见，所以用描边而非填充来呈现。 */}
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute h-2.5 w-2.5 rotate-45 rounded-[2px] border-primary/20 bg-popover',
            'group-data-[side=top]:-bottom-[5px] group-data-[side=top]:left-7 group-data-[side=top]:border-b group-data-[side=top]:border-r',
            'group-data-[side=bottom]:-top-[5px] group-data-[side=bottom]:left-7 group-data-[side=bottom]:border-t group-data-[side=bottom]:border-l',
            'group-data-[side=left]:-right-[5px] group-data-[side=left]:top-7 group-data-[side=left]:border-b group-data-[side=left]:border-l',
            'group-data-[side=right]:-left-[5px] group-data-[side=right]:top-7 group-data-[side=right]:border-t group-data-[side=right]:border-r'
          )}
        />
      </PopoverContent>
    </Popover>
  )
}
