'use client'

import type { InsightOverviewController } from '@/hooks/insight/use-overview'
import type { InsightAtifTarget } from '@/hooks/insight/types'
import { InsightOverviewFilters } from './overview-filters'
import { InsightOverviewSummaryCards } from './overview-summary'
import { InsightInterruptionSheet } from './interruption-sheet'
import { InsightTimeseriesPanels } from './timeseries-panels'
import { InsightTraceTable } from './trace-table'

export function InsightOverviewPanel({
  controller,
  onOpenAtif,
}: {
  controller: InsightOverviewController
  onOpenAtif: (target: InsightAtifTarget) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <InsightOverviewFilters
        filters={controller.filters}
        status={controller.status}
        onRefresh={() => {
          void controller.actions.refreshOverview()
        }}
      />

      <InsightOverviewSummaryCards controller={controller.summary} />

      <InsightTimeseriesPanels controller={controller.timeseries} />

      <InsightTraceTable
        sessionsController={controller.sessions}
        interruptionsController={controller.interruptions}
        status={controller.status}
        onOpenAtif={onOpenAtif}
      />

      <InsightInterruptionSheet controller={controller.interruptions} />
    </div>
  )
}
