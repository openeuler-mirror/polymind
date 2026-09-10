'use client'

/**
 * 欢迎页主视觉。
 * Agent 模版快捷墙已移至 chat-input.tsx（输入框上方左对齐展示），
 * 这里只保留标题与引导文案，保持整体居中。
 */
export function WelcomeScreen() {
  return (
    <div className="flex w-full flex-col items-center gap-6 text-center">
      <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
        欢迎使用 PolyMind
      </h1>
      <p className="max-w-md text-sm text-muted-foreground text-balance sm:text-base">
        选择一个 Agent 模版快速开始，或直接输入你的问题
      </p>
    </div>
  )
}
