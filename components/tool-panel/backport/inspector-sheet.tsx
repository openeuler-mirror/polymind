'use client'

import { CheckCircle2, Copy, Download, Eye, FileCode2, RefreshCw } from 'lucide-react'

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  buildDisplayPatchResources,
  formatGitDate,
  isSkippedRow,
  resolveBackportProgressText,
  resolveCommitTitle,
  resolveConflictMeta,
  resolveStatusMeta,
  stringifyValue,
} from '@/components/tool-panel/backport/utils'
import { classifyPatchLine, getLightPatchLineClass, type ParsedPatchSummary } from '@/lib/patch-utils'
import type {
  BackportCommitRow,
  BackportConfig,
  BackportOperationResultData,
  BackportPatchPreviewResponse,
  BackportPatchResource,
} from '@/lib/backport-types'
import { cn } from '@/lib/utils'

export type InspectorTab = 'details' | 'patch' | 'compare' | 'manual' | 'yaml'

export type PatchLoadState =
  | { status: 'loading'; resource: BackportPatchResource }
  | { status: 'error'; resource: BackportPatchResource; error: string }
  | {
      status: 'ready'
      resource: BackportPatchResource
      response: BackportPatchPreviewResponse
      summary: ParsedPatchSummary
    }

type ReadyPatchLoadState = Extract<PatchLoadState, { status: 'ready' }>

interface InspectorSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: BackportCommitRow | null
  config: BackportConfig
  inspectorTab: InspectorTab
  onInspectorTabChange: (tab: InspectorTab) => void
  patchAnchorRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>
  activePatchKey: string | null
  activePatchPreview: PatchLoadState | null
  compareLeftResource: BackportPatchResource | null
  compareRightResource: BackportPatchResource | null
  compareLeftPreview: PatchLoadState | null
  compareRightPreview: PatchLoadState | null
  manualPatchText: string
  onManualPatchTextChange: (value: string) => void
  manualPatchLoading: 'check' | 'apply' | null
  manualPatchResult: BackportOperationResultData | null
  onCheckManualPatch: () => void
  onApplyManualPatch: () => void
  onUpdateMergedInTarget: (rowId: string, value: boolean | null) => void
  onCopyText: (text: string, label: string) => void
  onDownloadPatch: (preview: ReadyPatchLoadState) => void
  onLoadPatchPreview: (
    row: BackportCommitRow,
    resource: BackportPatchResource,
    options?: { activate?: boolean }
  ) => Promise<ReadyPatchLoadState | null>
}

function DetailField({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className={cn('mt-1 text-sm text-slate-900', mono && 'break-all font-mono text-[12px]')}>{value || '--'}</div>
    </div>
  )
}

export function InspectorSheet({
  open,
  onOpenChange,
  row,
  config,
  inspectorTab,
  onInspectorTabChange,
  patchAnchorRefs,
  activePatchKey,
  activePatchPreview,
  compareLeftResource,
  compareRightResource,
  compareLeftPreview,
  compareRightPreview,
  manualPatchText,
  onManualPatchTextChange,
  manualPatchLoading,
  manualPatchResult,
  onCheckManualPatch,
  onApplyManualPatch,
  onUpdateMergedInTarget,
  onCopyText,
  onDownloadPatch,
  onLoadPatchPreview,
}: InspectorSheetProps) {
  const patchResources = row ? buildDisplayPatchResources(row.data, row.rowId) : []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[98vw] gap-0 sm:w-[94vw] sm:max-w-none xl:w-[88vw] 2xl:w-[84vw]">
        {row ? (
          <>
            <SheetHeader className="border-b border-slate-200/80 bg-slate-50/70">
              <div className="pr-8">
                <SheetTitle className="text-left text-base text-slate-950">
                  {stringifyValue(row.data.commit || row.data.input_commit).slice(0, 12)} · {resolveCommitTitle(row.data) || '未命名提交'}
                </SheetTitle>
                <SheetDescription className="mt-1 text-left">
                  “详情预览”是以当前这一行 commit 为单位展示完整信息，不是每个单元格各开一个新详情。
                </SheetDescription>
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-hidden">
              <Tabs value={inspectorTab} onValueChange={(value) => onInspectorTabChange(value as InspectorTab)} className="flex h-full flex-col">
                <div className="border-b border-slate-200/80 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <TabsList className="grid w-full max-w-[580px] grid-cols-5">
                      <TabsTrigger value="details">详情</TabsTrigger>
                      <TabsTrigger value="patch">Patch</TabsTrigger>
                      <TabsTrigger value="compare">对比</TabsTrigger>
                      <TabsTrigger value="manual">手动 Patch</TabsTrigger>
                      <TabsTrigger value="yaml">原始 YAML</TabsTrigger>
                    </TabsList>

                    <div className="flex flex-wrap gap-1.5">
                      {patchResources.map((resource) => (
                        <Button
                          key={resource.fileId}
                          variant="outline"
                          size="sm"
                          className="h-8 px-2 text-[11px]"
                          disabled={!resource.exists}
                          onClick={() => {
                            if (!resource.exists) return
                            void onLoadPatchPreview(row, resource)
                          }}
                        >
                          <Eye className="mr-1 h-3.5 w-3.5" />
                          {resource.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                <TabsContent value="details" className="mt-0 flex-1 overflow-auto px-4 py-4">
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                      <div className="mb-3 flex items-center gap-2">
                        <FileCode2 className="h-4 w-4 text-blue-600" />
                        <h4 className="text-sm font-semibold text-slate-950">基本信息</h4>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <DetailField label="完整 Commit" value={stringifyValue(row.data.commit || row.data.input_commit)} mono />
                        <DetailField label="提交时间" value={formatGitDate(stringifyValue(row.data.committed_datetime))} />
                        <DetailField label="标题" value={resolveCommitTitle(row.data)} />
                        <DetailField label="目标分支" value={stringifyValue(row.data.target_branch || config.target_release || '--')} />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                      <div className="mb-3 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <h4 className="text-sm font-semibold text-slate-950">检查结果</h4>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <DetailField label="状态" value={resolveStatusMeta(row.data).label} />
                        <DetailField label="冲突结果" value={resolveConflictMeta(row.data).label} />
                        <DetailField label="冲突检查方式" value={stringifyValue(row.data.conflict_check_method) || '--'} />
                        <DetailField label="已应用 Commit" value={stringifyValue(row.data.applied_commit) || '--'} mono />
                        <DetailField label="回移植进度" value={resolveBackportProgressText(row.data)} />
                        <DetailField label="Merge Commit" value={Boolean(row.data.is_merge_commit) ? '是' : '否'} />
                        <DetailField label="Empty Patch" value={Boolean(row.data.empty_patch) ? '是' : '否'} />
                        <DetailField label="Equivalent Exists" value={Boolean(row.data.equivalent_exists) ? '是' : '否'} />
                        <div className="rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">目标分支结果</div>
                          {isSkippedRow(row.data) ? (
                            <div className="mt-1 text-sm text-slate-700">已跳过</div>
                          ) : (
                            <select
                              value={row.data.merged_in_target === true ? 'true' : row.data.merged_in_target === false ? 'false' : 'none'}
                              onChange={(event) =>
                                onUpdateMergedInTarget(
                                  row.rowId,
                                  event.target.value === 'true' ? true : event.target.value === 'false' ? false : null,
                                )
                              }
                              className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
                            >
                              <option value="true">已合入</option>
                              <option value="false">未合入</option>
                              <option value="none">未设置</option>
                            </select>
                          )}
                        </div>
                      </div>

                      {stringifyValue(row.data.conflict_check_error).trim() ? (
                        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">Conflict Check Error</div>
                          <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-amber-900">
                            {stringifyValue(row.data.conflict_check_error)}
                          </pre>
                        </div>
                      ) : null}

                      {stringifyValue(row.data.merged_check_error).trim() ? (
                        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">Merged Check Detail</div>
                          <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-slate-700">
                            {stringifyValue(row.data.merged_check_error)}
                          </pre>
                        </div>
                      ) : null}

                      {stringifyValue(row.data.error).trim() ? (
                        <div className="mt-3 rounded-xl border border-red-200 bg-red-50/70 p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-red-700">Error</div>
                          <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-red-900">
                            {stringifyValue(row.data.error)}
                          </pre>
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                      <div className="mb-3 flex items-center gap-2">
                        <FileCode2 className="h-4 w-4 text-blue-600" />
                        <h4 className="text-sm font-semibold text-slate-950">Patch 文件</h4>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        {patchResources.map((resource) => (
                          <div key={resource.fileId} className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3">
                            <div className="text-sm font-medium text-slate-900">{resource.label}</div>
                            <div className="mt-1 min-h-8 text-[11px] text-slate-500">{resource.fileName || `${resource.label} 暂无`}</div>
                            <div className="mt-3 flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 flex-1 px-2 text-[11px]"
                                disabled={!resource.exists}
                                onClick={() => {
                                  if (!resource.exists) return
                                  void onLoadPatchPreview(row, resource)
                                }}
                              >
                                查看
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2 text-[11px]"
                                disabled={!resource.exists}
                                onClick={async () => {
                                  if (!resource.exists) return
                                  const preview = await onLoadPatchPreview(row, resource)
                                  if (preview) {
                                    onDownloadPatch(preview)
                                  }
                                }}
                              >
                                下载
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <Accordion type="single" collapsible className="rounded-2xl border border-slate-200/80 bg-white px-4 shadow-sm">
                      <AccordionItem value="raw-yaml" className="border-0">
                        <AccordionTrigger className="text-sm font-semibold text-slate-950">原始 YAML 字段</AccordionTrigger>
                        <AccordionContent>
                          <pre className="overflow-auto whitespace-pre-wrap break-all rounded-xl border border-slate-200 bg-white p-4 font-mono text-[11px] leading-5 text-slate-800 shadow-inner">
                            {JSON.stringify(row.data, null, 2)}
                          </pre>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </div>
                </TabsContent>

                <TabsContent value="patch" className="mt-0 flex-1 overflow-hidden">
                  {!activePatchPreview ? (
                    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
                      先从上方按钮选择一个 Patch，再在这里预览 diff、文件列表和 hunk 导航。
                    </div>
                  ) : activePatchPreview.status === 'loading' ? (
                    <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-500">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      正在读取 Patch...
                    </div>
                  ) : activePatchPreview.status === 'error' ? (
                    <div className="flex h-full items-center justify-center px-6">
                      <div className="max-w-lg rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        {activePatchPreview.error}
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full flex-col">
                      <div className="border-b border-slate-200/80 px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-base font-semibold text-slate-950">
                              {activePatchPreview.resource.label} · {stringifyValue(row.data.commit || row.data.input_commit).slice(0, 12)}
                            </div>
                            <div className="mt-1 text-sm text-slate-500">{activePatchPreview.response.file_name}</div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                              影响文件 {activePatchPreview.summary.files.length}
                            </Badge>
                            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                              +{activePatchPreview.summary.additions}
                            </Badge>
                            <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                              -{activePatchPreview.summary.deletions}
                            </Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2 text-[11px]"
                              onClick={() => onCopyText(activePatchPreview.response.patch_text, activePatchPreview.resource.label)}
                            >
                              <Copy className="mr-1 h-3.5 w-3.5" />
                              复制 Patch
                            </Button>
                            <Button variant="outline" size="sm" className="h-8 px-2 text-[11px]" onClick={() => onDownloadPatch(activePatchPreview)}>
                              <Download className="mr-1 h-3.5 w-3.5" />
                              下载
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)]">
                        <div className="space-y-4 lg:overflow-auto lg:pr-2">
                          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                            <div className="text-sm font-semibold text-slate-950">文件列表</div>
                            <div className="mt-3 space-y-2">
                              {activePatchPreview.summary.files.length === 0 ? (
                                <div className="text-sm text-slate-500">当前 Patch 没有解析出文件变更。</div>
                              ) : (
                                activePatchPreview.summary.files.map((file) => (
                                  <div key={file.id} className="rounded-xl border border-slate-200/70 bg-slate-50/70 px-3 py-2">
                                    <div className="break-all font-mono text-[11px] text-slate-900">{file.path}</div>
                                    <div className="mt-2 flex items-center gap-2 text-[11px]">
                                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                                        +{file.additions}
                                      </Badge>
                                      <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                                        -{file.deletions}
                                      </Badge>
                                      <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                                        hunk {file.hunkIds.length}
                                      </Badge>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                            <div className="text-sm font-semibold text-slate-950">Hunk 导航</div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {activePatchPreview.summary.hunks.length === 0 ? (
                                <div className="text-sm text-slate-500">当前 Patch 没有 hunk。</div>
                              ) : (
                                activePatchPreview.summary.hunks.map((hunk, index) => (
                                  <Button
                                    key={hunk.id}
                                    variant="outline"
                                    size="sm"
                                    className="h-8 max-w-full px-2 text-[11px]"
                                    onClick={() => {
                                      const ref = patchAnchorRefs.current[`${activePatchKey}:${hunk.id}`]
                                      ref?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                    }}
                                  >
                                    #{index + 1}
                                  </Button>
                                ))
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="min-h-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                          <ScrollArea className="h-[calc(100vh-240px)] min-h-[520px] w-full">
                            <div className="min-w-0">
                              {activePatchPreview.summary.rawLines.map((line, index) => {
                                const matchedHunk = activePatchPreview.summary.hunks.find((hunk) => hunk.lineIndex === index) || null
                                const lineType = classifyPatchLine(line)

                                return (
                                  <div
                                    key={`${activePatchKey}:${index}`}
                                    ref={(node) => {
                                      if (matchedHunk) {
                                        patchAnchorRefs.current[`${activePatchKey}:${matchedHunk.id}`] = node
                                      }
                                    }}
                                    className={cn('flex border-b border-slate-100 font-mono text-[11px] leading-5', getLightPatchLineClass(lineType))}
                                  >
                                    <span className="w-14 shrink-0 border-r border-slate-200 bg-slate-50 px-2 py-0.5 text-right text-slate-400">
                                      {index + 1}
                                    </span>
                                    <span className="flex-1 whitespace-pre-wrap break-all px-3 py-0.5">{line || ' '}</span>
                                  </div>
                                )
                              })}
                            </div>
                          </ScrollArea>
                        </div>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="compare" className="mt-0 flex-1 overflow-hidden">
                  {!compareLeftResource?.exists || !compareRightResource?.exists ? (
                    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
                      当前条目缺少可对比的 Patch。建议至少保留“原始 Patch”和“待应用 Patch”再查看这里。
                    </div>
                  ) : (
                    <div className="flex h-full flex-col">
                      <div className="border-b border-slate-200/80 px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-base font-semibold text-slate-950">
                              Patch 对比 · {stringifyValue(row.data.commit || row.data.input_commit).slice(0, 12)}
                            </div>
                            <div className="mt-1 text-sm text-slate-500">
                              左侧是源提交生成的原始 patch，右侧是当前点击“尝试应用”会使用的 patch。
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
                            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                              原始 Patch
                            </Badge>
                            <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                              待应用 Patch
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="grid min-h-0 flex-1 gap-4 p-4 xl:grid-cols-2">
                        {[
                          { side: 'left', resource: compareLeftResource, preview: compareLeftPreview },
                          { side: 'right', resource: compareRightResource, preview: compareRightPreview },
                        ].map(({ side, resource, preview }) => (
                          <div
                            key={side}
                            className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm"
                          >
                            <div className="border-b border-slate-200/80 px-4 py-3">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-slate-950">{resource?.label || '--'}</div>
                                  <div className="mt-1 text-[11px] text-slate-500">
                                    {preview?.status === 'ready' ? preview.response.file_name : resource?.fileName || '未加载'}
                                  </div>
                                </div>
                                {preview?.status === 'ready' ? (
                                  <div className="flex flex-wrap gap-2">
                                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                                      文件 {preview.summary.files.length}
                                    </Badge>
                                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                                      +{preview.summary.additions}
                                    </Badge>
                                    <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                                      -{preview.summary.deletions}
                                    </Badge>
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            {preview?.status === 'loading' || !preview ? (
                              <div className="flex flex-1 items-center justify-center gap-2 px-6 text-sm text-slate-500">
                                <RefreshCw className="h-4 w-4 animate-spin" />
                                正在读取 {resource?.label || 'Patch'}...
                              </div>
                            ) : preview.status === 'error' ? (
                              <div className="flex flex-1 items-center justify-center px-6">
                                <div className="max-w-lg rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                                  {preview.error}
                                </div>
                              </div>
                            ) : (
                              <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                                <div className="space-y-4 lg:overflow-auto lg:pr-2">
                                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4">
                                    <div className="text-sm font-semibold text-slate-950">文件列表</div>
                                    <div className="mt-3 space-y-2">
                                      {preview.summary.files.length === 0 ? (
                                        <div className="text-sm text-slate-500">这个 Patch 没有解析出文件变更。</div>
                                      ) : (
                                        preview.summary.files.map((file) => (
                                          <div key={`${side}-${file.id}`} className="rounded-xl border border-slate-200/70 bg-white px-3 py-2">
                                            <div className="break-all font-mono text-[11px] text-slate-900">{file.path}</div>
                                            <div className="mt-2 flex items-center gap-2 text-[11px]">
                                              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                                                +{file.additions}
                                              </Badge>
                                              <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                                                -{file.deletions}
                                              </Badge>
                                            </div>
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="min-h-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
                                  <ScrollArea className="h-[calc(100vh-300px)] min-h-[460px] w-full">
                                    <div className="min-w-0">
                                      {preview.summary.rawLines.map((line, index) => {
                                        const lineType = classifyPatchLine(line)
                                        return (
                                          <div
                                            key={`${side}:${index}`}
                                            className={cn('flex border-b border-slate-100 font-mono text-[11px] leading-5', getLightPatchLineClass(lineType))}
                                          >
                                            <span className="w-14 shrink-0 border-r border-slate-200 bg-slate-50 px-2 py-0.5 text-right text-slate-400">
                                              {index + 1}
                                            </span>
                                            <span className="flex-1 whitespace-pre-wrap break-all px-3 py-0.5">{line || ' '}</span>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </ScrollArea>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="manual" className="mt-0 flex-1 overflow-auto px-4 py-4">
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-semibold text-slate-950">手动 Patch</h4>
                          <p className="mt-1 text-xs text-slate-500">当前会在目标仓目录执行 git apply --check，通过后再执行 git apply。</p>
                        </div>
                        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                          {config.target_path || '未配置目标仓'}
                        </Badge>
                      </div>

                      <Textarea
                        value={manualPatchText}
                        onChange={(event) => onManualPatchTextChange(event.target.value)}
                        placeholder="把大模型修改后的 patch 粘贴到这里..."
                        className="min-h-[360px] resize-y font-mono text-[11px] leading-5"
                      />

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs text-slate-500">
                          {manualPatchText.trim() ? `当前输入 ${manualPatchText.length} 字符` : '粘贴 patch 后先检查是否能干净应用'}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={manualPatchLoading !== null || !manualPatchText.trim() || !config.target_path.trim()}
                            onClick={onCheckManualPatch}
                          >
                            {manualPatchLoading === 'check' ? <RefreshCw className="mr-1 h-4 w-4 animate-spin" /> : null}
                            检查冲突
                          </Button>
                          <Button
                            size="sm"
                            disabled={
                              manualPatchLoading !== null ||
                              !manualPatchText.trim() ||
                              !config.target_path.trim() ||
                              manualPatchResult?.operation !== 'check_manual_patch' ||
                              manualPatchResult.status !== 'success'
                            }
                            onClick={onApplyManualPatch}
                          >
                            {manualPatchLoading === 'apply' ? <RefreshCw className="mr-1 h-4 w-4 animate-spin" /> : null}
                            应用到目标仓
                          </Button>
                        </div>
                      </div>
                    </div>

                    {manualPatchResult ? (
                      <div
                        className={cn(
                          'rounded-2xl border p-4 shadow-sm',
                          manualPatchResult.status === 'success' ? 'border-emerald-200 bg-emerald-50/60' : 'border-red-200 bg-red-50/60',
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              manualPatchResult.status === 'success'
                                ? 'border-emerald-200 bg-white text-emerald-700'
                                : 'border-red-200 bg-white text-red-700',
                            )}
                          >
                            {manualPatchResult.status === 'success' ? '成功' : '失败'}
                          </Badge>
                          <div className="text-sm font-semibold text-slate-950">{manualPatchResult.summary || '--'}</div>
                        </div>
                        <pre className="mt-3 whitespace-pre-wrap break-all rounded-xl border border-slate-200 bg-white p-3 font-mono text-[11px] leading-5 text-slate-800">
                          {manualPatchResult.manual_patch?.stderr ||
                            manualPatchResult.manual_patch?.stdout ||
                            manualPatchResult.diagnostics?.error_text ||
                            '无额外输出'}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                </TabsContent>

                <TabsContent value="yaml" className="mt-0 flex-1 overflow-auto px-4 py-4">
                  <pre className="overflow-auto whitespace-pre-wrap break-all rounded-2xl border border-slate-200 bg-white p-4 font-mono text-[11px] leading-5 text-slate-800 shadow-sm">
                    {JSON.stringify(row.data, null, 2)}
                  </pre>
                </TabsContent>
              </Tabs>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
            先在表格里选择一条 commit，再查看详情、Patch 预览或原始 YAML。
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
