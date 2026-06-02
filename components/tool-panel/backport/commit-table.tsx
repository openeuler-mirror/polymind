'use client'

import {
  ChevronLeft,
  ChevronRight,
  Copy,
  FolderOpen,
  GitBranch,
  ListFilter,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
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
  onOpenPathBrowser: () => void
  onGenerateReport: () => void
  onRefreshReport: () => void
  onExecuteSelected: () => void
  onDeleteSelectedRows: () => void
  onResetWorkingRows: () => void
  onOpenInspector: (row: BackportCommitRow, tab: 'details') => void
  onCopyText: (text: string, label: string) => void
  onLoadPatchPreview: (row: BackportCommitRow, resource: BackportPatchResource) => void
  canAnalyzeConflictRow: (row: BackportCommitRow) => boolean
  onAnalyzeConflictRow: (row: BackportCommitRow) => void
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
  onOpenPathBrowser,
  onGenerateReport,
  onRefreshReport,
  onExecuteSelected,
  onDeleteSelectedRows,
  onResetWorkingRows,
  onOpenInspector,
  onCopyText,
  onLoadPatchPreview,
  canAnalyzeConflictRow,
  onAnalyzeConflictRow,
  canApplyRow,
  canResolveConflictRow,
  onApplyRow,
  onResolveConflictRow,
}: CommitTableProps) {
  const updateFilter = <T,>(setter: (value: T) => void, value: T) => {
    setter(value)
    clearSelection()
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle>Commit 表格</CardTitle>
            <CardDescription>展示回移植任务列表，支持筛选状态、查看 Patch、应用提交和分析冲突</CardDescription>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Input
                value={excelPath}
                onChange={(e) => onExcelPathChange(e.target.value)}
                className="h-8 min-w-[260px] flex-1 font-mono text-xs"
                placeholder="/path/to/backport.xlsx"
              />
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={onOpenPathBrowser}
                disabled={running}
                title="浏览服务器路径"
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
              <Button size="sm" className="h-8" onClick={onGenerateReport} disabled={running || !excelPath.trim()}>
                {running && runningLabel === '生成配置与报告' ? (
                  <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-1 h-4 w-4" />
                )}
                导入 Excel 并生成报告
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={onRefreshReport} disabled={running || !baseReportPath.trim()}>
                {running && runningLabel === '刷新当前 report' ? (
                  <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-4 w-4" />
                )}
                刷新 report
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={onExecuteSelected} disabled={running || filteredRows.length === 0}>
                <Play className="mr-1 h-4 w-4" />
                执行当前结果集
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onDeleteSelectedRows} disabled={running || selectedRowIds.length === 0}>
              <Trash2 className="mr-1 h-4 w-4" />
              删除选中
            </Button>
            <Button variant="outline" size="sm" onClick={onResetWorkingRows} disabled={running || originalCommitCount === 0}>
              <RotateCcw className="mr-1 h-4 w-4" />
              恢复列表
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        <datalist id="backport-title-candidates">
          {titleCandidates.map((item) => (
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
                    onChange={(e) => onToggleSelectAll(e.target.checked)}
                  />
                </div>
                <div className="min-w-0">
                  <div className="h-5 text-foreground">Commit</div>
                  <input
                    value={searchQuery}
                    onChange={(e) => updateFilter(onSearchQueryChange, e.target.value)}
                    placeholder="筛选commit"
                    className="mt-1 h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[11px] font-normal outline-none placeholder:text-muted-foreground/70 focus:border-primary"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex h-5 items-center gap-1 text-foreground">
                    <span>标题</span>
                    <ListFilter className={cn('h-3.5 w-3.5', titleFilter.trim() ? 'text-blue-600' : 'text-muted-foreground')} />
                  </div>
                  <input
                    value={titleFilter}
                    onChange={(e) => updateFilter(onTitleFilterChange, e.target.value)}
                    placeholder="筛选标题"
                    list="backport-title-candidates"
                    className="mt-1 h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[11px] font-normal outline-none placeholder:text-muted-foreground/70 focus:border-primary"
                  />
                </div>
                <div>
                  <div className="h-5 text-foreground">状态</div>
                  <select
                    value={statusFilter}
                    onChange={(e) => updateFilter(onStatusFilterChange, e.target.value as StatusFilter)}
                    className="mt-1 h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[11px] font-normal"
                  >
                    <option value="all">全部</option>
                    <option value="success">成功</option>
                    <option value="conflict">冲突</option>
                    <option value="failed">失败</option>
                    <option value="noop">无需移植</option>
                    <option value="skipped">跳过</option>
                  </select>
                </div>
                <div>
                  <div className="h-5 text-foreground">冲突</div>
                  <select
                    value={conflictFilter}
                    onChange={(e) => updateFilter(onConflictFilterChange, e.target.value as ConflictFilter)}
                    className="mt-1 h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[11px] font-normal"
                  >
                    <option value="all">全部</option>
                    <option value="true">有</option>
                    <option value="false">无</option>
                  </select>
                </div>
                <div>
                  <div className="flex h-5 items-center gap-1 text-foreground">
                    <GitBranch className="h-3.5 w-3.5" />
                    目标分支
                  </div>
                  <select
                    value={mergedFilter}
                    onChange={(e) => updateFilter(onMergedFilterChange, e.target.value as MergedFilter)}
                    className="mt-1 h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[11px] font-normal"
                  >
                    <option value="all">全部</option>
                    <option value="true">已合入</option>
                    <option value="false">未合入</option>
                    <option value="none">未设置</option>
                    <option value="skipped">已跳过</option>
                  </select>
                </div>
                <div>
                  <div className="h-5 text-foreground">Patch</div>
                  <div className="mt-1 h-7" />
                </div>
                <div>
                  <div className="h-5 text-foreground">操作</div>
                  <div className="mt-1 h-7" />
                </div>
              </div>

              <div className="overflow-auto">
                {filteredRows.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">当前无可显示条目</div>
                ) : (
                  paginatedRows.map((row) => {
                    const commit = stringifyValue(row.data.commit || row.data.input_commit)
                    const statusMeta = resolveStatusMeta(row.data)
                    const conflictMeta = resolveConflictMeta(row.data)
                    const targetMeta = resolveTargetMeta(row.data)
                    const patchResources = buildDisplayPatchResources(row.data, row.rowId)
                    const isActive = row.rowId === inspectedRowId
                    const isAnalyzingConflictRow = analyzingConflictRowId === row.rowId
                    const hasActionableConflict = Boolean(row.data.has_conflict) && !isSkippedRow(row.data)
                    const canApplyBackportedPatch = hasActionableConflict && hasPatchResource(row.data, 'backported')

                    return (
                      <div
                        key={row.rowId}
                        role="button"
                        tabIndex={0}
                        className={cn(
                          'grid cursor-pointer grid-cols-[34px_132px_minmax(190px,1.7fr)_90px_118px_100px_126px_142px] items-start gap-2.5 border-b px-3 py-3 text-xs transition-colors hover:bg-slate-50/80',
                          isActive && 'bg-blue-50/50',
                        )}
                        onClick={() => onOpenInspector(row, 'details')}
                        onKeyDown={(e) => {
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
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => onToggleRowSelection(row.rowId, e.target.checked)}
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center gap-1">
                            <span className="truncate font-mono text-[12px] font-semibold text-slate-900" title={commit}>
                              {commit.slice(0, 12)}
                            </span>
                            <button
                              type="button"
                              className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                              onClick={(e) => {
                                e.stopPropagation()
                                onCopyText(commit, 'Commit')
                              }}
                              title="复制完整 commit"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="font-mono text-[11px] text-slate-500">{formatGitDate(stringifyValue(row.data.committed_datetime))}</div>
                        </div>

                        <div className="min-w-0 pr-2">
                          <div className="line-clamp-2 text-[12px] font-medium leading-5 text-slate-900" title={resolveCommitTitle(row.data)}>
                            {resolveCommitTitle(row.data) || '--'}
                          </div>
                          {stringifyValue(row.data.applied_commit).trim() ? (
                            <div className="mt-1 truncate font-mono text-[11px] text-emerald-700">
                              applied: {stringifyValue(row.data.applied_commit).slice(0, 12)}
                            </div>
                          ) : null}
                        </div>

                        <div>
                          <Badge variant="outline" className={cn('justify-center', statusMeta.className)}>
                            {statusMeta.label}
                          </Badge>
                        </div>

                        <div className="space-y-1">
                          <Badge
                            variant="outline"
                            className={cn('max-w-full truncate justify-center', conflictMeta.className)}
                          >
                            {conflictMeta.label}
                          </Badge>
                          <div className="line-clamp-2 text-[11px] text-slate-500">{conflictMeta.detail}</div>
                        </div>

                        <div>
                          <Badge variant="outline" className={cn('justify-center', targetMeta.className)}>
                            {targetMeta.label}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {patchResources.map((resource) => (
                            <Button
                              key={resource.fileId}
                              variant="outline"
                              size="sm"
                              className={cn(
                                'h-7 min-w-[48px] border-slate-200 px-2 text-[11px] text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700',
                                !resource.exists && 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400',
                              )}
                              disabled={!resource.exists}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (!resource.exists) return
                                onLoadPatchPreview(row, resource)
                              }}
                              title={resource.exists ? resource.fileName : `${resource.label} 暂无`}
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
                            onClick={(e) => {
                              e.stopPropagation()
                              onOpenInspector(row, 'details')
                            }}
                          >
                            详情
                          </Button>
                          {hasActionableConflict ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 justify-start border-amber-200 bg-amber-50/70 px-2 text-[11px] text-amber-800 hover:bg-amber-100"
                              disabled={!canAnalyzeConflictRow(row)}
                              title={baseReportPath.trim() ? '发送到 Patchflow-Agent 分析冲突' : '请先生成 report'}
                              onClick={(e) => {
                                e.stopPropagation()
                                onAnalyzeConflictRow(row)
                              }}
                            >
                              {isAnalyzingConflictRow ? (
                                <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                              ) : (
                                <Search className="mr-1 h-3 w-3" />
                              )}
                              分析冲突
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
                                  : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
                              )}
                              disabled={canApplyBackportedPatch ? !canApplyRow(row) : !canResolveConflictRow(row)}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (canApplyBackportedPatch) {
                                  onApplyRow(row)
                                } else {
                                  onResolveConflictRow(row)
                                }
                              }}
                            >
                              {canApplyBackportedPatch ? '尝试应用' : '尝试解冲突'}
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 border-emerald-200 bg-emerald-50 px-2 text-[11px] text-emerald-700 hover:bg-emerald-100"
                              disabled={!canApplyRow(row)}
                              onClick={(e) => {
                                e.stopPropagation()
                                onApplyRow(row)
                              }}
                            >
                              应用
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
                  <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900">每页 5 条</span>
                  <span className="whitespace-nowrap text-sm text-slate-700">总计: {filteredRows.length}</span>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-slate-700"
                    disabled={currentCommitPage <= 1}
                    onClick={() => onCommitPageChange((prev) => Math.max(1, prev - 1))}
                    aria-label="上一页"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {paginationItems.map((item) =>
                    typeof item === 'number' ? (
                      <Button
                        key={item}
                        variant={item === currentCommitPage ? 'default' : 'ghost'}
                        size="sm"
                        className={cn(
                          'h-8 min-w-8 px-2 text-sm',
                          item === currentCommitPage ? 'bg-slate-950 text-white hover:bg-slate-900' : 'text-slate-700',
                        )}
                        onClick={() => onCommitPageChange(item)}
                      >
                        {item}
                      </Button>
                    ) : (
                      <span key={item} className="px-2 text-sm text-slate-500">
                        ...
                      </span>
                    ),
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-slate-700"
                    disabled={currentCommitPage >= totalCommitPages}
                    onClick={() => onCommitPageChange((prev) => Math.min(totalCommitPages, prev + 1))}
                    aria-label="下一页"
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
