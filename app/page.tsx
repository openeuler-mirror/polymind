'use client'

import { useEffect } from 'react'
import { ConversationSidebar, ChatArea, RightPanel } from '@/components/chat'
import { useChatStore } from '@/lib/store'
import { AgentStatus } from '@/lib/types'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { modelService } from '@/services/model-service'
import { DefaultModelDialog } from '@/components/settings/model/default-model-dialog'

export default function Home() {
  const { isSidebarOpen, isRightPanelOpen } = useChatStore()
  const isMobile = useIsMobile()

  // 全局初始化：拉取 agents 和 conversations，URL 无 agent 时默认选第一个
  // 并行拉取模型配置，用于"默认模型首检弹窗"判定（F1）
  useEffect(() => {
    useChatStore
      .getState()
      .fetchAgentsWithConversations()
      .then(() => {
        const state = useChatStore.getState()
        const urlAgentId = new URLSearchParams(window.location.search).get('agent')
        if (!state.currentAgentId && !urlAgentId) {
          const firstAgent = state.agents.find(a => a.status !== AgentStatus.DELETED)
          if (firstAgent) {
            state.setCurrentAgent(firstAgent.id)
          }
        }
      })
      .catch(err => {
        console.error('Failed to fetch agents:', err)
      })

    modelService
      .getModels()
      .then(models => {
        const hasActiveDefault = models.some(m => m.enabled && m.isDefault)
        if (!hasActiveDefault) {
          useChatStore.getState().openDefaultModelDialog()
        }
      })
      .catch(err => {
        // 模型加载失败时静默降级：不弹窗、不打断首页初始化。
        console.error('Failed to fetch models:', err)
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
        <ResizablePanel id="main" order={1} defaultSize={isRightPanelOpen ? 50 : 100} minSize={20}>
          <div className="h-full flex flex-col">
            <ChatArea />
          </div>
        </ResizablePanel>

        {isRightPanelOpen && (
          <>
            <ResizableHandle />
            <ResizablePanel id="right-panel" order={2} defaultSize={50} minSize={40} maxSize={70}>
              <RightPanel />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      {/* 默认模型首检弹窗（F1）：无有效默认模型时首次进首页拉起 */}
      <DefaultModelDialog />
    </main>
  )
}
