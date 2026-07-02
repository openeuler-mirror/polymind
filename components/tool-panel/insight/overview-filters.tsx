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
import type {
  InsightOverviewFiltersController,
  InsightOverviewStatusController,
} from '@/hooks/insight/use-overview'
import { cn } from '@/lib/utils'

function formatRefreshTime(date: Date | null): string {
  if (!date) {
    return '—'
  }

  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

interface InsightOverviewFiltersProps {
  filters: InsightOverviewFiltersController
  status: InsightOverviewStatusController
  onRefresh: () => void
}

export function InsightOverviewFilters({
  filters,
  status,
  onRefresh,
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
            disabled={status.loading || status.refreshing}
            className="min-w-[108px]"
          >
            <RefreshCw className={cn('h-4 w-4', status.refreshing && 'animate-spin')} />
            {status.refreshing ? '刷新中' : '刷新'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
        <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-2">
            <div className="text-sm font-semibold text-foreground/95">Agent</div>
            <Select
              value={filters.selectedWittyAgentId}
              onValueChange={filters.setSelectedWittyAgentId}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="全部 Agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部 Agent</SelectItem>
                {filters.agentFilterOptions.map(agent => (
                  <SelectItem key={agent.witty_agent_id} value={agent.witty_agent_id}>
                    {agent.label}
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
              value={filters.selectedPreset}
              onValueChange={value => {
                if (value) {
                  filters.setSelectedPreset(value as typeof filters.selectedPreset)
                }
              }}
              className="w-full flex-wrap justify-start"
            >
              {filters.rangePresets.map(preset => (
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
            {filters.queryRange.label}
          </div>
          <div className="flex items-center gap-1.5">
            <TimerReset className="h-3.5 w-3.5" />
            {formatRefreshTime(status.lastUpdated)}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
