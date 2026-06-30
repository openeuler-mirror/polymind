'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Spinner } from '@/components/ui/spinner'
import { useInsightAvailability } from '@/hooks/insight/use-availability'
import { useInsightOverview } from '@/hooks/insight/use-overview'
import type { InsightAtifTarget, InsightPanelView } from '@/hooks/insight/types'
import { InsightAtifPanel } from './atif-panel'
import { InsightHealthRail } from './health-rail'
import { InsightOverviewPanel } from './overview-panel'
import { InsightSetupPanel } from './setup-panel'

const views: Array<{ id: InsightPanelView; label: string }> = [
  { id: 'overview', label: '总览' },
  { id: 'atif', label: '轨迹详情' },
]

export function InsightRoot() {
  const availability = useInsightAvailability()
  const controller = useInsightOverview({
    enabled: availability.status === 'available',
  })
  const [activeView, setActiveView] = useState<InsightPanelView>('overview')
  const [atifTarget, setAtifTarget] = useState<InsightAtifTarget | null>(null)

  const handleOpenAtif = (target: InsightAtifTarget) => {
    setAtifTarget(target)
    setActiveView('atif')
  }

  return (
    <Tabs
      value={activeView}
      onValueChange={value => {
        setActiveView(value as InsightPanelView)
      }}
      className="relative flex h-full min-h-0 flex-col overflow-hidden xl:pr-12"
    >
      <div className="border-b border-sidebar-border px-4 py-3">
        <div className="flex w-full items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">监测系统</h2>
          {availability.status === 'available' ? (
            <TabsList>
              {views.map(view => (
                <TabsTrigger key={view.id} value={view.id}>
                  {view.label}
                </TabsTrigger>
              ))}
            </TabsList>
          ) : (
            <div className="h-9" aria-hidden="true" />
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {availability.status === 'checking' ? (
          <div className="flex min-h-[420px] items-center justify-center gap-3 text-sm text-muted-foreground">
            <Spinner className="h-4 w-4" />
            正在检测监测系统后端服务...
          </div>
        ) : availability.status === 'unavailable' ? (
          <InsightSetupPanel />
        ) : (
          <div className="w-full">
            <TabsContent value="overview">
              <InsightOverviewPanel controller={controller} onOpenAtif={handleOpenAtif} />
            </TabsContent>
            <TabsContent value="atif">
              <InsightAtifPanel target={atifTarget} onSelectTarget={setAtifTarget} />
            </TabsContent>
          </div>
        )}
      </div>

      {availability.status === 'available' ? (
        <div className="pointer-events-none absolute top-20 right-0 hidden h-[calc(100%-5rem)] md:block">
          <div className="pointer-events-auto sticky top-20">
            <InsightHealthRail
              agents={controller.healthAgents}
              loading={controller.healthLoading}
              error={controller.healthError}
              lastScanTime={controller.healthLastScanTime}
              onAcknowledgeOffline={controller.acknowledgeOfflineAgent}
            />
          </div>
        </div>
      ) : null}
    </Tabs>
  )
}
