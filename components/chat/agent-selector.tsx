'use client'

import { useState } from 'react'
import { Bot, Check, ChevronDown, Plus } from 'lucide-react'
import { useChatStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'

export function AgentSelector() {
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
  } = useChatStore()

  const currentAgent = agents.find(a => a.id === currentAgentId)
  const availableAgents = agents.filter(a => a.status !== 'deleted')

  const handleSelectAgent = (agentId: string) => {
    setCurrentAgent(agentId)
    setOpen(false)
  }

  const handleCreateAgent = () => {
    localStorage.setItem('agentIsCreating', 'true')
    triggerAgentCreate()

    addRightPanelTab({ id: 'agent', name: '智能体', icon: Bot, color: 'text-cyan-500' })
    setActiveRightPanelTab('agent')

    if (!isRightPanelOpen) {
      toggleRightPanel()
    }

    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex w-full items-center gap-1 px-4 py-2.5 text-sm',
            'border-b border-border',
            'hover:bg-accent/50 transition-colors',
            'rounded-t-2xl'
          )}
        >
          <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className={cn(
            'flex-1 text-left truncate',
            !currentAgent && 'text-muted-foreground'
          )}>
            {currentAgent ? '@' + currentAgent.name : '选择智能体'}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start" side="top" sideOffset={8}>
        <Command value={currentAgentId || undefined}>
          <CommandList>
            <CommandGroup heading="智能体">
              {availableAgents.length === 0 ? (
                <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                  暂无智能体
                </div>
              ) : (
                availableAgents.map((agent) => (
                  <CommandItem
                    key={agent.id}
                    value={agent.id}
                    onSelect={() => handleSelectAgent(agent.id)}
                    className="flex items-center gap-1"
                  >
                    <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate">{agent.name}</span>
                    {agent.id === currentAgentId && (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </CommandItem>
                ))
              )}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                onSelect={handleCreateAgent}
                className="flex items-center justify-center gap-1 text-primary"
              >
                <Plus className="h-4 w-4 text-primary shrink-0" />
                <span>创建 Agent</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
