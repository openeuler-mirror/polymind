'use client'

import { ConversationSidebar, ChatArea, RightPanel } from '@/components/chat'
import { useChatStore } from '@/lib/store'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'

export default function Home() {
  const { isSidebarOpen, isRightPanelOpen } = useChatStore()
  const isMobile = useIsMobile()

  return (
    <main className="flex h-dvh overflow-hidden bg-background">
      {/* Conversation Sidebar - Hidden on mobile when closed */}
      <div
        className={cn(
          'shrink-0 transition-all duration-300',
          isMobile && !isSidebarOpen && 'hidden'
        )}
      >
        <ConversationSidebar />
      </div>

      {/* Main Content Area with Resizable Panels */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Chat Area - Flex grow to fill remaining space */}
        <ResizablePanel
          defaultSize={isRightPanelOpen ? 30 : 100}
          minSize={20}
          className={cn(isRightPanelOpen ? "" : "max-w-full")}
        >
          <div className="h-full flex flex-col">
            <ChatArea />
          </div>
        </ResizablePanel>

        {/* Resizable Handle - Only show when right panel is open */}
        {isRightPanelOpen && (
          <ResizableHandle />
        )}

        {/* Right Panel - Settings panel */}
        <ResizablePanel
          defaultSize={70}
          minSize={40}
          maxSize={80}
          className={cn(
            isRightPanelOpen ? 'block' : 'hidden',
            isMobile && 'hidden' // Hide on mobile for now
          )}
        >
          <RightPanel />
        </ResizablePanel>
      </ResizablePanelGroup>
    </main>
  )
}
