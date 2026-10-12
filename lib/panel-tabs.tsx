import type { LucideIcon } from 'lucide-react'
import {
  Bot,
  Activity,
  Bug,
  Wrench,
  Clock,
  MessagesSquare,
  Package,
  Sparkles,
  Plug,
} from 'lucide-react'

/**
 * 右侧面板 tab 的共享注册表。
 *
 * tab 元信息（icon / color / 文案 i18nKey）唯一来源：右侧面板工具集、
 * ui-store 的 openPanelTab / openArtifactPanel、侧边栏 nav 全部查这张表，
 * 新增 tab 只需在此注册一行 + 在 PANEL_PAGES 注册页面组件。
 */
export interface PanelTabMeta {
  icon: LucideIcon
  color: string
  i18nKey: string
}

/** 已注册的 tab id 联合类型：作为注册表键与新 tab 的唯一约束来源。 */
export type PanelTabId =
  | 'agent'
  | 'insight'
  | 'cve'
  | 'backport'
  | 'scheduled-tasks'
  | 'channels'
  | 'artifacts'
  | 'skills'
  | 'mcp'

export const PANEL_TAB_META: Record<PanelTabId, PanelTabMeta> = {
  agent: { icon: Bot, color: 'text-cyan-500', i18nKey: 'rightPanel.tools.agent' },
  insight: { icon: Activity, color: 'text-emerald-500', i18nKey: 'rightPanel.tools.insight' },
  cve: { icon: Bug, color: 'text-rose-500', i18nKey: 'rightPanel.tools.cve' },
  backport: { icon: Wrench, color: 'text-blue-500', i18nKey: 'rightPanel.tools.backport' },
  'scheduled-tasks': {
    icon: Clock,
    color: 'text-violet-500',
    i18nKey: 'rightPanel.tools.scheduledTasks',
  },
  channels: {
    icon: MessagesSquare,
    color: 'text-teal-500',
    i18nKey: 'rightPanel.tools.channels',
  },
  artifacts: { icon: Package, color: 'text-orange-500', i18nKey: 'rightPanel.tools.artifacts' },
  skills: { icon: Sparkles, color: 'text-amber-500', i18nKey: 'rightPanel.tools.skills' },
  mcp: { icon: Plug, color: 'text-sky-500', i18nKey: 'rightPanel.tools.mcp' },
}

/** 全部 tab id：决定「+」下拉与空态网格的展示顺序。 */
export const PANEL_TAB_IDS: PanelTabId[] = [
  'agent',
  'channels',
  'scheduled-tasks',
  'insight',
  'cve',
  'backport',
  'artifacts',
  'skills',
  'mcp',
]

/**
 * 按 id 安全查表：rightPanelTabs 的 id 来自持久化/外部，类型上只是 string，
 * 未注册时返回 undefined，由渲染层降级处理。
 */
export function getPanelTabMeta(tabId: string): PanelTabMeta | undefined {
  return Object.prototype.hasOwnProperty.call(PANEL_TAB_META, tabId)
    ? PANEL_TAB_META[tabId as PanelTabId]
    : undefined
}
