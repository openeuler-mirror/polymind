'use client'

import { ConversationSidebar, ChatArea } from '@/components/chat'
import { useChatStore } from '@/lib/store'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

export default function Home() {
  const { isSidebarOpen } = useChatStore()
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

      {/* Chat Area - Flex grow to fill remaining space */}
      <div className="flex min-w-0 flex-1 flex-col">
        <ChatArea />
      </div>

    </main>
  )
}
