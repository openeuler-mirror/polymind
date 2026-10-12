'use client'

import type { ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { X, LayoutGrid, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'
import { getPanelTabMeta, PANEL_TAB_META, PANEL_TAB_IDS } from '@/lib/panel-tabs'
import { AgentPage } from './agent-page'
import { CvePage } from './cve-page'
import { BackportPage } from './backport-page'
import { InsightPage } from './insight-page'
import { ScheduledTaskPage } from './scheduled-task'
import { ChannelPage } from './channel'
import { SkillPage } from './skill-page'
import { McpPanelPage } from './mcp-page'
import { ArtifactPreviewPanel } from '@/components/artifact/artifact-preview-panel'

/** 右侧面板注册表：新增面板只需在这里注册一行，避免逐层嵌套三元。 */
const PANEL_PAGES: Record<string, ComponentType> = {
  agent: AgentPage,
  insight: InsightPage,
  cve: CvePage,
  backport: BackportPage,
  'scheduled-tasks': ScheduledTaskPage,
  channels: ChannelPage,
  artifacts: ArtifactPreviewPanel,
  skills: SkillPage,
  mcp: McpPanelPage,
}

function PanelContent({ tabId, tabName }: { tabId: string; tabName?: string }) {
  const { t } = useTranslation('tool-panel')
  const Page = PANEL_PAGES[tabId]
  if (Page) return <Page />
  return (
    <div className="p-4">
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            {t('rightPanel.pagePlaceholder', { name: tabName })}
          </p>
        </div>
      </div>
    </div>
  )
}

/** tab 元信息统一查 PANEL_TAB_META；name 经 i18nKey 翻译，icon/color 取注册值。 */
function useTabMeta(tabId: string) {
  const { t } = useTranslation('tool-panel')
  const meta = getPanelTabMeta(tabId)
  return {
    icon: meta?.icon,
    color: meta?.color ?? '',
    name: meta ? t(meta.i18nKey) : undefined,
  }
}

function PanelTabButton({
  tabId,
  fallbackName,
  isActive,
  onSelect,
  onClose,
}: {
  tabId: string
  fallbackName: string
  isActive: boolean
  onSelect: () => void
  onClose: () => void
}) {
  const meta = useTabMeta(tabId)
  const { t } = useTranslation('tool-panel')
  const Icon = meta.icon
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1 rounded-md text-sm whitespace-nowrap cursor-pointer',
        isActive ? 'bg-accent' : 'hover:bg-accent/50'
      )}
      onClick={onSelect}
    >
      {Icon && <Icon className={cn('h-4 w-4', meta.color)} />}
      <span>{meta.name ?? fallbackName}</span>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('rightPanel.closeTab', { name: meta.name ?? fallbackName })}
        className="h-6 w-6"
        onClick={e => {
          e.stopPropagation()
          onClose()
        }}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  )
}

export function RightPanel() {
  const { t } = useTranslation('tool-panel')
  const {
    isRightPanelOpen,
    rightPanelTabs,
    activeRightPanelTab,
    removeRightPanelTab,
    setActiveRightPanelTab,
    openPanelTab,
  } = useChatStore()

  if (!isRightPanelOpen) {
    return null
  }

  const handleCloseTab = (tabId: string) => {
    removeRightPanelTab(tabId)
  }

  const openTabIds = new Set(rightPanelTabs.map(tab => tab.id))
  const allToolsOpen = PANEL_TAB_IDS.every(id => openTabIds.has(id))

  return (
    <div className="flex h-full flex-col border-l border-border bg-background">
      {/* Tabs */}
      <div className="border-b border-border px-4 py-2 flex items-center gap-2 overflow-x-auto flex-shrink-0 min-h-[44px]">
        <div className="flex items-center gap-2">
          {rightPanelTabs.map(tab => (
            <PanelTabButton
              key={tab.id}
              tabId={tab.id}
              fallbackName={tab.name}
              isActive={activeRightPanelTab === tab.id}
              onSelect={() => setActiveRightPanelTab(tab.id)}
              onClose={() => handleCloseTab(tab.id)}
            />
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                <Plus className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {allToolsOpen ? (
                <div className="px-4 py-2 text-sm text-muted-foreground">
                  {t('rightPanel.allToolsOpen')}
                </div>
              ) : (
                PANEL_TAB_IDS.filter(tabId => !openTabIds.has(tabId)).map(tabId => {
                  const meta = PANEL_TAB_META[tabId]
                  return (
                    <DropdownMenuItem key={tabId} onClick={() => openPanelTab(tabId)}>
                      <meta.icon className={cn('h-4 w-4 mr-2', meta.color)} />
                      {t(meta.i18nKey)}
                    </DropdownMenuItem>
                  )
                })
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Content */}
      {activeRightPanelTab ? (
        <div className="flex-1 h-full min-h-0">
          <PanelContent
            tabId={activeRightPanelTab}
            tabName={rightPanelTabs.find(tab => tab.id === activeRightPanelTab)?.name}
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-xs">
            <div className="text-center mb-8">
              <p className="text-sm text-muted-foreground">{t('rightPanel.emptyHint')}</p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {PANEL_TAB_IDS.map(tabId => {
                const meta = PANEL_TAB_META[tabId]
                return (
                  <Button
                    key={tabId}
                    variant="outline"
                    className="flex flex-col items-center justify-center gap-2 p-4 h-24 w-full"
                    onClick={() => openPanelTab(tabId)}
                  >
                    <meta.icon className={cn('h-6 w-6', meta.color)} />
                    <span className="text-xs">{t(meta.i18nKey)}</span>
                  </Button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function RightPanelToggle() {
  const { t } = useTranslation('tool-panel')
  const { isRightPanelOpen, toggleRightPanel } = useChatStore()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleRightPanel}
      className={cn('transition-colors', 'hover:bg-accent')}
    >
      {isRightPanelOpen ? <ChevronRight className="h-5 w-5" /> : <LayoutGrid className="h-5 w-5" />}
      <span className="sr-only">{t('rightPanel.toggle')}</span>
    </Button>
  )
}
