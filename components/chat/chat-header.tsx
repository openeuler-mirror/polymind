'use client'

import { useState, useEffect } from 'react'
import {
  PanelLeftOpen,
  Share2,
  MoreHorizontal,
  Download,
  Trash2,
  Moon,
  Sun,
  Monitor,
  PanelRight,
  Settings,
} from 'lucide-react'
import { useTheme } from 'next-themes'
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

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { RightPanelToggle } from '../tool-panel'
import type { Conversation } from '@/lib/types'

interface ChatHeaderProps {
  conversation?: Conversation
}



export function ChatHeader({ conversation }: ChatHeaderProps) {
  const { theme, setTheme } = useTheme()
  const [isHydrated, setIsHydrated] = useState(false)
  const {
    isSidebarOpen,
    toggleSidebar,
    currentConversationId,
    deleteConversation,
  } = useChatStore()
  
  useEffect(() => {
    setIsHydrated(true)
  }, [])

  return (
    <header className="flex h-14 items-center justify-between px-4">
      <div className="flex items-center gap-3">
        {!isSidebarOpen && (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={toggleSidebar}>
                  <PanelLeftOpen className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>展开侧边栏</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}


        <div className="flex flex-col">
          <h1 className="text-sm font-semibold">
            {!isHydrated ? '新对话' : (conversation?.title || '新对话')}
          </h1>
          <span className="text-xs text-muted-foreground">
            {!isHydrated ? '0 条消息' : `${conversation?.messages.length || 0} 条消息`}
          </span>
        </div>
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
            <TooltipContent>分享对话</TooltipContent>
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
                主题
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                  <DropdownMenuRadioItem value="light">
                    <Sun className="mr-2 h-4 w-4" />
                    浅色
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <Moon className="mr-2 h-4 w-4" />
                    深色
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">
                    <Monitor className="mr-2 h-4 w-4" />
                    跟随系统
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Download className="mr-2 h-4 w-4" />
              导出对话
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                const { isRightPanelOpen, toggleRightPanel, addRightPanelTab, setActiveRightPanelTab, activeRightPanelTab, rightPanelTabs } = useChatStore.getState();
                if (!isRightPanelOpen) {
                  toggleRightPanel();
                }
                // 保存当前活跃标签页
                const otherTabs = rightPanelTabs.filter(tab => tab.id !== 'settings');
                if (otherTabs.length > 0) {
                  // 这里可以通过状态管理来保存，或者在 right-panel.tsx 中通过 useEffect 处理
                }
                addRightPanelTab({ id: 'settings', name: '设置', icon: Settings, color: 'text-gray-500' });
                setActiveRightPanelTab('settings');
              }}
            >
              <Settings className="mr-2 h-4 w-4" />
              设置
            </DropdownMenuItem>
            <DropdownMenuItem 
              className="text-destructive focus:text-destructive"
              onClick={() => {
                if (currentConversationId) {
                  deleteConversation(currentConversationId);
                }
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              删除对话
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        
        <RightPanelToggle />
      </div>
    </header>
  )
}
