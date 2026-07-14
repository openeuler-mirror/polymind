'use client'

import { FileCode2, GitBranch, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { formatGitDate } from '@/components/tool-panel/backport/utils'
import type { BackportGitLogEntry, BackportTimelineEntry } from '@/lib/backport-types'
import { cn } from '@/lib/utils'

type SupportTab = 'timeline' | 'git' | 'conflict-report'

interface SupportPanelProps {
  supportTab: SupportTab
  onSupportTabChange: (tab: SupportTab) => void
  targetPath: string
  running: boolean
  timeline: BackportTimelineEntry[]
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
              timeline.map((entry) => (
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
