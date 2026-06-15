'use client'

import { useEffect } from 'react'
import { ConversationSidebar, ChatArea, RightPanel } from '@/components/chat'
import { useChatStore } from '@/lib/store'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'

export default function Home() {
  const { isSidebarOpen, isRightPanelOpen } = useChatStore()
  const isMobile = useIsMobile()

  // 全局初始化：拉取 agents 和 conversations，URL 无 agent 时默认选第一个
  useEffect(() => {
    useChatStore
      .getState()
      .fetchAgentsWithConversations()
      .then(() => {
        const state = useChatStore.getState()
        const urlAgentId = new URLSearchParams(window.location.search).get('agent')
        if (!state.currentAgentId && !urlAgentId) {
          const firstAgent = state.agents.find(a => a.status !== 'deleted')
          if (firstAgent) {
            state.setCurrentAgent(firstAgent.id)
          }
        }
      })
      .catch(err => {
        console.error('Failed to fetch agents:', err)
      })
  }, [])

  return (
    <main className="flex h-dvh overflow-hidden bg-background">
      {/* Conversation Sidebar - Hidden on mobile when closed */}
      <div
        className={cn(
          'shrink-0 transition-all duration-300 h-full flex flex-col',
          isMobile && !isSidebarOpen && 'hidden'
        )}
      >
        <ConversationSidebar />
      </div>

      {/* Main Content Area - ChatArea always rendered in same position */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel id="main" order={1} defaultSize={isRightPanelOpen ? 30 : 100} minSize={20}>
          <div className="h-full flex flex-col">
            <ChatArea />
          </div>
        </ResizablePanel>

        {isRightPanelOpen && (
          <>
            <ResizableHandle />
            <ResizablePanel id="right-panel" order={2} defaultSize={70} minSize={40} maxSize={80}>
              <RightPanel />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </main>
  )
}
