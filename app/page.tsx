'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConversationSidebar, ChatArea, RightPanel } from '@/components/chat'
import { useChatStore } from '@/lib/store'
import { clampSidebarWidth, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from '@/lib/stores/ui-store'
import { AgentStatus } from '@/lib/types'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { modelService } from '@/services/model-service'
import { DefaultModelDialog } from '@/components/settings/model/default-model-dialog'
import { SettingsDialog } from '@/components/settings'

/** 键盘调整侧边栏宽度的步长 */
const SIDEBAR_RESIZE_STEP = 16

export default function Home() {
  const isSidebarOpen = useChatStore(state => state.isSidebarOpen)
  const isRightPanelOpen = useChatStore(state => state.isRightPanelOpen)
  const sidebarWidth = useChatStore(state => state.sidebarWidth)
  const setSidebarWidth = useChatStore(state => state.setSidebarWidth)
  const isMobile = useIsMobile()
  const { t } = useTranslation('chat')

  // 拖拽中的实时宽度只放组件本地：既避免逐帧同步落盘 localStorage，也避免把每次指针移动
  // 广播给所有 store 订阅者（拖拽结束才由 setSidebarWidth 一次性提交并持久化）。
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const dragWidthRef = useRef(0)
  const isResizingSidebar = dragWidth !== null
  const displayWidth = dragWidth ?? sidebarWidth

  // 拖拽侧边栏右缘调整宽度：指针移动直接映射为宽度（侧栏贴左缘，clientX 即宽度），
  // 收敛由 clampSidebarWidth 统一处理；拖拽期间禁用过渡避免跟手迟滞。
  useEffect(() => {
    if (!isResizingSidebar) return
    const handlePointerMove = (event: PointerEvent) => {
      const next = clampSidebarWidth(event.clientX)
      dragWidthRef.current = next
      setDragWidth(next)
    }
    const stopResizing = () => {
      setDragWidth(null)
      setSidebarWidth(dragWidthRef.current)
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResizing)
    // pointercancel：指针被系统接管（触屏滑动、窗口失焦等）时不会再有 pointerup，
    // 没有兜底会让「拖拽中」状态与 body 光标永久卡住。
    window.addEventListener('pointercancel', stopResizing)
    const prevCursor = document.body.style.cursor
    const prevUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopResizing)
      window.removeEventListener('pointercancel', stopResizing)
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevUserSelect
    }
  }, [isResizingSidebar, setSidebarWidth])

  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    setSidebarWidth(
      displayWidth + (event.key === 'ArrowLeft' ? -SIDEBAR_RESIZE_STEP : SIDEBAR_RESIZE_STEP)
    )
  }

  // 挂载后恢复持久化的侧边栏 UI（宽度 / 折叠状态）；首帧保持默认以规避水合不一致。
  useEffect(() => {
    useChatStore.getState().hydrateSidebarUI()
  }, [])

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
        const hasConfiguredDefault = models.some(m => m.enabled && m.isDefault)
        // 复用同一次请求结果：既决定是否拉起首检弹窗，也作为模版引导气泡的「已配置默认模型」依据。
        useChatStore.getState().setHasConfiguredDefaultModel(hasConfiguredDefault)
        if (!hasConfiguredDefault) {
          useChatStore.getState().openDefaultModelDialog()
        }
      })
      .catch(err => {
        // 模型加载失败时静默降级：不弹窗、不打断首页初始化。
        console.error('Failed to fetch models:', err)
      })
  }, [])

  // 外壳用侧栏灰底：内容区（chat / 右侧面板）作为浮起的圆角卡片落在外壳上
  return (
    <main className="flex h-dvh overflow-hidden bg-sidebar">
      {/* Conversation Sidebar - Hidden on mobile when closed */}
      <div
        className={cn(
          'shrink-0 h-full flex flex-col overflow-hidden',
          !isResizingSidebar && 'transition-[width] duration-300',
          isMobile && !isSidebarOpen && 'hidden'
        )}
        style={{ width: isSidebarOpen ? displayWidth : 0 }}
      >
        <ConversationSidebar />
      </div>

      {/* Sidebar resize handle - 拖拽或方向键调整侧栏宽度（移动端不显示） */}
      {isSidebarOpen && !isMobile && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t('header.resizeSidebar')}
          aria-valuenow={displayWidth}
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuemax={SIDEBAR_MAX_WIDTH}
          tabIndex={0}
          onPointerDown={event => {
            event.preventDefault()
            // 捕获指针：拖到窗口外或经过子元素时仍能收到 pointermove / pointerup。
            event.currentTarget.setPointerCapture(event.pointerId)
            dragWidthRef.current = sidebarWidth
            setDragWidth(sidebarWidth)
          }}
          onKeyDown={handleResizeKeyDown}
          className={cn(
            'relative w-px shrink-0 cursor-col-resize transition-colors',
            'after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2',
            'focus-visible:outline-none focus-visible:bg-primary/60',
            isResizingSidebar ? 'bg-primary/60' : 'hover:bg-primary/40'
          )}
        />
      )}

      {/* Main Content Area - ChatArea always rendered in same position */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel id="main" order={1} defaultSize={isRightPanelOpen ? 50 : 100} minSize={20}>
          <div className="h-full flex flex-col">
            <ChatArea />
          </div>
        </ResizablePanel>

        {isRightPanelOpen && (
          <>
            {/* 不用实体分割线：两张卡片之间的 1px 间隙直接露出外壳灰底，顶部圆角处自然过渡，
                不会出现「线冒出到背景」的突兀感；hover 时才高亮提示可拖拽 */}
            <ResizableHandle className="bg-transparent transition-colors hover:bg-primary/40" />
            <ResizablePanel id="right-panel" order={2} defaultSize={50} minSize={40} maxSize={60}>
              <RightPanel />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      {/* 默认模型首检弹窗（F1）：无有效默认模型时首次进首页拉起 */}
      <DefaultModelDialog />

      {/* 设置弹窗：通用 / 模型 / 关于（入口：侧边栏 footer、chat-header 下拉、业务页跳转） */}
      <SettingsDialog />
    </main>
  )
}
