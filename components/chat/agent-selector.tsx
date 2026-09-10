'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, Check, ChevronDown, Settings, Loader2 } from 'lucide-react'
import { useChatStore } from '@/lib/store'
import { AgentStatus } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'

interface AgentSelectorProps {
  /**
   * compact 模式：渲染为输入框右下角的一个内联小按钮（图标 + 名称 + 下拉箭头），
   * 用于聊天输入框底栏；默认（bar）渲染为输入框顶部的整行选择栏。
   */
  compact?: boolean
}

export function AgentSelector({ compact = false }: AgentSelectorProps) {
  const { t } = useTranslation('chat')
  const [open, setOpen] = useState(false)
  const {
    agents,
    currentAgentId,
    setCurrentAgent,
    isRightPanelOpen,
    toggleRightPanel,
    addRightPanelTab,
    setActiveRightPanelTab,
    triggerAgentCreate,
    isAgentsLoading,
  } = useChatStore()

  const currentAgent = agents.find(a => a.id === currentAgentId)
  const availableAgents = agents.filter(a => a.status !== 'deleted')

  const getStatusText = (status: string) => {
    switch (status) {
      case AgentStatus.RUNNING:
        return t('agentSelector.status.running')
      case AgentStatus.PAUSED:
        return t('agentSelector.status.paused')
      case AgentStatus.ERROR:
        return t('agentSelector.status.error')
      default:
        return status
    }
  }

  const isAgentDisabled = (status: string) => {
    const s = status.toLowerCase()
    return s === AgentStatus.PAUSED || s === AgentStatus.ERROR
  }

  const handleSelectAgent = (agentId: string) => {
    const agent = agents.find(a => a.id === agentId)
    if (agent && isAgentDisabled(agent.status)) return
    setCurrentAgent(agentId)
    setOpen(false)
  }

  const handleCreateAgent = () => {
    localStorage.setItem('agentIsCreating', 'true')
    triggerAgentCreate()

    addRightPanelTab({
      id: 'agent',
      name: t('sidebar.panelTab.agent'),
      icon: Bot,
      color: 'text-cyan-500',
    })
    setActiveRightPanelTab('agent')

    if (!isRightPanelOpen) {
      toggleRightPanel()
    }

    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {compact ? (
          <button
            className={cn(
              'inline-flex h-8 max-w-[190px] items-center gap-1.5 rounded-full px-3 text-sm',
              'transition-colors hover:bg-accent/60 hover:text-accent-foreground'
            )}
          >
            <span className={cn('truncate', !currentAgent && 'text-muted-foreground')}>
              {currentAgent ? '@' + currentAgent.name : t('agentSelector.selectAgent')}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        ) : (
          <button
            className={cn(
              'flex w-full items-center gap-1 px-4 py-2.5 text-sm',
              'border-b border-border',
              'hover:bg-accent/50 transition-colors',
              'rounded-t-2xl'
            )}
          >
            <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
            <span
              className={cn('flex-1 text-left truncate', !currentAgent && 'text-muted-foreground')}
            >
              {currentAgent ? '@' + currentAgent.name : t('agentSelector.selectAgent')}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        className="w-[280px] p-0"
        align={compact ? 'end' : 'start'}
        side="top"
        sideOffset={8}
      >
        <Command value={currentAgentId || undefined}>
          <CommandList>
            <CommandGroup heading={t('agentSelector.heading')}>
              {isAgentsLoading ? (
                <div className="px-2 py-4 flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                  <span className="text-sm text-muted-foreground">
                    {t('agentSelector.loading')}
                  </span>
                </div>
              ) : availableAgents.length === 0 ? (
                <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                  {t('agentSelector.empty')}
                </div>
              ) : (
                availableAgents.map(agent => {
                  const disabled = isAgentDisabled(agent.status)
                  return (
                    <CommandItem
                      key={agent.id}
                      value={agent.id}
                      disabled={disabled}
                      onSelect={() => {
                        if (disabled) return
                        handleSelectAgent(agent.id)
                      }}
                      className="flex items-center gap-1.5"
                    >
                      {/* 左侧编组：图标 + 名称 */}
                      <Bot
                        className={cn(
                          'h-4 w-4 shrink-0',
                          disabled ? 'text-muted-foreground/50' : 'text-muted-foreground'
                        )}
                      />
                      <span className="flex-1 truncate min-w-0">{agent.name}</span>
                      {/* 右侧编组：状态胶囊 + 勾选占位（固定宽度，保证右边缘对齐） */}
                      <div className="flex items-center gap-1 shrink-0">
                        <span
                          className={cn(
                            'shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium leading-none',
                            agent.status.toLowerCase() === AgentStatus.RUNNING &&
                              'bg-green-500/5 text-green-600 dark:bg-green-500/10 dark:text-green-400',
                            agent.status.toLowerCase() === AgentStatus.PAUSED &&
                              'bg-amber-500/5 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
                            agent.status.toLowerCase() === AgentStatus.ERROR &&
                              'bg-red-500/5 text-red-600 dark:bg-red-500/10 dark:text-red-400'
                          )}
                        >
                          {getStatusText(agent.status)}
                        </span>
                        <Check
                          className={cn(
                            'h-4 w-4 shrink-0',
                            agent.id === currentAgentId ? 'text-primary' : 'invisible'
                          )}
                        />
                      </div>
                    </CommandItem>
                  )
                })
              )}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem onSelect={handleCreateAgent} className="flex items-center gap-1.5">
                <Settings className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate min-w-0">{t('agentSelector.createAgent')}</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
