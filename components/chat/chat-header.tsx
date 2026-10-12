'use client'

import type { ReactNode } from 'react'
import { PanelLeftOpen, Share2, MoreHorizontal, Moon, Sun, Monitor, Settings } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useTranslation } from 'react-i18next'
import { useChatStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { RightPanelToggle } from '../tool-panel'
import type { Conversation } from '@/lib/types'

interface ChatHeaderProps {
  conversation?: Conversation
  /** 消息区是否已滚动离开顶部：仅在滚动后显示底部下划线，最顶端时隐藏 */
  showBorder?: boolean
}

/**
 * 聊天区头部外壳（高度 h-14 / 56px、内边距、滚动后才显示的下划线）。
 * 消息态与欢迎态共用，避免两处各写一份样式后改一处漏一处。
 */
export function ChatHeaderBar({
  showBorder = false,
  children,
}: {
  showBorder?: boolean
  children: ReactNode
}) {
  return (
    <header
      className={cn(
        'flex h-14 shrink-0 items-center justify-between border-b pl-6 pr-4 transition-colors duration-200',
        // 始终保留 1px 边框占位，仅切换颜色，避免显隐时的高度抖动
        showBorder ? 'border-border/60' : 'border-transparent'
      )}
    >
      {children}
    </header>
  )
}

/** 侧边栏收起时的展开按钮（消息态与欢迎态头部共用）。 */
export function SidebarExpandButton() {
  const { t } = useTranslation('chat')
  const isSidebarOpen = useChatStore(state => state.isSidebarOpen)
  const toggleSidebar = useChatStore(state => state.toggleSidebar)

  // 侧边栏展开时无需入口，自身不渲染，调用方不必再判断状态。
  if (isSidebarOpen) return null

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            aria-label={t('header.expandSidebar')}
          >
            <PanelLeftOpen className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('header.expandSidebar')}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function ChatHeader({ conversation, showBorder = false }: ChatHeaderProps) {
  const { t } = useTranslation('chat')
  const { theme, setTheme } = useTheme()

  return (
    <ChatHeaderBar showBorder={showBorder}>
      <div className="flex items-center gap-4">
        <SidebarExpandButton />

        <h1 className="text-base font-semibold">
          {conversation?.title || t('header.newConversation')}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <TooltipProvider delayDuration={0}>
          {/* Share */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon">
                <Share2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('header.share')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* More Options */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                {theme === 'dark' ? (
                  <Moon className="mr-2 h-4 w-4" />
                ) : theme === 'light' ? (
                  <Sun className="mr-2 h-4 w-4" />
                ) : (
                  <Monitor className="mr-2 h-4 w-4" />
                )}
                {t('header.theme')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                  <DropdownMenuRadioItem value="light">
                    <Sun className="mr-2 h-4 w-4" />
                    {t('header.themeLight')}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <Moon className="mr-2 h-4 w-4" />
                    {t('header.themeDark')}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">
                    <Monitor className="mr-2 h-4 w-4" />
                    {t('header.themeSystem')}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                useChatStore.getState().openSettingsDialog()
              }}
            >
              <Settings className="mr-2 h-4 w-4" />
              {t('header.settings')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <RightPanelToggle />
      </div>
    </ChatHeaderBar>
  )
}
