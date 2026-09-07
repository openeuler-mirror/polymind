'use client'

import type { LucideIcon } from 'lucide-react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

interface SidebarSectionProps {
  label: string
  /** 可选图标，未提供时仅展示文字标签，保持侧栏视觉克制。 */
  icon?: LucideIcon
  collapsed: boolean
  onToggle: () => void
  children: React.ReactNode
}

export function SidebarSection({
  label,
  icon: Icon,
  collapsed,
  onToggle,
  children,
}: SidebarSectionProps) {
  return (
    <Collapsible open={!collapsed} onOpenChange={onToggle} className="mb-4">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
        >
          {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" /> : null}
          {/* 标签与箭头放在同一内层 flex，让箭头紧贴文字，而非被 flex-1 推到最右侧。 */}
          <span className="flex min-w-0 flex-1 items-center gap-1">
            <span className="truncate text-left">{label}</span>
            <ChevronRight
              className={cn('h-3.5 w-3.5 shrink-0 transition-transform', !collapsed && 'rotate-90')}
            />
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-1 pt-1">{children}</CollapsibleContent>
    </Collapsible>
  )
}
