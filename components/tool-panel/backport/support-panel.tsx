'use client'

import { FileCode2, GitBranch, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  formatGitDate,
  resolveRunSummaryDetectionText,
  resolveRunSummaryFinalText,
} from '@/components/tool-panel/backport/utils'
import type {
  BackportExecutionRunSummary,
  BackportGitLogEntry,
  BackportTimelineEntry,
} from '@/lib/backport-types'
import { cn } from '@/lib/utils'

type SupportTab = 'timeline' | 'summary' | 'git' | 'conflict-report'

interface SupportPanelProps {
  supportTab: SupportTab
  onSupportTabChange: (tab: SupportTab) => void
  targetPath: string
  running: boolean
  timeline: BackportTimelineEntry[]
  executionSummary: BackportExecutionRunSummary | null
  conflictReportText: string
  gitLogEntries: BackportGitLogEntry[]
  gitLogLoading: boolean
  gitShowLoading: boolean
  gitShowContent: string
  gitLogError: string
  selectedGitRevision: string | null
  selectedGitEntry: BackportGitLogEntry | null
  onLoadGitLog: () => void
  onLoadGitShow: (revision: string) => void
}

export function SupportPanel({
  supportTab,
  onSupportTabChange,
  targetPath,
  running,
  timeline,
  executionSummary,
  conflictReportText,
  gitLogEntries,
  gitLogLoading,
  gitShowLoading,
  gitShowContent,
  gitLogError,
  selectedGitRevision,
  selectedGitEntry,
  onLoadGitLog,
  onLoadGitShow,
}: SupportPanelProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">辅助信息</CardTitle>
            <CardDescription className="truncate">
              {supportTab === 'timeline'
                ? '记录操作轨迹与报错信息'
                : supportTab === 'summary'
                  ? '按 Commit 汇总检测、处理和最终结果'
                : supportTab === 'conflict-report'
                  ? '汇总当前 report 中已生成的冲突报告'
                  : `目标仓目录：${targetPath || '--'}`}
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <div className="rounded-md border bg-muted/40 p-0.5">
              <Button
                variant={supportTab === 'timeline' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-3"
                onClick={() => onSupportTabChange('timeline')}
              >
                执行记录
              </Button>
              <Button
                variant={supportTab === 'summary' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-3"
                onClick={() => onSupportTabChange('summary')}
              >
                运行总览
              </Button>
              <Button
                variant={supportTab === 'conflict-report' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-3"
                onClick={() => onSupportTabChange('conflict-report')}
              >
                冲突报告
              </Button>
              <Button
                variant={supportTab === 'git' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-3"
                onClick={() => onSupportTabChange('git')}
              >
                Git Log
              </Button>
            </div>
            {supportTab === 'git' ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-slate-200 px-2 text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                disabled={gitLogLoading || running}
                onClick={onLoadGitLog}
              >
                <RefreshCw className={cn('h-4 w-4', gitLogLoading && 'animate-spin')} />
              </Button>
            ) : (
              <Button variant="ghost" size="sm" disabled>
                <FileCode2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {supportTab === 'timeline' ? (
          <div className="max-h-[360px] space-y-2 overflow-auto pr-2">
            {timeline.length === 0 ? (
              <div className="rounded-md border border-dashed px-3 py-10 text-center text-xs text-muted-foreground">
                还没有执行记录
              </div>
            ) : (
              timeline.map(entry => (
                <div
                  key={entry.id}
                  className={cn(
                    'rounded-md border p-2',
                    entry.level === 'error'
                      ? 'border-red-200 bg-red-50/40'
                      : entry.level === 'success'
                        ? 'border-emerald-200 bg-emerald-50/40'
                        : 'border-slate-200 bg-slate-50/40',
                  )}
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={cn(
                        'inline-block h-2 w-2 rounded-full',
                        entry.level === 'error'
                          ? 'bg-red-500'
                          : entry.level === 'success'
                            ? 'bg-emerald-500'
                            : 'bg-slate-400',
                      )}
                    />
                    <span className="font-medium">{entry.title}</span>
                    <span className="ml-auto font-mono text-muted-foreground">
                      {new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}
                    </span>
                  </div>
                  {entry.details ? (
                    <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px] text-muted-foreground">
                      {entry.details}
                    </pre>
                  ) : null}
                </div>
              ))
            )}
          </div>
        ) : supportTab === 'summary' ? (
          <div className="max-h-[460px] space-y-3 overflow-auto pr-2">
            {!executionSummary ? (
              <div className="rounded-md border border-dashed px-3 py-10 text-center text-xs text-muted-foreground">
                暂无一键运行总览
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <span>
                    Commit <strong className="text-slate-900">{executionSummary.counts.total}</strong>
                  </span>
                  <span>
                    已应用 <strong className="text-slate-900">{executionSummary.counts.applied}</strong>
                  </span>
                  <span>
                    直接应用{' '}
                    <strong className="text-slate-900">
                      {executionSummary.counts.direct_applied}
                    </strong>
                  </span>
                  <span>
                    解冲突后应用{' '}
                    <strong className="text-slate-900">
                      {executionSummary.counts.conflict_resolved}
                    </strong>
                  </span>
                  <span>
                    等价存在{' '}
                    <strong className="text-slate-900">
                      {executionSummary.counts.equivalent_exists}
                    </strong>
                  </span>
                  <span>
                    失败 <strong className="text-red-700">{executionSummary.counts.failed}</strong>
                  </span>
                  <span>
                    未处理{' '}
                    <strong className="text-slate-900">
                      {executionSummary.counts.unprocessed}
                    </strong>
                  </span>
                  <span className="min-w-0 basis-full truncate font-mono text-[10px] text-slate-500">
                    {executionSummary.path}
                  </span>
                </div>

                {executionSummary.cases.map(item => {
                  const unchecked =
                    item.detection.state === 'not_started' ||
                    item.detection.state === 'running'
                  return (
                    <div key={item.id} className="overflow-hidden rounded-md border bg-white">
                      <div className="flex min-h-10 items-center gap-2 border-b bg-slate-50 px-3 py-2 text-xs">
                        <span className="font-mono text-slate-500">#{item.row}</span>
                        <span className="font-mono font-semibold text-blue-700">
                          {item.commit.slice(0, 12)}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium text-slate-900">
                          {item.title}
                        </span>
                      </div>
                      <div className="px-3 py-2 text-xs">
                        <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-1.5">
                          <span className="text-slate-500">
                            {unchecked ? '检测状态' : '检测结论'}
                          </span>
                          <span
                            className={cn(
                              'font-medium',
                              item.detection.result === 'conflict'
                                ? 'text-amber-700'
                                : item.detection.result === 'failed'
                                  ? 'text-red-700'
                                  : unchecked
                                    ? 'text-slate-600'
                                    : 'text-emerald-700',
                            )}
                          >
                            {resolveRunSummaryDetectionText(item)}
                          </span>
                        </div>
                        {!unchecked ? (
                          <>
                            <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 border-t border-dashed py-1.5">
                              <span className="text-slate-500">最终结果</span>
                              <span
                                className={cn(
                                  'font-medium',
                                  item.final.result === 'failed'
                                    ? 'text-red-700'
                                    : item.final.result === 'applied'
                                      ? 'text-emerald-700'
                                      : 'text-slate-700',
                                )}
                              >
                                {resolveRunSummaryFinalText(item)}
                              </span>
                            </div>
                            {item.handling.report ? (
                              <div className="mt-1 border-l-2 border-slate-300 bg-slate-50 px-2.5 py-2 text-[11px] leading-5 text-slate-600">
                                <span className="font-medium text-slate-700">解冲突报告：</span>
                                {item.handling.report}
                              </div>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        ) : supportTab === 'conflict-report' ? (
          <div className="max-h-[360px] overflow-auto rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm">
            {conflictReportText ? (
              <Textarea
                readOnly
                value={conflictReportText}
                className="min-h-[320px] resize-none border-slate-200 bg-slate-50/70 font-mono text-[12px] leading-6 text-slate-800 shadow-none focus-visible:ring-0"
              />
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3 py-10 text-center text-xs text-slate-500">
                当前 report 暂无冲突报告
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {gitLogError ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{gitLogError}</div>
            ) : null}

            <div className="grid gap-3 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.1fr)]">
              <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                <div className="flex items-center gap-2 border-b bg-slate-50/90 px-3 py-2 text-[11px] font-semibold text-slate-700">
                  <FileCode2 className="h-3.5 w-3.5 text-blue-500" />
                  提交列表
                  <span className="ml-auto rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[10px] text-slate-600">
                    {gitLogEntries.length}
                  </span>
                </div>
                <div className="max-h-[320px] overflow-auto">
                  {gitLogEntries.length === 0 ? (
                    <div className="px-3 py-10 text-center text-xs text-muted-foreground">
                      {gitLogLoading ? '正在读取 git log...' : '暂无 git log 数据'}
                    </div>
                  ) : (
                    gitLogEntries.map((entry) => (
                      <button
                        key={entry.hash}
                        className={cn(
                          'w-full border-b px-3 py-2.5 text-left transition-colors hover:bg-slate-50/80',
                          selectedGitRevision === entry.hash
                            ? 'bg-blue-50/50 shadow-[inset_3px_0_0_rgb(59,130,246)]'
                            : 'bg-white',
                        )}
                        onClick={() => onLoadGitShow(entry.hash)}
                      >
                        <div className="flex items-center gap-2 text-[11px]">
                          <span
                            className={cn(
                              'font-mono font-semibold',
                              selectedGitRevision === entry.hash ? 'text-blue-700' : 'text-slate-900',
                            )}
                          >
                            {entry.shortHash}
                          </span>
                          <span className="ml-auto font-mono text-slate-500">{formatGitDate(entry.committedAt)}</span>
                        </div>
                        <div className="mt-1 line-clamp-2 text-xs font-medium text-slate-900">{entry.subject}</div>
                        {entry.refs ? (
                          <div className="mt-1 inline-flex max-w-full items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-emerald-700">
                            <GitBranch className="h-3 w-3 shrink-0" />
                            <span className="truncate">{entry.refs}</span>
                          </div>
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                <div className="flex items-center gap-2 border-b bg-slate-50/90 px-3 py-2 text-[11px] font-semibold text-slate-700">
                  <FileCode2 className="h-3.5 w-3.5 text-blue-500" />
                  {selectedGitEntry ? `提交详情 ${selectedGitEntry.shortHash}` : '提交详情'}
                </div>
                <div className="max-h-[320px] overflow-auto px-3 py-3">
                  {selectedGitEntry ? (
                    <div className="mb-3 space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2.5">
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="break-all font-mono font-semibold text-slate-900">{selectedGitEntry.hash}</span>
                        <span className="ml-auto shrink-0 font-mono text-slate-500">{formatGitDate(selectedGitEntry.committedAt)}</span>
                      </div>
                      <p className="text-xs font-medium text-slate-900">{selectedGitEntry.subject}</p>
                      {selectedGitEntry.refs ? (
                        <p className="inline-flex max-w-full items-center gap-1 rounded-md bg-white px-1.5 py-0.5 font-mono text-[11px] text-emerald-700">
                          <GitBranch className="h-3 w-3 shrink-0" />
                          <span className="truncate">{selectedGitEntry.refs}</span>
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {gitShowLoading ? (
                    <div className="py-10 text-center text-xs text-muted-foreground">正在读取提交详情...</div>
                  ) : gitShowContent ? (
                    <pre className="whitespace-pre-wrap break-all rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] leading-5 text-slate-700">
                      {gitShowContent}
                    </pre>
                  ) : (
                    <div className="py-10 text-center text-xs text-muted-foreground">请选择左侧提交查看详情</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
