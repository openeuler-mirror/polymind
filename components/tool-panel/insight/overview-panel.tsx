'use client'

import type { InsightOverviewController } from '@/hooks/insight/use-overview'
import type { InsightAtifTarget } from '@/hooks/insight/types'
import { InsightOverviewFilters } from './overview-filters'
import { InsightOverviewSummaryCards } from './overview-summary'
import { InsightInterruptionSheet } from './interruption-sheet'
import { InsightTimeseriesPanels } from './timeseries-panels'
import { InsightTraceTable } from './trace-table'

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

export function InsightOverviewPanel({
  controller,
  onOpenAtif,
}: {
  controller: InsightOverviewController
  onOpenAtif: (target: InsightAtifTarget) => void
}) {
  const {
    rangePresets,
    selectedPreset,
    setSelectedPreset,
    selectedWittyAgentId,
    setSelectedWittyAgentId,
    agentFilterOptions,
    queryRange,
    visibleSessions,
    interruptionCountLoaded,
    sessionInterruptionCounts,
    sessionInterruptionCountsLoaded,
    conversationInterruptionCounts,
    conversationInterruptionCountsLoaded,
    tokenSeries,
    modelSeries,
    timeseriesLoading,
    timeseriesError,
    summary,
    loading,
    refreshing,
    error,
    lastUpdated,
    sessionPage,
    setSessionPage,
    sessionTotalPages,
    pageSize,
    expandedSessionId,
    toggleSession,
    tracesBySessionId,
    traceLoadingBySessionId,
    traceErrorBySessionId,
    interruptionSheet,
    setInterruptionSheetOpen,
    openSessionInterruptions,
    openConversationInterruptions,
    resolveInterruptionRecord,
    refreshOverview,
    sessions,
  } = controller

  return (
    <div className="flex flex-col gap-4">
      <InsightOverviewFilters
        agents={agentFilterOptions}
        lastUpdatedLabel={formatRefreshTime(lastUpdated)}
        loading={loading}
        onAgentChange={setSelectedWittyAgentId}
        onPresetChange={setSelectedPreset}
        onRefresh={() => {
          void refreshOverview()
        }}
        queryLabel={queryRange.label}
        rangePresets={rangePresets}
        refreshing={refreshing}
        selectedPreset={selectedPreset}
        selectedWittyAgentId={selectedWittyAgentId}
      />

      <InsightOverviewSummaryCards
        interruptionCountLoaded={interruptionCountLoaded}
        loading={loading}
        summary={summary}
      />

      <InsightTimeseriesPanels
        tokenSeries={tokenSeries}
        modelSeries={modelSeries}
        startNs={queryRange.startNs}
        endNs={queryRange.endNs}
        loading={timeseriesLoading}
        error={timeseriesError}
      />

      <InsightTraceTable
        conversationInterruptionCounts={conversationInterruptionCounts}
        conversationInterruptionCountsLoaded={conversationInterruptionCountsLoaded}
        error={error}
        expandedSessionId={expandedSessionId}
        loading={loading}
        onOpenAtif={onOpenAtif}
        onOpenConversationInterruptions={trace => {
          void openConversationInterruptions(trace)
        }}
        onOpenSessionInterruptions={session => {
          void openSessionInterruptions(session)
        }}
        onPageChange={setSessionPage}
        onToggleSession={sessionId => {
          void toggleSession(sessionId)
        }}
        pageSize={pageSize}
        refreshing={refreshing}
        sessionInterruptionCounts={sessionInterruptionCounts}
        sessionInterruptionCountsLoaded={sessionInterruptionCountsLoaded}
        sessionPage={sessionPage}
        sessionTotalPages={sessionTotalPages}
        sessions={sessions}
        traceErrorBySessionId={traceErrorBySessionId}
        traceLoadingBySessionId={traceLoadingBySessionId}
        tracesBySessionId={tracesBySessionId}
        visibleSessions={visibleSessions}
      />

      <InsightInterruptionSheet
        open={interruptionSheet.open}
        onOpenChange={setInterruptionSheetOpen}
        title={interruptionSheet.title}
        records={interruptionSheet.records}
        loading={interruptionSheet.loading}
        error={interruptionSheet.error}
        onResolveRecord={resolveInterruptionRecord}
      />
    </div>
  )
}
