'use client'

import { SkillsPage } from '@/components/settings/skill'

/**
 * 技能面板页（右侧面板一等 tab）。
 * 业务内容直接复用设置里的 SkillsPage，这里只提供与 agent-page 对齐的页面骨架：
 * max-w-6xl 容器 + pt-6 区块。
 */
export function SkillPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto w-full max-w-6xl px-6 pb-10">
          <section className="pt-6">
            <SkillsPage />
          </section>
        </div>
      </div>
    </div>
  )
}
