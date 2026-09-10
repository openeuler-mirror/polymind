'use client'

import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FolderOpen,
  GitBranch,
  ListFilter,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  BACKPORT_OPERATION_IDS,
  type RowStatusKind,
  buildDisplayPatchResources,
  formatGitDate,
  hasPatchResource,
  isSkippedRow,
  resolveCommitTitle,
  resolveConflictMeta,
  resolveStatusMeta,
  resolveTargetMeta,
  stringifyValue,
} from '@/components/tool-panel/backport/utils'
import type { BackportCommitRow, BackportPatchResource } from '@/lib/backport-types'
import { cn } from '@/lib/utils'

type StatusFilter = 'all' | RowStatusKind
type ConflictFilter = 'all' | 'true' | 'false'
type MergedFilter = 'all' | 'true' | 'false' | 'none' | 'skipped'

interface CommitTableProps {
  excelPath: string
  onExcelPathChange: (value: string) => void
  running: boolean
  runningLabel: string
  canPauseRunAll: boolean
  runAllPauseState: 'idle' | 'running' | 'pause_requested' | 'paused'
  baseReportPath: string
  filteredRows: BackportCommitRow[]
  paginatedRows: BackportCommitRow[]
  titleCandidates: string[]
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  titleFilter: string
  onTitleFilterChange: (value: string) => void
  statusFilter: StatusFilter
  onStatusFilterChange: (value: StatusFilter) => void
  conflictFilter: ConflictFilter
  onConflictFilterChange: (value: ConflictFilter) => void
  mergedFilter: MergedFilter
  onMergedFilterChange: (value: MergedFilter) => void
  selectedRowIds: string[]
  selectedRowSet: Set<string>
  clearSelection: () => void
  allFilteredSelected: boolean
  onToggleSelectAll: (checked: boolean) => void
  onToggleRowSelection: (rowId: string, checked: boolean) => void
  inspectedRowId: string | null
  analyzingConflictRowId: string | null
  currentCommitPage: number
  totalCommitPages: number
  paginationItems: Array<number | string>
  onCommitPageChange: (updater: number | ((prev: number) => number)) => void
  originalCommitCount: number
  canContinueReport: boolean
  hasCommitEntries: boolean
  onOpenCommitImport: () => void
  onDownloadCommitCsv?: () => void
  onOpenPathBrowser: () => void
  onGenerateReport: () => void
  generateReportLabel?: string
  prereqOnly?: boolean
  onPrereqOnlyChange?: (value: boolean) => void
  onRunAll: () => void
  runAllIdleLabel?: string
  onPauseRunAll: () => void
  onContinueReport: () => void
  onExecuteSelected: () => void
  onDeleteSelectedRows: () => void
  onResetWorkingRows: () => void
  onOpenInspector: (row: BackportCommitRow, tab: 'details') => void
  onCopyText: (text: string, label: string) => void
  onLoadPatchPreview: (row: BackportCommitRow, resource: BackportPatchResource) => void
  canAnalyzeConflictRow: (row: BackportCommitRow) => boolean
  onAnalyzeConflictRow: (row: BackportCommitRow) => void
  firstBlockingConflictRowId: string | null
  canRecheckConflictRow: (row: BackportCommitRow) => boolean
  onRecheckConflictRow: (row: BackportCommitRow) => void
  canApplyRow: (row: BackportCommitRow) => boolean
  canResolveConflictRow: (row: BackportCommitRow) => boolean
  onApplyRow: (row: BackportCommitRow) => void
  onResolveConflictRow: (row: BackportCommitRow) => void
}

export function CommitTable({
  excelPath,
  onExcelPathChange,
  running,
  runningLabel,
  canPauseRunAll,
  runAllPauseState,
  baseReportPath,
  filteredRows,
  paginatedRows,
  titleCandidates,
  searchQuery,
  onSearchQueryChange,
  titleFilter,
  onTitleFilterChange,
  statusFilter,
  onStatusFilterChange,
  conflictFilter,
  onConflictFilterChange,
  mergedFilter,
  onMergedFilterChange,
  selectedRowIds,
  selectedRowSet,
  clearSelection,
  allFilteredSelected,
  onToggleSelectAll,
  onToggleRowSelection,
  inspectedRowId,
  analyzingConflictRowId,
  currentCommitPage,
  totalCommitPages,
  paginationItems,
  onCommitPageChange,
  originalCommitCount,
  canContinueReport,
  hasCommitEntries,
  onOpenCommitImport,
  onDownloadCommitCsv,
  onOpenPathBrowser,
  onGenerateReport,
  generateReportLabel,
  prereqOnly = false,
  onPrereqOnlyChange,
  onRunAll,
  runAllIdleLabel,
  onPauseRunAll,
  onContinueReport,
  onExecuteSelected,
  onDeleteSelectedRows,
  onResetWorkingRows,
  onOpenInspector,
  onCopyText,
  onLoadPatchPreview,
  canAnalyzeConflictRow,
  onAnalyzeConflictRow,
  firstBlockingConflictRowId,
  canRecheckConflictRow,
  onRecheckConflictRow,
  canApplyRow,
  canResolveConflictRow,
  onApplyRow,
  onResolveConflictRow,
}: CommitTableProps) {
  const { t } = useTranslation('tool-panel')
  const updateFilter = <T,>(setter: (value: T) => void, value: T) => {
    setter(value)
    clearSelection()
  }

  const isRunAllRunning = running && runningLabel === BACKPORT_OPERATION_IDS.runAll
  const isRunAllPauseRequested = runAllPauseState === 'pause_requested'
  const isRunAllPaused = runAllPauseState === 'paused'
  const isOtherOperationRunning = running && !isRunAllRunning
  const lacksRunAllInput =
    !running && !excelPath.trim() && !hasCommitEntries && !baseReportPath.trim()
  const runAllButtonDisabled =
    isOtherOperationRunning ||
    (isRunAllRunning && !canPauseRunAll) ||
    isRunAllPauseRequested ||
    lacksRunAllInput

  let runAllButtonClick = onRunAll
  if (isRunAllRunning) {
    runAllButtonClick = onPauseRunAll
  }

  let runAllButtonTitle: string | undefined
  if (isRunAllPauseRequested) {
    runAllButtonTitle = t('backport.runAll.pauseTitle')
  } else if (isRunAllPaused) {
    runAllButtonTitle = t('backport.runAll.resumeTitle')
  }

  let runAllButtonIcon = <Play className="mr-1 h-4 w-4" />
  if (isRunAllRunning && isRunAllPauseRequested) {
    runAllButtonIcon = <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
  } else if (isRunAllRunning) {
    runAllButtonIcon = <Pause className="mr-1 h-4 w-4" />
  }

  let runAllButtonLabel = runAllIdleLabel || t('backport.operation.runAll')
  if (isRunAllRunning && isRunAllPauseRequested) {
    runAllButtonLabel = t('backport.runAll.pausing')
  } else if (isRunAllRunning) {
    runAllButtonLabel = t('backport.runAll.pause')
  } else if (isRunAllPaused) {
    runAllButtonLabel = t('backport.runAll.resume')
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle>{t('backport.table.title')}</CardTitle>
            <CardDescription>{t('backport.table.description')}</CardDescription>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={onOpenCommitImport}
                disabled={running}
              >
                {t('backport.table.importCsv')}
              </Button>
              <Input
                value={excelPath}
                onChange={e => onExcelPathChange(e.target.value)}
                className="h-8 min-w-[260px] flex-1 font-mono text-xs"
                placeholder="/path/to/backport.xlsx"
              />
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={onOpenPathBrowser}
                disabled={running}
                title={t('backport.table.browseServerPath')}
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                className="h-8"
                onClick={onGenerateReport}
                disabled={running || (!excelPath.trim() && !hasCommitEntries)}
              >
                {running &&
                (runningLabel === BACKPORT_OPERATION_IDS.generateConfigAndReport ||
                  runningLabel === BACKPORT_OPERATION_IDS.importExcelFindPrereqs ||
                  runningLabel === BACKPORT_OPERATION_IDS.importCommitsFindPrereqs) ? (
                  <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-1 h-4 w-4" />
                )}
                {generateReportLabel || t('backport.button.importExcelGenerateReport')}
              </Button>
              <Button
                size="sm"
                className="h-8"
                onClick={runAllButtonClick}
                disabled={runAllButtonDisabled}
                title={runAllButtonTitle}
              >
                {runAllButtonIcon}
                {runAllButtonLabel}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={onContinueReport}
                disabled={running || !baseReportPath.trim() || !canContinueReport}
                title={
                  canContinueReport
                    ? t('backport.table.continueHintEnabled')
                    : t('backport.table.continueHintDisabled')
                }
              >
                {running && runningLabel === BACKPORT_OPERATION_IDS.continueCheck ? (
                  <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-4 w-4" />
                )}
                {t('backport.table.continueCheck')}
              </Button>
              {onDownloadCommitCsv ? (
                <Button variant="outline" size="sm" className="h-8" onClick={onDownloadCommitCsv}>
                  <Download className="mr-1 h-4 w-4" />
                  {t('backport.table.downloadCsv')}
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={onExecuteSelected}
                disabled={running || filteredRows.length === 0}
              >
                <Play className="mr-1 h-4 w-4" />
                {t('backport.table.executeFiltered')}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onDeleteSelectedRows}
              disabled={running || selectedRowIds.length === 0}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              {t('backport.table.deleteSelected')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onResetWorkingRows}
              disabled={running || originalCommitCount === 0}
            >
              <RotateCcw className="mr-1 h-4 w-4" />
              {t('backport.table.resetList')}
            </Button>
            {onPrereqOnlyChange ? (
              <Button
                variant={prereqOnly ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  onPrereqOnlyChange(!prereqOnly)
                  clearSelection()
                }}
                disabled={running}
                title={t('backport.table.prereqOnlyHint')}
              >
                <GitBranch className={cn('mr-1 h-4 w-4', prereqOnly && 'text-white')} />
                {t('backport.table.prereqOnly')}
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        <datalist id="backport-title-candidates">
          {titleCandidates.map(item => (
            <option key={item} value={item} />
          ))}
        </datalist>

        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <div className="min-w-[1020px]">
              <div className="grid grid-cols-[34px_132px_minmax(190px,1.7fr)_90px_118px_100px_126px_142px] gap-2.5 border-b bg-slate-50/90 px-3 py-2 text-xs font-semibold text-slate-700">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    checked={allFilteredSelected}
                    onChange={e => onToggleSelectAll(e.target.checked)}
                  />
                </div>
                <div className="min-w-0">
                  <div className="h-5 text-foreground">Commit</div>
                  <input
                    value={searchQuery}
                    onChange={e => updateFilter(onSearchQueryChange, e.target.value)}
                    placeholder={t('backport.table.filterCommit')}
                    className="mt-1 h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[11px] font-normal outline-none placeholder:text-muted-foreground/70 focus:border-primary"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex h-5 items-center gap-1 text-foreground">
                    <span>{t('backport.table.columnTitle')}</span>
                    <ListFilter
                      className={cn(
                        'h-3.5 w-3.5',
                        titleFilter.trim() ? 'text-blue-600' : 'text-muted-foreground'
                      )}
                    />
                  </div>
                  <input
                    value={titleFilter}
                    onChange={e => updateFilter(onTitleFilterChange, e.target.value)}
                    placeholder={t('backport.table.filterTitle')}
                    list="backport-title-candidates"
                    className="mt-1 h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[11px] font-normal outline-none placeholder:text-muted-foreground/70 focus:border-primary"
                  />
                </div>
                <div>
                  <div className="h-5 text-foreground">{t('backport.table.columnStatus')}</div>
                  <select
                    value={statusFilter}
                    onChange={e =>
                      updateFilter(onStatusFilterChange, e.target.value as StatusFilter)
                    }
                    className="mt-1 h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[11px] font-normal"
                  >
                    <option value="all">{t('backport.filter.all')}</option>
                    <option value="success">{t('backport.filter.success')}</option>
                    <option value="conflict">{t('backport.filter.conflict')}</option>
                    <option value="unmatched">{t('backport.filter.unmatched')}</option>
                    <option value="failed">{t('backport.filter.failed')}</option>
                    <option value="noop">{t('backport.filter.noop')}</option>
                    <option value="pending">{t('backport.filter.pending')}</option>
                    <option value="skipped">{t('backport.filter.skipped')}</option>
                  </select>
                </div>
                <div>
                  <div className="h-5 text-foreground">{t('backport.table.columnConflict')}</div>
                  <select
                    value={conflictFilter}
                    onChange={e =>
                      updateFilter(onConflictFilterChange, e.target.value as ConflictFilter)
                    }
                    className="mt-1 h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[11px] font-normal"
                  >
                    <option value="all">{t('backport.filter.all')}</option>
                    <option value="true">{t('backport.filter.hasConflict')}</option>
                    <option value="false">{t('backport.filter.noConflict')}</option>
                  </select>
                </div>
                <div>
                  <div className="flex h-5 items-center gap-1 text-foreground">
                    <GitBranch className="h-3.5 w-3.5" />
                    {t('backport.table.columnTargetBranch')}
                  </div>
                  <select
                    value={mergedFilter}
                    onChange={e =>
                      updateFilter(onMergedFilterChange, e.target.value as MergedFilter)
                    }
                    className="mt-1 h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[11px] font-normal"
                  >
                    <option value="all">{t('backport.filter.all')}</option>
                    <option value="true">{t('backport.filter.merged')}</option>
                    <option value="false">{t('backport.filter.notMerged')}</option>
                    <option value="none">{t('backport.filter.notSet')}</option>
                    <option value="skipped">{t('backport.filter.skippedMerged')}</option>
                  </select>
                </div>
                <div>
                  <div className="h-5 text-foreground">Patch</div>
                  <div className="mt-1 h-7" />
                </div>
                <div>
                  <div className="h-5 text-foreground">{t('backport.table.columnActions')}</div>
                  <div className="mt-1 h-7" />
                </div>
              </div>

              <div className="overflow-auto">
                {filteredRows.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    {t('backport.table.empty')}
                  </div>
                ) : (
                  paginatedRows.map(row => {
                    const commit = stringifyValue(row.data.commit || row.data.input_commit)
                    const statusMeta = resolveStatusMeta(row.data, t)
                    const conflictMeta = resolveConflictMeta(row.data, t)
                    const targetMeta = resolveTargetMeta(row.data, t)
                    const patchResources = buildDisplayPatchResources(row.data, row.rowId, t)
                    const isActive = row.rowId === inspectedRowId
                    const isAnalyzingConflictRow = analyzingConflictRowId === row.rowId
                    const hasActionableConflict =
                      Boolean(row.data.has_conflict) && !isSkippedRow(row.data)
                    const canApplyBackportedPatch =
                      hasActionableConflict && hasPatchResource(row.data, 'backported')
                    const isFirstBlockingConflict = row.rowId === firstBlockingConflictRowId

                    return (
                      <div
                        key={row.rowId}
                        role="button"
                        tabIndex={0}
                        className={cn(
                          'grid cursor-pointer grid-cols-[34px_132px_minmax(190px,1.7fr)_90px_118px_100px_126px_142px] items-start gap-2.5 border-b px-3 py-3 text-xs transition-colors hover:bg-slate-50/80',
                          isActive && 'bg-blue-50/50'
                        )}
                        onClick={() => onOpenInspector(row, 'details')}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onOpenInspector(row, 'details')
                          }
                        }}
                      >
                        <div className="pt-0.5">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5"
                            checked={selectedRowSet.has(row.rowId)}
                            onClick={e => e.stopPropagation()}
                            onChange={e => onToggleRowSelection(row.rowId, e.target.checked)}
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center gap-1">
                            <span
                              className="truncate font-mono text-[12px] font-semibold text-slate-900"
                              title={commit}
                            >
                              {commit.slice(0, 12)}
                            </span>
                            <button
                              type="button"
                              className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                              onClick={e => {
                                e.stopPropagation()
                                onCopyText(commit, 'Commit')
                              }}
                              title={t('backport.table.copyCommit')}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="font-mono text-[11px] text-slate-500">
                            {formatGitDate(stringifyValue(row.data.committed_datetime))}
                          </div>
                        </div>

                        <div className="min-w-0 pr-2">
                          {stringifyValue(row.data.origin) === 'prerequisite' ? (
                            <Badge
                              variant="outline"
                              className="mb-1 border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700"
                            >
                              {t('backport.table.prereqBadge')}
                            </Badge>
                          ) : null}
                          <div
                            className="line-clamp-2 text-[12px] font-medium leading-5 text-slate-900"
                            title={resolveCommitTitle(row.data)}
                          >
                            {resolveCommitTitle(row.data) || '--'}
                          </div>
                          {stringifyValue(row.data.applied_commit).trim() ? (
                            <div className="mt-1 truncate font-mono text-[11px] text-emerald-700">
                              applied: {stringifyValue(row.data.applied_commit).slice(0, 12)}
                            </div>
                          ) : null}
                        </div>

                        <div>
                          <Badge
                            variant="outline"
                            className={cn('justify-center', statusMeta.className)}
                          >
                            {statusMeta.label}
                          </Badge>
                        </div>

                        <div className="space-y-1">
                          <Badge
                            variant="outline"
                            className={cn(
                              'max-w-full truncate justify-center',
                              conflictMeta.className
                            )}
                          >
                            {conflictMeta.label}
                          </Badge>
                          <div className="line-clamp-2 text-[11px] text-slate-500">
                            {conflictMeta.detail}
                          </div>
                        </div>

                        <div>
                          <Badge
                            variant="outline"
                            className={cn('justify-center', targetMeta.className)}
                          >
                            {targetMeta.label}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {patchResources.map(resource => (
                            <Button
                              key={resource.fileId}
                              variant="outline"
                              size="sm"
                              className={cn(
                                'h-7 min-w-[48px] border-slate-200 px-2 text-[11px] text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700',
                                !resource.exists &&
                                  'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
                              )}
                              disabled={!resource.exists}
                              onClick={e => {
                                e.stopPropagation()
                                if (!resource.exists) return
                                onLoadPatchPreview(row, resource)
                              }}
                              title={
                                resource.exists
                                  ? resource.fileName
                                  : t('backport.inspector.patchMissing', { label: resource.label })
                              }
                            >
                              {resource.label.replace(' Patch', '')}
                            </Button>
                          ))}
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 border-slate-200 px-2 text-[11px] text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                            onClick={e => {
                              e.stopPropagation()
                              onOpenInspector(row, 'details')
                            }}
                          >
                            {t('backport.table.details')}
                          </Button>
                          {hasActionableConflict ? (
                            isFirstBlockingConflict ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 justify-start border-slate-200 bg-white px-2 text-[11px] text-slate-700 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-800"
                                disabled={!canRecheckConflictRow(row)}
                                onClick={e => {
                                  e.stopPropagation()
                                  onRecheckConflictRow(row)
                                }}
                              >
                                <RefreshCw className="mr-1 h-3 w-3" />
                                {t('backport.table.recheckConflict')}
                              </Button>
                            ) : null
                          ) : null}
                          {hasActionableConflict ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 justify-start border-amber-200 bg-amber-50/70 px-2 text-[11px] text-amber-800 hover:bg-amber-100"
                              disabled={!canAnalyzeConflictRow(row)}
                              title={
                                baseReportPath.trim()
                                  ? t('backport.table.analyzeConflictHint')
                                  : t('backport.table.generateReportFirst')
                              }
                              onClick={e => {
                                e.stopPropagation()
                                onAnalyzeConflictRow(row)
                              }}
                            >
                              {isAnalyzingConflictRow ? (
                                <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                              ) : (
                                <Search className="mr-1 h-3 w-3" />
                              )}
                              {t('backport.table.analyzeConflict')}
                            </Button>
                          ) : null}
                          {hasActionableConflict ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className={cn(
                                'h-7 px-2 text-[11px]',
                                canApplyBackportedPatch
                                  ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                                  : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                              )}
                              disabled={
                                canApplyBackportedPatch
                                  ? !canApplyRow(row)
                                  : !canResolveConflictRow(row)
                              }
                              onClick={e => {
                                e.stopPropagation()
                                if (canApplyBackportedPatch) {
                                  onApplyRow(row)
                                } else {
                                  onResolveConflictRow(row)
                                }
                              }}
                            >
                              {canApplyBackportedPatch
                                ? t('backport.table.tryApply')
                                : t('backport.table.tryResolve')}
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 border-emerald-200 bg-emerald-50 px-2 text-[11px] text-emerald-700 hover:bg-emerald-100"
                              disabled={!canApplyRow(row)}
                              onClick={e => {
                                e.stopPropagation()
                                onApplyRow(row)
                              }}
                            >
                              {t('backport.table.apply')}
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-white px-3 py-3 text-xs text-slate-600">
                <div className="flex items-center gap-3">
                  <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900">
                    {t('backport.table.pageSize')}
                  </span>
                  <span className="whitespace-nowrap text-sm text-slate-700">
                    {t('backport.table.totalCount', { count: filteredRows.length })}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-slate-700"
                    disabled={currentCommitPage <= 1}
                    onClick={() => onCommitPageChange(prev => Math.max(1, prev - 1))}
                    aria-label={t('backport.table.prevPage')}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {paginationItems.map(item =>
                    typeof item === 'number' ? (
                      <Button
                        key={item}
                        variant={item === currentCommitPage ? 'default' : 'ghost'}
                        size="sm"
                        className={cn(
                          'h-8 min-w-8 px-2 text-sm',
                          item === currentCommitPage
                            ? 'bg-slate-950 text-white hover:bg-slate-900'
                            : 'text-slate-700'
                        )}
                        onClick={() => onCommitPageChange(item)}
                      >
                        {item}
                      </Button>
                    ) : (
                      <span key={item} className="px-2 text-sm text-slate-500">
                        ...
                      </span>
                    )
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-slate-700"
                    disabled={currentCommitPage >= totalCommitPages}
                    onClick={() => onCommitPageChange(prev => Math.min(totalCommitPages, prev + 1))}
                    aria-label={t('backport.table.nextPage')}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
