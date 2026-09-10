'use client'

import { PanelLeftOpen, Share2, MoreHorizontal, Moon, Sun, Monitor, Settings } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useTranslation } from 'react-i18next'
import { useChatStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
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
}

export function ChatHeader({ conversation }: ChatHeaderProps) {
  const { t } = useTranslation('chat')
  const { theme, setTheme } = useTheme()
  const { isSidebarOpen, toggleSidebar } = useChatStore()

  return (
    <header className="flex h-16 items-center justify-between pl-6 pr-4">
      <div className="flex items-center gap-4">
        {!isSidebarOpen && (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={toggleSidebar}>
                  <PanelLeftOpen className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('header.expandSidebar')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

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
                useChatStore.getState().openSettingsPanel()
              }}
            >
              <Settings className="mr-2 h-4 w-4" />
              {t('header.settings')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <RightPanelToggle />
      </div>
    </header>
  )
}
