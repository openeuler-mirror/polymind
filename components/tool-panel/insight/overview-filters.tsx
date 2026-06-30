'use client'

import { Clock3, RefreshCw, TimerReset } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { InsightRangePreset } from '@/hooks/insight/use-overview'
import { cn } from '@/lib/utils'

interface InsightOverviewFiltersProps {
  agents: Array<{ witty_agent_id: string; witty_agent_name: string }>
  lastUpdatedLabel: string
  loading: boolean
  onAgentChange: (value: string) => void
  onPresetChange: (value: InsightRangePreset) => void
  onRefresh: () => void
  queryLabel: string
  rangePresets: Array<{ id: InsightRangePreset; label: string }>
  refreshing: boolean
  selectedPreset: InsightRangePreset
  selectedWittyAgentId: string
}

export function InsightOverviewFilters({
  agents,
  lastUpdatedLabel,
  loading,
  onAgentChange,
  onPresetChange,
  onRefresh,
  queryLabel,
  rangePresets,
  refreshing,
  selectedPreset,
  selectedWittyAgentId,
}: InsightOverviewFiltersProps) {
  return (
    <Card className="gap-3 py-3">
      <CardHeader className="gap-1.5 pb-1">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="min-w-0 flex-1 text-base">总览筛选</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading || refreshing}
            className="min-w-[108px]"
          >
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            {refreshing ? '刷新中' : '刷新'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
        <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-2">
            <div className="text-sm font-semibold text-foreground/95">Agent</div>
            <Select value={selectedWittyAgentId} onValueChange={onAgentChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="全部 Agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部 Agent</SelectItem>
                {agents.map(agent => (
                  <SelectItem key={agent.witty_agent_id} value={agent.witty_agent_id}>
                    {agent.witty_agent_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold text-foreground/95">时间范围</div>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={selectedPreset}
              onValueChange={value => {
                if (value) {
                  onPresetChange(value as InsightRangePreset)
                }
              }}
              className="w-full flex-wrap justify-start"
            >
              {rangePresets.map(preset => (
                <ToggleGroupItem key={preset.id} value={preset.id} className="px-3">
                  {preset.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Clock3 className="h-3.5 w-3.5" />
            {queryLabel}
          </div>
          <div className="flex items-center gap-1.5">
            <TimerReset className="h-3.5 w-3.5" />
            {lastUpdatedLabel}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
