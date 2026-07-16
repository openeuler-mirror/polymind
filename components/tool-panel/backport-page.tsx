'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, RefreshCw, RotateCcw, Save, Wrench } from 'lucide-react'

import { CommitTable } from '@/components/tool-panel/backport/commit-table'
import {
  InspectorSheet,
  type InspectorTab,
  type PatchLoadState,
} from '@/components/tool-panel/backport/inspector-sheet'
import { SupportPanel } from '@/components/tool-panel/backport/support-panel'
import {
  DEFAULT_BACKPORT_CONFIG,
  DEFAULT_COMMIT_MESSAGE_TEMPLATE,
  type BackportConflictAnalysisPatch,
  type RowStatusKind,
  buildCompactBackportConflictAnalysisMessage,
  buildPatchPreviewKey,
  buildPatchResources,
  deepClone,
  isSkippedRow,
  mergeCommitRows,
  normalizeBackportConfig,
  normalizeCommitRows,
  parseBoolLike,
  parseMergedLike,
  resolveBackportProgressText,
  resolveCommitTitle,
  resolveConflictMeta,
  resolveStatusMeta,
  stageLabel,
  stringifyValue,
} from '@/components/tool-panel/backport/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { handleAgentStreamEvent } from '@/lib/agent-stream-events'
import { parseUnifiedDiff } from '@/lib/patch-utils'
import {
  BackportBrowseEntry,
  BackportCommitItem,
  BackportCommitRow,
  BackportConfig,
  BackportGitLogEntry,
  BackportOperationResultData,
  BackportPatchResource,
  BackportRuntimeStatus,
  BackportRunAllControl,
  BackportRunProgress,
  BackportStage,
  BackportTimelineEntry,
  resetRunAllStateForGeneratedReport,
} from '@/lib/backport-types'
import { useChatStore } from '@/lib/store'
import type { Message, ModelConfig } from '@/lib/types'
import { cn } from '@/lib/utils'
import { backportService } from '@/services/backport-service'
import { modelService } from '@/services/model-service'
import { patchflowAgentService } from '@/services/patchflow-agent-service'
import { generateUUID } from '@/lib/utils'

const BACKPORT_COMMIT_PAGE_SIZE = 5
const BACKPORT_MODEL_EMPTY_VALUE = '__none__'
const BACKPORT_SUPPORTED_PROVIDERS = new Set([
  'openai',
  'deepseek',
  'siliconflow',
  'minimax',
  'local',
  'moonshotai',
  'zhipuai',
  'xai',
  'alibaba',
])

const isBackportCompatibleModel = (model: ModelConfig): boolean => {
  const provider = String(model.provider || '').trim().toLowerCase()
  if (!model.enabled) return false
  if (provider === 'custom') return model.compatibility === 'openai'
  return BACKPORT_SUPPORTED_PROVIDERS.has(provider)
}

const formatBackportModelLabel = (model: ModelConfig): string => {
  const provider = String(model.provider || '').trim()
  return provider ? `${model.name} · ${provider}` : model.name
}

const toRunAllNumber = (value: number | undefined): number => {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : 0
}

const hasRunAllNumber = (value: number | undefined): value is number => {
  return Number.isFinite(Number(value))
}

const conflictReportStatusLabel = (status: string): string => {
  const normalized = status.trim().toLowerCase()
  const labels: Record<string, string> = {
    success: '成功',
    failed: '失败',
    skipped: '跳过',
    pending: '等待中',
  }
  return labels[normalized] || status || '未知'
}

const buildConflictReportText = (rows: BackportCommitRow[]): string => {
  const sections = rows
    .map((row) => {
      const summary = row.data.conflict_summary
      if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return ''

      const summaryData = summary as Record<string, unknown>
      const status = stringifyValue(summaryData.status).trim()
      const normalizedStatus = status.toLowerCase()
      const score = stringifyValue(summaryData.score).trim()
      const reason = stringifyValue(summaryData.reason).trim()
      const error = stringifyValue(summaryData.error).trim()
      const commit = stringifyValue(row.data.commit || row.data.input_commit).trim()
      const shortCommit = commit ? commit.slice(0, 12) : '未知 commit'
      const title = resolveCommitTitle(row.data)
      const heading = `${shortCommit}${title ? ` ${title}` : ''}`

      if (normalizedStatus === 'success') {
        return [
          heading,
          '',
          `评分：${score || '-'}`,
          '',
          '原因：',
          reason || '未返回原因',
        ].join('\n')
      }

      const lines = [
        heading,
        '',
        `状态：${conflictReportStatusLabel(status)}`,
      ]

      if (error || normalizedStatus === 'failed') {
        lines.push('', `错误：${error || '未返回错误信息'}`)
      }
      if (reason) {
        lines.push('', '原因：', reason)
      }
      return lines.join('\n')
    })
    .filter(Boolean)

  return sections.map((section, index) => `## ${index + 1}. ${section}`).join('\n\n')
}

export function BackportPage() {
  const { toast } = useToast()
  const patchAnchorRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const workingCommitsRef = useRef<BackportCommitRow[]>([])
  const configRef = useRef<BackportConfig>(DEFAULT_BACKPORT_CONFIG)
  const runAllRowStartedAtRef = useRef<Record<string, number>>({})
  const runAllLastProcessedCountRef = useRef(0)
  const runAllReportRefreshInFlightRef = useRef(false)
  const runAllPendingReportRefreshPathRef = useRef<string | null>(null)

  const [config, setConfig] = useState<BackportConfig>(DEFAULT_BACKPORT_CONFIG)
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [backportModels, setBackportModels] = useState<ModelConfig[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [runtimeStatus, setRuntimeStatus] = useState<BackportRuntimeStatus | null>(null)
  const [loadingRuntimeStatus, setLoadingRuntimeStatus] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [configExpanded, setConfigExpanded] = useState(false)
  const [stage, setStage] = useState<BackportStage>('idle')
  const [running, setRunning] = useState(false)
  const [runningLabel, setRunningLabel] = useState('')
  const [runAllProgress, setRunAllProgress] = useState<BackportRunProgress | null>(null)
  const [runAllControl, setRunAllControl] = useState<BackportRunAllControl | null>(null)
  const [runAllPauseState, setRunAllPauseState] = useState<'idle' | 'running' | 'pause_requested' | 'paused'>('idle')
  const [runAllStatusCardVisible, setRunAllStatusCardVisible] = useState(false)
  const [analyzingConflictRowId, setAnalyzingConflictRowId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [excelPath, setExcelPath] = useState('')
  const [configPath, setConfigPath] = useState('')
  const [baseReportPath, setBaseReportPath] = useState('')
  const [filteredReportPath, setFilteredReportPath] = useState('')
  const [originalCommits, setOriginalCommits] = useState<BackportCommitRow[]>([])
  const [workingCommits, setWorkingCommits] = useState<BackportCommitRow[]>([])
  const [titleFilter, setTitleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | RowStatusKind>('all')
  const [conflictFilter, setConflictFilter] = useState<'all' | 'true' | 'false'>('all')
  const [mergedFilter, setMergedFilter] = useState<'all' | 'true' | 'false' | 'none' | 'skipped'>(
    'all'
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [commitPage, setCommitPage] = useState(1)
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([])
  const [timeline, setTimeline] = useState<BackportTimelineEntry[]>([])
  const [supportTab, setSupportTab] = useState<'timeline' | 'git' | 'conflict-report'>('timeline')
  const [gitLogEntries, setGitLogEntries] = useState<BackportGitLogEntry[]>([])
  const [gitLogLoading, setGitLogLoading] = useState(false)
  const [selectedGitRevision, setSelectedGitRevision] = useState<string | null>(null)
  const [gitShowLoading, setGitShowLoading] = useState(false)
  const [gitShowContent, setGitShowContent] = useState('')
  const [gitLogError, setGitLogError] = useState('')
  const [pathBrowserOpen, setPathBrowserOpen] = useState(false)
  const [browsePath, setBrowsePath] = useState('')
  const [browseEntries, setBrowseEntries] = useState<BackportBrowseEntry[]>([])
  const [browseParentPath, setBrowseParentPath] = useState<string | null>(null)
  const [browseLoading, setBrowseLoading] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('details')
  const [inspectedRowId, setInspectedRowId] = useState<string | null>(null)
  const [activePatchKey, setActivePatchKey] = useState<string | null>(null)
  const [patchPreviews, setPatchPreviews] = useState<Record<string, PatchLoadState>>({})
  const [manualPatchText, setManualPatchText] = useState('')
  const [manualPatchLoading, setManualPatchLoading] = useState<'check' | 'apply' | null>(null)
  const [manualPatchResult, setManualPatchResult] = useState<BackportOperationResultData | null>(
    null
  )
  const [commitMessagePreviewLoadingRowId, setCommitMessagePreviewLoadingRowId] = useState<
    string | null
  >(null)
  const [lastSavedCommitMessageTemplate, setLastSavedCommitMessageTemplate] = useState(
    DEFAULT_BACKPORT_CONFIG.commit_message_template
  )

  const resetRunAllGeneratedReportState = () => {
    const nextState = resetRunAllStateForGeneratedReport({
      pauseState: runAllPauseState,
      progress: runAllProgress,
      control: runAllControl,
      rowStartedAt: runAllRowStartedAtRef.current,
      lastProcessedCount: runAllLastProcessedCountRef.current,
      reportRefreshInFlight: runAllReportRefreshInFlightRef.current,
      pendingReportRefreshPath: runAllPendingReportRefreshPathRef.current,
      statusCardVisible: runAllStatusCardVisible,
    })

    setRunAllPauseState(nextState.pauseState)
    setRunAllProgress(nextState.progress)
    setRunAllControl(nextState.control)
    runAllRowStartedAtRef.current = nextState.rowStartedAt
    runAllLastProcessedCountRef.current = nextState.lastProcessedCount
    runAllReportRefreshInFlightRef.current = nextState.reportRefreshInFlight
    runAllPendingReportRefreshPathRef.current = nextState.pendingReportRefreshPath
    setRunAllStatusCardVisible(nextState.statusCardVisible)
  }

  const titleCandidates = useMemo(() => {
    const uniqueTitles = new Set<string>()
    for (const row of workingCommits) {
      const title = resolveCommitTitle(row.data)
      if (title) uniqueTitles.add(title)
      if (uniqueTitles.size >= 300) break
    }
    return [...uniqueTitles].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')).slice(0, 80)
  }, [workingCommits])

  const compatibleBackportModels = useMemo(
    () => backportModels.filter(isBackportCompatibleModel),
    [backportModels]
  )

  const selectedBackportModel = useMemo(
    () => compatibleBackportModels.find(model => model.id === config.backport_model_id) || null,
    [compatibleBackportModels, config.backport_model_id]
  )

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim()
    const normalizedTitleFilter = titleFilter.trim().toLowerCase()

    return workingCommits.filter(row => {
      const item = row.data
      const title = resolveCommitTitle(item)
      const commit = stringifyValue(item.commit || item.input_commit || '')
      const isSkipped = isSkippedRow(item)
      const mergedValue = item.merged_in_target === undefined ? null : item.merged_in_target
      const status = resolveStatusMeta(item)

      if (normalizedTitleFilter && !title.toLowerCase().includes(normalizedTitleFilter)) {
        return false
      }

      if (statusFilter !== 'all' && status.kind !== statusFilter) {
        return false
      }

      if (conflictFilter !== 'all') {
        const expected = conflictFilter === 'true'
        const hasActionableConflict = Boolean(item.has_conflict) && !isSkipped
        if (hasActionableConflict !== expected) {
          return false
        }
      }

      if (mergedFilter !== 'all') {
        if (mergedFilter === 'skipped') {
          if (!isSkipped) return false
        } else {
          if (isSkipped) return false
          if (mergedFilter === 'true' && mergedValue !== true) return false
          if (mergedFilter === 'false' && mergedValue !== false) return false
          if (mergedFilter === 'none' && mergedValue !== null) return false
        }
      }

      if (!query) {
        return true
      }

      const [rawKey, ...rest] = query.includes(':')
        ? query.split(':')
        : query.includes('=')
          ? query.split('=')
          : ['', query]
      const key = rawKey.trim().toLowerCase()
      const value = rest.join(':').trim()

      if (!key) {
        return (
          title.toLowerCase().includes(query.toLowerCase()) ||
          commit.toLowerCase().includes(query.toLowerCase())
        )
      }

      if (['title', 'commit_title', 'tiltle'].includes(key)) {
        return title.toLowerCase().includes(value.toLowerCase())
      }

      if (['commit', 'sha'].includes(key)) {
        return commit.toLowerCase().startsWith(value.toLowerCase())
      }

      if (['has_conflict', 'conflict'].includes(key)) {
        const expected = parseBoolLike(value)
        if (expected === 'invalid') return false
        return (Boolean(item.has_conflict) && !isSkipped) === expected
      }

      if (['merged_in_target', 'merged'].includes(key)) {
        const expected = parseMergedLike(value)
        if (expected === 'invalid') return false
        if (expected === 'skipped') return isSkipped
        if (isSkipped) return false
        return mergedValue === expected
      }

      return false
    })
  }, [workingCommits, titleFilter, statusFilter, conflictFilter, mergedFilter, searchQuery])

  const totalCommitPages = useMemo(
    () => Math.max(1, Math.ceil(filteredRows.length / BACKPORT_COMMIT_PAGE_SIZE)),
    [filteredRows.length]
  )
  const currentCommitPage = Math.min(Math.max(commitPage, 1), totalCommitPages)
  const paginatedRows = useMemo(() => {
    const start = (currentCommitPage - 1) * BACKPORT_COMMIT_PAGE_SIZE
    return filteredRows.slice(start, start + BACKPORT_COMMIT_PAGE_SIZE)
  }, [currentCommitPage, filteredRows])
  const paginationItems = useMemo(() => {
    if (totalCommitPages <= 7) {
      return Array.from({ length: totalCommitPages }, (_, index) => index + 1)
    }
    const pages = new Set<number>([
      1,
      totalCommitPages,
      currentCommitPage - 1,
      currentCommitPage,
      currentCommitPage + 1,
    ])
    const ordered = [...pages]
      .filter(page => page >= 1 && page <= totalCommitPages)
      .sort((a, b) => a - b)

    const items: Array<number | string> = []
    for (const page of ordered) {
      const previous = items[items.length - 1]
      if (typeof previous === 'number' && page - previous > 1) {
        items.push(`ellipsis-${previous}-${page}`)
      }
      items.push(page)
    }
    return items
  }, [currentCommitPage, totalCommitPages])

  const selectedRowSet = useMemo(() => new Set(selectedRowIds), [selectedRowIds])
  const allFilteredSelected = useMemo(
    () => paginatedRows.length > 0 && paginatedRows.every(row => selectedRowSet.has(row.rowId)),
    [paginatedRows, selectedRowSet]
  )
  const firstBlockingConflictRow = useMemo(
    () => workingCommits.find((row) => Boolean(row.data.has_conflict) && !isSkippedRow(row.data)) || null,
    [workingCommits],
  )
  const firstBlockingConflictRowId = firstBlockingConflictRow?.rowId || null
  const hasPendingRows = useMemo(
    () => workingCommits.some((row) => stringifyValue(row.data.status).trim().toLowerCase() === 'pending'),
    [workingCommits],
  )
  const canContinueReport = Boolean(baseReportPath.trim()) && hasPendingRows && !firstBlockingConflictRow

  const selectedGitEntry = useMemo(
    () =>
      gitLogEntries.find(
        entry => entry.hash === selectedGitRevision || entry.shortHash === selectedGitRevision
      ) || null,
    [gitLogEntries, selectedGitRevision]
  )
  const inspectedRow = useMemo(
    () => workingCommits.find(row => row.rowId === inspectedRowId) || null,
    [workingCommits, inspectedRowId]
  )
  const inspectedPatchResources = useMemo(() => {
    if (!inspectedRow) return []
    return buildPatchResources(inspectedRow.data, inspectedRow.rowId).filter(
      resource => resource.exists
    )
  }, [inspectedRow])
  const activePatchPreview = activePatchKey ? patchPreviews[activePatchKey] : null
  const compareLeftResource = useMemo(
    () => inspectedPatchResources[0] || null,
    [inspectedPatchResources]
  )
  const compareRightResource = useMemo(
    () => inspectedPatchResources[1] || null,
    [inspectedPatchResources]
  )
  const compareLeftPreview =
    inspectedRow && compareLeftResource
      ? patchPreviews[buildPatchPreviewKey(inspectedRow.rowId, compareLeftResource)] || null
      : null
  const compareRightPreview =
    inspectedRow && compareRightResource
      ? patchPreviews[buildPatchPreviewKey(inspectedRow.rowId, compareRightResource)] || null
      : null

  useEffect(() => {
    setCommitPage(1)
  }, [searchQuery, titleFilter, statusFilter, conflictFilter, mergedFilter])

  useEffect(() => {
    setCommitPage(prev => Math.min(Math.max(prev, 1), totalCommitPages))
  }, [totalCommitPages])

  useEffect(() => {
    workingCommitsRef.current = workingCommits
  }, [workingCommits])

  useEffect(() => {
    configRef.current = config
  }, [config])

  const addTimeline = (
    title: string,
    level: BackportTimelineEntry['level'] = 'info',
    details?: string
  ) => {
    setTimeline(prev => {
      const next = [
        {
          id: `timeline-${Date.now()}-${Math.random()}`,
          timestamp: Date.now(),
          level,
          title,
          details,
        },
        ...prev,
      ]
      return next.slice(0, 200)
    })
  }

  const getRunAllRowKey = (row: BackportCommitRow) => (
    stringifyValue(row.data.row_id || row.data.commit || row.data.input_commit || row.rowId).trim() || row.rowId
  )

  const formatRunAllRowState = (data: BackportCommitItem | undefined) => {
    if (!data) return '未知'
    const status = resolveStatusMeta(data).label
    const conflict = resolveConflictMeta(data).label
    return `${status} / ${conflict}`
  }

  const formatRunAllDuration = (startedAt: number | undefined) => {
    if (!startedAt) return '耗时 --'
    const elapsedSeconds = Math.max(0, (Date.now() - startedAt) / 1000)
    return elapsedSeconds >= 60
      ? `耗时 ${(elapsedSeconds / 60).toFixed(1)} 分钟`
      : `耗时 ${elapsedSeconds.toFixed(1)} 秒`
  }

  const refreshRunAllReportSnapshot = async (reportPath: string) => {
    const normalizedPath = reportPath.trim()
    if (!normalizedPath) return

    if (runAllReportRefreshInFlightRef.current) {
      runAllPendingReportRefreshPathRef.current = normalizedPath
      return
    }

    runAllReportRefreshInFlightRef.current = true
    try {
      const response = await backportService.loadReport({
        config: configRef.current,
        baseReportPath: normalizedPath,
      })
      const commits = response.parsedResult?.report?.commits
      if (Array.isArray(commits)) {
        const nextRows = normalizeCommitRows(commits)
        setOriginalCommits(nextRows)
        setWorkingCommits(nextRows)
      }
    } catch (cause) {
      console.warn('Failed to refresh Backport report snapshot:', cause)
    } finally {
      runAllReportRefreshInFlightRef.current = false
      const pendingPath = runAllPendingReportRefreshPathRef.current
      runAllPendingReportRefreshPathRef.current = null
      if (pendingPath) {
        void refreshRunAllReportSnapshot(pendingPath)
      }
    }
  }

  const applyOperationResult = (result: BackportOperationResultData | null) => {
    if (!result) {
      throw new Error('未返回可解析的 backport_result 结果块')
    }

    setStage(result.stage || (result.status === 'success' ? 'interactive_editing' : 'failed'))

    if (result.status === 'failed') {
      const message = result.summary || result.diagnostics?.error_text || 'Backport 执行失败'
      setError(message)
      addTimeline('执行失败', 'error', message)
    } else {
      setError('')
      if (result.summary) {
        const generatedReportPath =
          result.operation === 'generate_report'
            ? result.artifacts?.report_path || result.report?.report_path || ''
            : ''
        addTimeline(result.summary, 'success', generatedReportPath || undefined)
      }
    }

    if (result.operation === 'generate_report' || result.operation === 'run_all') {
      setFilteredReportPath('')
      setConfig(prev => ({ ...prev, current_filtered_report_path: '' }))
      setPatchPreviews({})
      setActivePatchKey(null)
      setInspectedRowId(null)
      setInspectorTab('details')
      setInspectorOpen(false)
    }

    if (result.operation === 'generate_report') {
      resetRunAllGeneratedReportState()
    }

    if (result.artifacts?.config_path) {
      setConfigPath(result.artifacts.config_path)
    }

    if (result.artifacts?.report_path || result.artifacts?.base_report_path) {
      const reportPath = result.artifacts.base_report_path || result.artifacts.report_path || ''
      if (reportPath) {
        setBaseReportPath(reportPath)
        setConfig(prev => ({ ...prev, current_report_path: reportPath }))
      }
    }

    if (result.artifacts?.filtered_report_path) {
      setFilteredReportPath(result.artifacts.filtered_report_path)
      setConfig(prev => ({
        ...prev,
        current_filtered_report_path: result.artifacts?.filtered_report_path || '',
      }))
    }

    if (Array.isArray(result.report?.commits)) {
      const nextRows = normalizeCommitRows(result.report.commits)
      if (
        result.operation === 'generate_report' ||
        result.operation === 'continue_report' ||
        result.operation === 'run_all'
      ) {
        setOriginalCommits(nextRows)
        setWorkingCommits(nextRows)
      } else {
        setWorkingCommits(prev => mergeCommitRows(prev, result.report?.commits || []))
      }
      setSelectedRowIds([])
    }

    if (Array.isArray(result.git?.entries)) {
      setGitLogEntries(result.git.entries)
      if (result.git.entries[0]?.hash) {
        setSelectedGitRevision(
          prev => prev || result.git?.revision || result.git?.entries?.[0]?.hash || null
        )
      }
    }

    if (typeof result.git?.revision === 'string') {
      setSelectedGitRevision(result.git.revision)
    }

    if (typeof result.git?.show_content === 'string') {
      setGitShowContent(result.git.show_content)
    }
  }

  const handleAgentEvent = (event: any) => {
    const payload = event.payload || {}

    if (event.type === 'message.started') {
      addTimeline('开始执行', 'info')
      return
    }

    if (event.type === 'thinking') {
      const thinkingText = String(payload.thinking || '').trim()
      if (thinkingText) {
        addTimeline('规划执行步骤', 'info', thinkingText)
      }
      return
    }

    if (event.type === 'tool.call.started') {
      addTimeline(`${String(payload.tool_name || 'unknown')} 工具开始调用`, 'info')
      return
    }

    if (event.type === 'tool.call.response') {
      addTimeline(
        `${String(payload.name || payload.tool_name || 'unknown')} 工具调用${payload.is_error ? '失败' : '完成'}`,
        payload.is_error ? 'error' : 'success'
      )
      return
    }

    if (event.type === 'stream.error' || event.type === 'client.error') {
      addTimeline('流式执行失败', 'error', JSON.stringify(payload, null, 2))
    }
  }

  const handleRunAllProgress = (progress: BackportRunProgress) => {
    setRunAllStatusCardVisible(true)
    setRunAllProgress(progress)
    const progressRowId = stringifyValue(progress.current_row_id).trim()
    if (progressRowId && !runAllRowStartedAtRef.current[progressRowId]) {
      runAllRowStartedAtRef.current[progressRowId] = Date.now()
    }

    const nextProcessedCount = toRunAllNumber(progress.processed_count)
    const shouldRecordCompletedRows = nextProcessedCount > runAllLastProcessedCountRef.current
    if (shouldRecordCompletedRows) {
      const previousRows = workingCommitsRef.current
      const previousRowsById = new Map(previousRows.map(row => [getRunAllRowKey(row), row]))
      const updatedRows = normalizeCommitRows(progress.updated_commits || [])
      for (const row of updatedRows) {
        const rowKey = getRunAllRowKey(row)
        const previousRow = previousRowsById.get(rowKey)
        const commit = stringifyValue(row.data.commit || row.data.input_commit || rowKey).slice(0, 12)
        const title = resolveCommitTitle(row.data)
        const previousState = formatRunAllRowState(previousRow?.data)
        const nextState = formatRunAllRowState(row.data)
        const duration = formatRunAllDuration(runAllRowStartedAtRef.current[rowKey] || runAllRowStartedAtRef.current[progressRowId])
        const failed = resolveStatusMeta(row.data).kind === 'failed'
        addTimeline(
          `Commit ${commit} 运行完成`,
          failed ? 'error' : 'success',
          [
            title ? `标题: ${title}` : '',
            `状态: ${previousState} -> ${nextState}`,
            duration,
            progress.message ? `说明: ${progress.message}` : '',
          ].filter(Boolean).join('\n')
        )
        delete runAllRowStartedAtRef.current[rowKey]
      }
      runAllLastProcessedCountRef.current = nextProcessedCount
      setSupportTab('timeline')
    }

    if (Array.isArray(progress.updated_commits) && progress.updated_commits.length > 0) {
      setWorkingCommits(prev => mergeCommitRows(prev, progress.updated_commits || []))
      setOriginalCommits(prev => mergeCommitRows(prev, progress.updated_commits || []))
    }
    if (progress.current_report_path) {
      setBaseReportPath(progress.current_report_path)
      setConfig(prev => ({ ...prev, current_report_path: progress.current_report_path || '' }))
      void refreshRunAllReportSnapshot(progress.current_report_path)
    }
  }

  const runOperation = async (
    label: string,
    runner: () => Promise<Awaited<ReturnType<typeof backportService.generateReport>>>
  ) => {
    setRunning(true)
    setRunningLabel(label)
    setGitLogError('')
    addTimeline(`步骤开始: ${label}`, 'info')

    try {
      const response = await runner()
      applyOperationResult(response.parsedResult)
      return response
    } catch (cause) {
      console.error(`Failed to run Backport operation: ${label}`, cause)
      const message = cause instanceof Error ? cause.message : `${label} 失败`
      setError(message)
      setStage('failed')
      addTimeline(`${label} 失败`, 'error', message)
      toast({
        title: '错误',
        description: message,
        variant: 'destructive',
      })
      throw cause
    } finally {
      setRunning(false)
      setRunningLabel('')
    }
  }

  const loadRuntimeStatus = async (nextConfig: BackportConfig) => {
    setLoadingRuntimeStatus(true)
    try {
      const status = await backportService.getRuntimeStatus(nextConfig)
      setRuntimeStatus(status)
    } catch (cause) {
      console.error('Failed to load Backport runtime status:', cause)
      setRuntimeStatus({
        ok: false,
        model_configured: false,
        model_name: '',
        model_provider: '',
        api_key_available: false,
        cvekit_available: false,
        cvekit_path: '',
        errors: [cause instanceof Error ? cause.message : '加载运行环境状态失败'],
      })
    } finally {
      setLoadingRuntimeStatus(false)
    }
  }

  const loadPage = async () => {
    setLoadingConfig(true)
    setLoadingModels(true)
    try {
      const nextConfig = await backportService.getConfig()
      let sanitizedConfig = normalizeBackportConfig(nextConfig)
      try {
        const models = await modelService.getModels()
        setBackportModels(models)
        const compatibleModels = models.filter(isBackportCompatibleModel)
        if (!sanitizedConfig.backport_model_id) {
          const defaultModel =
            compatibleModels.find(model => model.isDefault) ||
            (compatibleModels.length === 1 ? compatibleModels[0] : null)
          if (defaultModel) {
            sanitizedConfig = {
              ...sanitizedConfig,
              backport_model_id: defaultModel.id,
            }
          }
        }
      } catch (modelError) {
        console.error('Failed to load Backport model list:', modelError)
        toast({
          title: '提示',
          description: '加载 Backport 运行模型列表失败',
          variant: 'destructive',
        })
      }
      setConfig(sanitizedConfig)
      setExcelPath(sanitizedConfig.current_excel_path || '')
      setBaseReportPath(sanitizedConfig.current_report_path || '')
      setFilteredReportPath(sanitizedConfig.current_filtered_report_path || '')
      setLastSavedCommitMessageTemplate(sanitizedConfig.commit_message_template)
      void loadRuntimeStatus(sanitizedConfig)
      if (sanitizedConfig.current_report_path.trim()) {
        addTimeline('已恢复当前 report 路径', 'info', sanitizedConfig.current_report_path.trim())
      }
    } catch (cause) {
      console.error('Failed to load Backport page:', cause)
      toast({
        title: '错误',
        description: '加载 Backport 配置失败',
        variant: 'destructive',
      })
    } finally {
      setLoadingConfig(false)
      setLoadingModels(false)
    }
  }

  useEffect(() => {
    loadPage()
  }, [])

  useEffect(() => {
    setManualPatchText('')
    setManualPatchResult(null)
    setManualPatchLoading(null)
  }, [inspectedRowId])

  useEffect(() => {
    if (inspectorTab !== 'compare' || !inspectedRow) return
    if (compareLeftResource?.exists) {
      void loadPatchPreview(inspectedRow, compareLeftResource, { activate: false })
    }
    if (
      compareRightResource?.exists &&
      compareRightResource.fileId !== compareLeftResource?.fileId
    ) {
      void loadPatchPreview(inspectedRow, compareRightResource, { activate: false })
    }
  }, [inspectorTab, inspectedRow, compareLeftResource, compareRightResource])

  const handleSaveConfig = async (silent = false) => {
    setSavingConfig(true)
    try {
      const persistedConfig = normalizeBackportConfig(config)
      const templateChanged =
        persistedConfig.commit_message_template !== lastSavedCommitMessageTemplate
      const response = await backportService.updateConfig(persistedConfig)
      setConfig(persistedConfig)
      setLastSavedCommitMessageTemplate(persistedConfig.commit_message_template)
      void loadRuntimeStatus(persistedConfig)
      if (templateChanged) {
        setWorkingCommits(prev =>
          prev.map(row =>
            stringifyValue(row.data.commit_message_preview).trim()
              ? {
                  ...row,
                  data: {
                    ...row.data,
                    commit_message_preview_stale: true,
                  },
                }
              : row
          )
        )
      }
      const savedConfigPath = response.config_path || ''
      if (savedConfigPath) {
        setConfigPath(savedConfigPath)
      }
      addTimeline('配置已保存', 'success', savedConfigPath || undefined)
      if (!silent) {
        toast({
          title: '成功',
          description: 'Backport 配置已保存',
        })
      }
    } catch (cause) {
      console.error('Failed to save Backport config:', cause)
      toast({
        title: '错误',
        description: '保存 Backport 配置失败',
        variant: 'destructive',
      })
    } finally {
      setSavingConfig(false)
    }
  }

  const handleRefreshCommitMessagePreview = async (row: BackportCommitRow) => {
    if (!baseReportPath.trim()) {
      toast({
        title: '提示',
        description: '请先生成 report',
      })
      return
    }

    setCommitMessagePreviewLoadingRowId(row.rowId)
    try {
      const preview = await backportService.previewCommitMessage(
        {
          config,
          baseReportPath,
          workingReportPath: filteredReportPath || baseReportPath,
          row: deepClone(row.data),
          commitMessageTemplate: config.commit_message_template,
        },
        handleAgentEvent
      )
      setWorkingCommits(prev =>
        prev.map(item =>
          item.rowId === row.rowId
            ? {
                ...item,
                data: {
                  ...item.data,
                  commit_message_preview: preview.message,
                  commit_message_context: preview.context,
                  source_detection: preview.source_detection,
                  commit_message_warnings: preview.warnings,
                  commit_message_template_snapshot: config.commit_message_template,
                  commit_message_preview_stale: false,
                },
              }
            : item
        )
      )
      toast({
        title: '预览已刷新',
        description:
          resolveCommitTitle(row.data) ||
          stringifyValue(row.data.commit || row.data.input_commit) ||
          'Commit Message',
      })
    } catch (cause) {
      toast({
        title: '预览刷新失败',
        description: cause instanceof Error ? cause.message : 'Commit Message 预览刷新失败',
        variant: 'destructive',
      })
    } finally {
      setCommitMessagePreviewLoadingRowId(null)
    }
  }

  const handleGenerateReport = async () => {
    if (!excelPath.trim()) {
      toast({
        title: '提示',
        description: '请先填写 Excel 路径',
      })
      return
    }

    await handleSaveConfig(true)
    setConfig(prev => ({ ...prev, current_excel_path: excelPath.trim() }))
    await runOperation('生成配置与报告', () =>
      backportService.generateReport(
        {
          config,
          excelPath: excelPath.trim(),
        },
        handleAgentEvent
      )
    )
  }

  const handleRunAll = async () => {
    const normalizedExcelPath = excelPath.trim()
    const normalizedBaseReportPath = baseReportPath.trim()
    if (!normalizedExcelPath && !normalizedBaseReportPath) {
      toast({
        title: '提示',
        description: '请先填写 Excel 路径或生成可继续的 report',
      })
      return
    }

    await handleSaveConfig(true)
    const runConfig = normalizeBackportConfig({
      ...config,
      current_excel_path: normalizedExcelPath,
    })
    configRef.current = runConfig
    setConfig(runConfig)
    setExcelPath(normalizedExcelPath)
    setRunAllProgress(null)
    setRunAllControl(null)
    setRunAllPauseState('running')
    setRunAllStatusCardVisible(true)
    runAllRowStartedAtRef.current = {}
    runAllLastProcessedCountRef.current = 0
    runAllReportRefreshInFlightRef.current = false
    runAllPendingReportRefreshPathRef.current = null

    let response: Awaited<ReturnType<typeof backportService.runAll>>
    try {
      response = await runOperation('一键运行', () =>
        backportService.runAll(
          {
            config: runConfig,
            excelPath: normalizedExcelPath,
            baseReportPath: normalizedBaseReportPath,
            workingReportPath: filteredReportPath.trim() || normalizedBaseReportPath,
          },
          handleAgentEvent,
          handleRunAllProgress,
          {
            onRunCreated: (control) => {
              setRunAllControl(control)
              setRunAllPauseState('running')
            },
            onRunUpdated: (run) => {
              if (run.pause_requested && run.status === 'running') {
                setRunAllPauseState('pause_requested')
              }
            },
          },
        )
      )
    } catch (cause) {
      setRunAllControl(null)
      setRunAllPauseState('idle')
      setRunAllProgress(null)
      setRunAllStatusCardVisible(false)
      runAllRowStartedAtRef.current = {}
      runAllLastProcessedCountRef.current = 0
      runAllReportRefreshInFlightRef.current = false
      runAllPendingReportRefreshPathRef.current = null
      throw cause
    }
    setRunAllControl(null)
    if (response.parsedResult?.stage === 'paused') {
      setRunAllPauseState('paused')
      toast({
        title: '已暂停',
        description: response.parsedResult.summary || '当前 report 已保存，可继续一键运行',
      })
      return
    }
    setRunAllPauseState('idle')
    if (response.parsedResult?.stage === 'completed') {
      toast({
        title: '完成',
        description: 'Backport 已完成一键运行',
      })
    } else if (response.parsedResult?.stage === 'interactive_editing') {
      toast({
        title: '已暂停',
        description: response.parsedResult.summary || '需要人工处理后继续',
      })
    }
  }

  const handlePauseRunAll = async () => {
    if (!runAllControl || runAllPauseState !== 'running') return
    const previousProgress = runAllProgress
    setRunAllPauseState('pause_requested')
    setRunAllProgress((current) => ({
      ...(current || {}),
      phase: 'pause_requested',
      message: '正在完成当前 commit，完成后暂停并保存 report',
    }))
    try {
      await runAllControl.pause()
    } catch (cause) {
      console.error('Failed to pause Backport run_all:', cause)
      setRunAllPauseState('running')
      setRunAllProgress(previousProgress)
      toast({
        title: '暂停失败',
        description: cause instanceof Error ? cause.message : '无法请求暂停一键运行',
        variant: 'destructive',
      })
    }
  }

  const handleContinueReport = async () => {
    if (!baseReportPath.trim()) {
      toast({
        title: '提示',
        description: '当前没有可继续检查的 report',
        duration: 1200,
      })
      return
    }
    if (firstBlockingConflictRow) {
      toast({
        title: '提示',
        description: '请先检测或处理当前冲突',
        duration: 1200,
      })
      return
    }
    if (!hasPendingRows) {
      toast({
        title: '提示',
        description: '当前没有待检查的提交',
        duration: 1200,
      })
      return
    }

    await runOperation('继续检查', () =>
      backportService.continueReport(
        {
          config,
          baseReportPath: baseReportPath.trim(),
        },
        handleAgentEvent
      )
    )
  }

  const handleLoadGitLog = async () => {
    setGitLogLoading(true)
    setGitLogError('')
    try {
      const response = await runOperation('刷新 git log', () =>
        backportService.loadGitLog({ config }, handleAgentEvent)
      )
      const result = response.parsedResult
      if (result?.status === 'failed') {
        setGitLogError(result.summary || result.diagnostics?.error_text || '刷新 git log 失败')
      }
    } catch (cause) {
      setGitLogError(cause instanceof Error ? cause.message : '刷新 git log 失败')
    } finally {
      setGitLogLoading(false)
    }
  }

  const handleLoadGitShow = async (revision: string) => {
    setSelectedGitRevision(revision)
    setGitShowLoading(true)
    setGitLogError('')
    try {
      const response = await runOperation('读取 git show', () =>
        backportService.loadGitShow(
          {
            config,
            revision,
          },
          handleAgentEvent
        )
      )
      const result = response.parsedResult
      if (result?.status === 'failed') {
        setGitLogError(result.summary || result.diagnostics?.error_text || '读取 git show 失败')
      }
    } catch (cause) {
      setGitLogError(cause instanceof Error ? cause.message : '读取 git show 失败')
    } finally {
      setGitShowLoading(false)
    }
  }

  const loadBrowsePath = async (path?: string) => {
    setBrowseLoading(true)
    try {
      const response = await backportService.browsePath(path)
      setBrowsePath(response.current_path)
      setBrowseEntries(response.entries)
      setBrowseParentPath(response.parent_path || null)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '读取服务器路径失败'
      toast({
        title: '错误',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setBrowseLoading(false)
    }
  }

  const openPathBrowser = async () => {
    setPathBrowserOpen(true)
    const currentExcelPath = excelPath.trim()
    const initialBrowsePath = currentExcelPath
      ? currentExcelPath.replace(/\/[^/]*$/, '') || '/'
      : undefined
    await loadBrowsePath(initialBrowsePath)
  }

  const resolveCommitsForSave = (): {
    commits: BackportCommitItem[]
    source: 'selected' | 'filtered' | 'all'
  } => {
    const selectedSet = new Set(selectedRowIds)
    const hasSelections = selectedSet.size > 0
    const hasActiveFilters =
      searchQuery.trim().length > 0 ||
      titleFilter.trim().length > 0 ||
      statusFilter !== 'all' ||
      conflictFilter !== 'all' ||
      mergedFilter !== 'all'

    if (hasSelections) {
      return {
        source: 'selected',
        commits: workingCommits
          .filter(row => selectedSet.has(row.rowId))
          .map(row => deepClone(row.data)),
      }
    }

    if (hasActiveFilters) {
      return {
        source: 'filtered',
        commits: filteredRows.map(row => deepClone(row.data)),
      }
    }

    return {
      source: 'all',
      commits: workingCommits.map(row => deepClone(row.data)),
    }
  }

  const handleExecuteSelected = async () => {
    const resolved = resolveCommitsForSave()
    if (!baseReportPath.trim()) {
      toast({
        title: '提示',
        description: '请先生成 report',
      })
      return
    }
    if (resolved.commits.length === 0) {
      toast({
        title: '提示',
        description: '当前没有可执行的条目',
      })
      return
    }

    await handleSaveConfig(true)
    await runOperation('执行选中提交', () =>
      backportService.executeSelected(
        {
          config,
          baseReportPath,
          workingReportPath: filteredReportPath || baseReportPath,
          selectedCommits: resolved.commits,
          source: resolved.source,
        },
        handleAgentEvent
      )
    )
  }

  const resolveRowApplyValue = (row: BackportCommitRow): string => {
    const commitValue = stringifyValue(
      row.data.row_id || row.data.commit || row.data.input_commit
    ).trim()
    if (commitValue) return commitValue
    const resources = buildPatchResources(row.data, row.rowId)
    return resources.some(resource => resource.exists) ? row.rowId : ''
  }

  const canApplyRow = (row: BackportCommitRow): boolean => {
    if (running) return false
    if (stringifyValue(row.data.status).trim().toLowerCase() === 'pending') return false
    if (
      isSkippedRow(row.data) ||
      row.data.merged_in_target === true ||
      Boolean(row.data.empty_patch) ||
      Boolean(row.data.equivalent_exists)
    )
      return false
    if (stringifyValue(row.data.applied_commit).trim()) return false
    return resolveRowApplyValue(row).length > 0 && baseReportPath.trim().length > 0
  }

  const handleApplyRow = async (row: BackportCommitRow) => {
    await handleSaveConfig(true)
    await runOperation('应用单条提交', () =>
      backportService.applyRow(
        {
          config,
          baseReportPath,
          workingReportPath: filteredReportPath || baseReportPath,
          row: deepClone(row.data),
        },
        handleAgentEvent
      )
    )
  }

  const handleCheckManualPatch = async () => {
    const patchText = manualPatchText.trim()
    if (!patchText) {
      toast({
        title: '提示',
        description: '请先粘贴要检查的 Patch',
      })
      return
    }
    setManualPatchLoading('check')
    setManualPatchResult(null)
    try {
      await handleSaveConfig(true)
      const response = await backportService.checkManualPatch({ config, patchText })
      const result = response.parsedResult
      setManualPatchResult(result)
      addTimeline(
        result?.status === 'success' ? '手动 Patch 检查通过' : '手动 Patch 检查失败',
        result?.status === 'success' ? 'success' : 'error',
        result?.diagnostics?.error_text || result?.manual_patch?.stderr || result?.summary
      )
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '手动 Patch 检查失败'
      setManualPatchResult({
        operation: 'check_manual_patch',
        status: 'failed',
        summary: message,
        diagnostics: { error_text: message },
      })
    } finally {
      setManualPatchLoading(null)
    }
  }

  const handleApplyManualPatch = async () => {
    const patchText = manualPatchText.trim()
    if (!patchText) return
    setManualPatchLoading('apply')
    setManualPatchResult(null)
    try {
      await handleSaveConfig(true)
      const response = await backportService.applyManualPatch({ config, patchText })
      const result = response.parsedResult
      setManualPatchResult(result)
      addTimeline(
        result?.status === 'success' ? '手动 Patch 已应用' : '手动 Patch 应用失败',
        result?.status === 'success' ? 'success' : 'error',
        result?.diagnostics?.error_text || result?.manual_patch?.stderr || result?.summary
      )
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '手动 Patch 应用失败'
      setManualPatchResult({
        operation: 'apply_manual_patch',
        status: 'failed',
        summary: message,
        diagnostics: { error_text: message },
      })
    } finally {
      setManualPatchLoading(null)
    }
  }

  const canResolveConflictRow = (row: BackportCommitRow): boolean => {
    return !running
      && row.rowId === firstBlockingConflictRowId
      && Boolean(row.data.has_conflict)
      && !isSkippedRow(row.data)
      && baseReportPath.trim().length > 0
  }

  const handleResolveConflictRow = async (row: BackportCommitRow) => {
    await handleSaveConfig(true)
    await runOperation('处理冲突条目', () =>
      backportService.tryResolve(
        {
          config,
          baseReportPath,
          workingReportPath: filteredReportPath || baseReportPath,
          row: deepClone(row.data),
        },
        handleAgentEvent,
      ),
    )
  }

  const canRecheckConflictRow = (row: BackportCommitRow): boolean => {
    return !running
      && row.rowId === firstBlockingConflictRowId
      && Boolean(row.data.has_conflict)
      && !isSkippedRow(row.data)
      && baseReportPath.trim().length > 0
  }

  const handleRecheckConflictRow = async (row: BackportCommitRow) => {
    await runOperation('检测当前冲突', () =>
      backportService.recheckConflict(
        {
          config,
          baseReportPath,
          workingReportPath: filteredReportPath || baseReportPath,
          row: deepClone(row.data),
        },
        handleAgentEvent
      )
    )
  }

  const canAnalyzeConflictRow = (row: BackportCommitRow): boolean => {
    return (
      !running &&
      !analyzingConflictRowId &&
      Boolean(row.data.has_conflict) &&
      !isSkippedRow(row.data) &&
      baseReportPath.trim().length > 0
    )
  }

  const handleAnalyzeConflictRow = async (row: BackportCommitRow) => {
    if (!Boolean(row.data.has_conflict)) return
    if (!baseReportPath.trim()) {
      toast({
        title: '提示',
        description: '请先生成 report 后再分析冲突',
      })
      return
    }

    setAnalyzingConflictRowId(row.rowId)
    let conversationId: string | null = null
    let thinkingMessageId: string | null = null

    try {
      await handleSaveConfig(true)

      const currentWorkingReportPath = filteredReportPath.trim() || baseReportPath.trim()
      const patchResources = buildPatchResources(row.data, row.rowId)
        .filter(resource => resource.exists)
        .filter(resource => resource.kind === 'original' || resource.kind === 'backported')
      const analysisPatches: BackportConflictAnalysisPatch[] = []
      for (const resource of patchResources) {
        try {
          const response = await backportService.loadPatchPreview({
            baseReportPath: baseReportPath.trim(),
            workingReportPath: currentWorkingReportPath,
            row: deepClone(row.data),
            kind: resource.kind,
          })
          analysisPatches.push({ resource, response })
        } catch (cause) {
          analysisPatches.push({
            resource,
            error: cause instanceof Error ? cause.message : '读取 Patch 失败',
          })
        }
      }

      const taskMessage = buildCompactBackportConflictAnalysisMessage({
        config,
        baseReportPath: baseReportPath.trim(),
        workingReportPath: currentWorkingReportPath,
        row,
        patches: analysisPatches,
      })

      const agentId = await patchflowAgentService.getOrCreatePatchflowAgent()
      const chatStore = useChatStore.getState()
      conversationId = await chatStore.createConversation(agentId, 'Patchflow-Agent')
      useChatStore.setState(state => ({
        conversations: state.conversations.map(conversation =>
          conversation.id === conversationId
            ? { ...conversation, skipReconnect: true }
            : conversation
        ),
      }))
      const sessionId = useChatStore
        .getState()
        .conversations.find(conversation => conversation.id === conversationId)?.sessionId
      if (!sessionId) return

      const userMessage: Message = {
        id: generateUUID(),
        role: 'user',
        content: taskMessage,
        timestamp: new Date(),
      }
      chatStore.addMessage(conversationId, userMessage)
      chatStore.setStreaming(conversationId, true)

      thinkingMessageId = generateUUID()
      const thinkingMessage: Message = {
        id: thinkingMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
        skipReconnect: true,
      }
      chatStore.addMessage(conversationId, thinkingMessage)

      addTimeline(
        '已发起冲突分析',
        'info',
        resolveCommitTitle(row.data) ||
          stringifyValue(row.data.row_id || row.data.commit || row.rowId)
      )

      let assistantMessageId: string | null = null
      await chatStore.sendMessageToAgent(agentId, sessionId, taskMessage, eventData => {
        const store = useChatStore.getState()
        assistantMessageId = handleAgentStreamEvent({
          store,
          conversationId: conversationId as string,
          thinkingMessageId: thinkingMessageId as string,
          assistantMessageId,
          eventData,
          skipReconnect: true,
        })
      })

      if (assistantMessageId) {
        const store = useChatStore.getState()
        const assistantMessage = store.conversations
          .find(conversation => conversation.id === conversationId)
          ?.messages.find(message => message.id === assistantMessageId)

        if (assistantMessage?.isStreaming) {
          store.updateMessage(conversationId, assistantMessageId, {
            isStreaming: false,
          })
          store.setStreaming(conversationId, false)
        }
      }
    } catch (cause) {
      console.error('Failed to analyze backport conflict:', cause)
      const message = cause instanceof Error ? cause.message : '冲突分析失败'
      addTimeline('冲突分析失败', 'error', message)

      if (conversationId && thinkingMessageId) {
        const store = useChatStore.getState()
        store.deleteMessage(conversationId, thinkingMessageId)
        store.addMessage(conversationId, {
          id: generateUUID(),
          role: 'assistant',
          content: '冲突分析失败，请重试。',
          timestamp: new Date(),
          isStreaming: false,
        })
        store.setStreaming(conversationId, false)
      }

      toast({
        title: '错误',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setAnalyzingConflictRowId(null)
    }
  }

  const handleResetWorkingRows = () => {
    setWorkingCommits(deepClone(originalCommits))
    setSelectedRowIds([])
    setTitleFilter('')
    setStatusFilter('all')
    setConflictFilter('all')
    setMergedFilter('all')
    setSearchQuery('')
    setCommitPage(1)
    setInspectorOpen(false)
    setInspectedRowId(null)
    setActivePatchKey(null)
    addTimeline('恢复原始列表', 'info', `恢复到 ${originalCommits.length} 条`)
  }

  const handleDeleteSelectedRows = () => {
    const selected = new Set(selectedRowIds)
    if (selected.size === 0) return
    setWorkingCommits(prev => prev.filter(row => !selected.has(row.rowId)))
    if (inspectedRowId && selected.has(inspectedRowId)) {
      setInspectorOpen(false)
      setInspectedRowId(null)
      setActivePatchKey(null)
    }
    setSelectedRowIds([])
    addTimeline('删除选中条目', 'info', `删除 ${selected.size} 条`)
  }

  const handleResetAll = () => {
    setStage('idle')
    setRunning(false)
    setRunningLabel('')
    setError('')
    setExcelPath('')
    setConfigPath('')
    setBaseReportPath('')
    setFilteredReportPath('')
    setOriginalCommits([])
    setWorkingCommits([])
    setTitleFilter('')
    setStatusFilter('all')
    setConflictFilter('all')
    setMergedFilter('all')
    setSearchQuery('')
    setCommitPage(1)
    setSelectedRowIds([])
    setTimeline([])
    setGitLogEntries([])
    setSelectedGitRevision(null)
    setGitShowContent('')
    setGitLogError('')
    setInspectorOpen(false)
    setInspectedRowId(null)
    setInspectorTab('details')
    setActivePatchKey(null)
    setPatchPreviews({})
  }

  const toggleRowSelection = (rowId: string, checked: boolean) => {
    setSelectedRowIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(rowId)
      else next.delete(rowId)
      return [...next]
    })
  }

  const toggleSelectAllFiltered = (checked: boolean) => {
    if (!checked) {
      setSelectedRowIds([])
      return
    }
    setSelectedRowIds(paginatedRows.map(row => row.rowId))
  }

  const handleCopyText = async (text: string, label: string) => {
    if (!text.trim()) return
    try {
      await navigator.clipboard.writeText(text)
      toast({
        title: '已复制',
        description: `${label} 已复制到剪贴板`,
      })
    } catch (cause) {
      console.error(`Failed to copy ${label}:`, cause)
      toast({
        title: '复制失败',
        description: `无法复制 ${label}`,
        variant: 'destructive',
      })
    }
  }

  const handleDownloadPatch = (preview: Extract<PatchLoadState, { status: 'ready' }>) => {
    const blob = new Blob([preview.response.patch_text], { type: 'text/x-diff;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = preview.response.file_name || `${preview.resource.kind}.patch`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  const openInspector = (row: BackportCommitRow, tab: InspectorTab = 'details') => {
    setInspectedRowId(row.rowId)
    setInspectorTab(tab)
    setInspectorOpen(true)
  }

  const loadPatchPreview = async (
    row: BackportCommitRow,
    resource: BackportPatchResource,
    options: { activate?: boolean } = {}
  ): Promise<Extract<PatchLoadState, { status: 'ready' }> | null> => {
    if (!resource.exists || !baseReportPath.trim()) return null

    const shouldActivate = options.activate ?? true
    const previewKey = buildPatchPreviewKey(row.rowId, resource)
    if (shouldActivate) {
      setInspectedRowId(row.rowId)
      setInspectorTab('patch')
      setInspectorOpen(true)
      setActivePatchKey(previewKey)
    }

    const existingPreview = patchPreviews[previewKey]
    if (existingPreview?.status === 'ready') {
      return existingPreview
    }

    setPatchPreviews(prev => ({
      ...prev,
      [previewKey]: { status: 'loading', resource },
    }))

    try {
      const response = await backportService.loadPatchPreview({
        baseReportPath,
        workingReportPath: filteredReportPath || baseReportPath,
        row: deepClone(row.data),
        kind: resource.kind,
      })
      const summary = parseUnifiedDiff(resource.kind, response.patch_text)
      setPatchPreviews(prev => ({
        ...prev,
        [previewKey]: {
          status: 'ready',
          resource,
          response,
          summary,
        },
      }))
      return {
        status: 'ready',
        resource,
        response,
        summary,
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '读取 Patch 失败'
      setPatchPreviews(prev => ({
        ...prev,
        [previewKey]: {
          status: 'error',
          resource,
          error: message,
        },
      }))
      toast({
        title: '错误',
        description: message,
        variant: 'destructive',
      })
      return null
    }
  }

  const updateMergedInTarget = (rowId: string, value: boolean | null) => {
    setWorkingCommits(prev =>
      prev.map(item =>
        item.rowId === rowId
          ? {
              ...item,
              data: {
                ...item.data,
                merged_in_target: value,
              },
            }
          : item
      )
    )
  }

  const rowSummary = useMemo(() => {
    const total = workingCommits.length
    return {
      total,
      success: workingCommits.filter(row => resolveStatusMeta(row.data).kind === 'success').length,
      conflict: workingCommits.filter(row => resolveStatusMeta(row.data).kind === 'conflict')
        .length,
      noop: workingCommits.filter(row => resolveStatusMeta(row.data).kind === 'noop').length,
      skipped: workingCommits.filter(row => resolveStatusMeta(row.data).kind === 'skipped').length,
      unmatched: workingCommits.filter(row => resolveStatusMeta(row.data).kind === 'unmatched')
        .length,
      failed: workingCommits.filter(row => resolveStatusMeta(row.data).kind === 'failed').length,
    }
  }, [workingCommits])

  const conflictReportText = useMemo(
    () => buildConflictReportText(workingCommits),
    [workingCommits],
  )

  const runAllPhaseLabel = useMemo(() => {
    if (!runAllProgress?.phase) return ''
    const labels: Record<string, string> = {
      initializing: '初始化',
      checking: '检查',
      applying: '应用',
      resolving: '解冲突',
      skipped: '跳过',
      failed: '失败',
      completed: '完成',
      pause_requested: '暂停中',
      paused: '已暂停',
    }
    return labels[runAllProgress.phase] || runAllProgress.phase
  }, [runAllProgress])

  const runAllDisplayLabel = useMemo(() => {
    if (runAllPauseState === 'paused') return '已暂停'
    if (runAllPauseState === 'pause_requested') return '暂停中'
    return runAllPhaseLabel || '运行中'
  }, [runAllPauseState, runAllPhaseLabel])

  const runAllDisplayMessage = useMemo(() => {
    if (runAllPauseState === 'pause_requested') return '正在完成当前 commit，完成后暂停并保存 report'
    if (runAllPauseState === 'paused') return '已暂停，report 已保存，可继续'
    return runAllProgress?.message || '正在处理 Backport 任务'
  }, [runAllPauseState, runAllProgress?.message])

  const runAllProgressPercent = useMemo(() => {
    const current = toRunAllNumber(runAllProgress?.current_index)
    const total = toRunAllNumber(runAllProgress?.total)
    if (total <= 0) return 0
    return Math.min(100, Math.max(0, Math.round((current / total) * 100)))
  }, [runAllProgress])

  const hasRunAllIndex =
    hasRunAllNumber(runAllProgress?.current_index) && hasRunAllNumber(runAllProgress?.total)

  return (
    <div className="h-full w-full overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.08),transparent_36%),linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,1))]">
      <div className="mx-auto max-w-7xl space-y-4 p-4">
        <div className="flex flex-col gap-3 rounded-3xl border border-slate-200/80 bg-white/85 p-5 shadow-[0_18px_60px_-28px_rgba(15,23,42,0.35)] backdrop-blur xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-2 text-blue-700">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Backport 工作台</h2>
              <p className="text-sm text-slate-600">
                面向补丁回移植的任务管理界面，支持生成报告、跟踪进度、处理冲突并查看相关 Patch 产物
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                'border-slate-200 bg-slate-50 text-slate-700',
                stage === 'completed' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                stage === 'failed' && 'border-red-200 bg-red-50 text-red-700'
              )}
            >
              {stageLabel(stage)}
            </Badge>
            <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
              总计 {rowSummary.total}
            </Badge>
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
              成功 {rowSummary.success}
            </Badge>
            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
              冲突 {rowSummary.conflict}
            </Badge>
            {rowSummary.unmatched > 0 ? (
              <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
                未匹配 {rowSummary.unmatched}
              </Badge>
            ) : null}
            <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
              无需移植 {rowSummary.noop + rowSummary.skipped}
            </Badge>
            <Button variant="outline" size="sm" onClick={handleResetAll}>
              <RotateCcw className="mr-1 h-4 w-4" />
              重置页面
            </Button>
          </div>
          {runAllStatusCardVisible && runAllProgress ? (
            <div className="xl:basis-full">
              <div className="rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-3 text-blue-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-white text-blue-700">
                      <RefreshCw
                        className={cn(
                          'h-3.5 w-3.5',
                          runAllPauseState !== 'paused' && 'animate-spin'
                        )}
                      />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        <span>一键运行 · {runAllDisplayLabel}</span>
                        {hasRunAllIndex ? (
                          <span className="rounded-md border border-blue-200 bg-white px-1.5 py-0.5 font-mono text-[11px] text-blue-700">
                            {runAllProgress.current_index}/{runAllProgress.total}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 line-clamp-2 text-xs leading-5 text-blue-700">
                        {runAllDisplayMessage}
                        {runAllProgress.current_title ? (
                          <span className="ml-2 font-mono text-blue-800">{runAllProgress.current_title}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs text-blue-700">
                    <span>已处理 {toRunAllNumber(runAllProgress.processed_count)}</span>
                    <span>失败 {toRunAllNumber(runAllProgress.failed_count)}</span>
                    <span className="font-mono">{runAllProgressPercent}%</span>
                  </div>
                </div>
                <Progress value={runAllProgressPercent} className="mt-3 h-1.5 bg-blue-100 [&>div]:bg-blue-600" />
              </div>
            </div>
          ) : null}
        </div>

        <Card>
          <CardHeader className={cn(configExpanded ? 'pb-2' : 'py-3')}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>执行配置</CardTitle>
                <CardDescription>配置 Backport 所需的仓库、分支和 signer 参数</CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSaveConfig()}
                  disabled={savingConfig || running || loadingConfig}
                >
                  <Save className="mr-1 h-4 w-4" />
                  {savingConfig ? '保存中...' : '保存'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfigExpanded(prev => !prev)}>
                  {configExpanded ? (
                    <>
                      <ChevronUp className="mr-1 h-4 w-4" />
                      收起
                    </>
                  ) : (
                    <>
                      <ChevronDown className="mr-1 h-4 w-4" />
                      展开
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>

          {configExpanded ? (
            <CardContent className="grid gap-4 pt-0 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
              <div className="rounded-2xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.98))] p-4 shadow-sm">
                <div className="mb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Repository Setup
                  </p>
                  <h4 className="mt-1 text-sm font-semibold text-foreground">基础仓库配置</h4>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1 md:col-span-2">
                    <p className="text-xs text-muted-foreground">项目地址 (project_url)</p>
                    <Input
                      value={config.project_url}
                      onChange={e => setConfig(prev => ({ ...prev, project_url: e.target.value }))}
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">源仓目录 (project_dir)</p>
                    <Input
                      value={config.project_dir}
                      onChange={e => setConfig(prev => ({ ...prev, project_dir: e.target.value }))}
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">源分支 (source_branch)</p>
                    <Input
                      value={config.source_branch}
                      onChange={e =>
                        setConfig(prev => ({ ...prev, source_branch: e.target.value }))
                      }
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">目标仓目录 (target_path)</p>
                    <Input
                      value={config.target_path}
                      onChange={e => setConfig(prev => ({ ...prev, target_path: e.target.value }))}
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">目标分支 (target_release)</p>
                    <Input
                      value={config.target_release}
                      onChange={e =>
                        setConfig(prev => ({ ...prev, target_release: e.target.value }))
                      }
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <p className="text-xs text-muted-foreground">
                      补丁数据集目录 (patch_dataset_dir)
                    </p>
                    <Input
                      value={config.patch_dataset_dir}
                      onChange={e =>
                        setConfig(prev => ({ ...prev, patch_dataset_dir: e.target.value }))
                      }
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <p className="text-xs text-muted-foreground">
                      Linux 验证仓库 (linux_repo_path)
                    </p>
                    <Input
                      value={config.linux_repo_path}
                      onChange={e =>
                        setConfig(prev => ({ ...prev, linux_repo_path: e.target.value }))
                      }
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-4 shadow-sm">
                <div className="mb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Commit Identity
                  </p>
                  <h4 className="mt-1 text-sm font-semibold text-foreground">提交身份设置</h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    执行回移植补丁应用时传给 agent 的 signer 信息
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2.5">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-slate-900">运行模型</p>
                        {selectedBackportModel ? (
                          <Badge variant="outline" className="text-[10px]">
                            {selectedBackportModel.provider}
                          </Badge>
                        ) : null}
                      </div>
                      <Select
                        value={config.backport_model_id || BACKPORT_MODEL_EMPTY_VALUE}
                        onValueChange={value => {
                          const nextModelId = value === BACKPORT_MODEL_EMPTY_VALUE ? '' : value
                          const nextConfig = {
                            ...config,
                            backport_model_id: nextModelId,
                          }
                          setConfig(nextConfig)
                          void loadRuntimeStatus(nextConfig)
                        }}
                        disabled={
                          running ||
                          loadingConfig ||
                          loadingModels ||
                          compatibleBackportModels.length === 0
                        }
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue
                            placeholder={loadingModels ? '加载模型中...' : '选择 Backport 运行模型'}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={BACKPORT_MODEL_EMPTY_VALUE}>
                            未选择
                          </SelectItem>
                          {compatibleBackportModels.map(model => (
                            <SelectItem key={model.id} value={model.id}>
                              {formatBackportModelLabel(model)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs leading-5 text-muted-foreground">
                        {compatibleBackportModels.length === 0
                          ? '请先在模型设置页添加 OpenAI-compatible 模型。'
                          : selectedBackportModel?.apiBaseUrl
                            ? selectedBackportModel.apiBaseUrl
                            : '将使用 cvekit 对应 provider 的默认 API 地址。'}
                      </p>
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-slate-900">运行环境</span>
                          <Badge
                            variant={runtimeStatus?.ok ? 'default' : 'secondary'}
                            className="text-[10px]"
                          >
                            {loadingRuntimeStatus
                              ? '检查中'
                              : runtimeStatus?.ok
                                ? '可用'
                                : '待配置'}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] leading-5 text-muted-foreground">
                          <span>
                            模型：{runtimeStatus?.model_configured ? runtimeStatus.model_name : '未选择'}
                          </span>
                          <span>
                            cvekit：{runtimeStatus?.cvekit_available ? '已找到' : '未找到'}
                          </span>
                        </div>
                        {runtimeStatus?.errors.length ? (
                          <p className="text-xs leading-5 text-red-600">
                            {runtimeStatus.errors[0]}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">提交人姓名 (signer_name)</p>
                    <Input
                      value={config.signer_name}
                      onChange={e => setConfig(prev => ({ ...prev, signer_name: e.target.value }))}
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">提交人邮箱 (signer_email)</p>
                    <Input
                      type="email"
                      value={config.signer_email}
                      onChange={e => setConfig(prev => ({ ...prev, signer_email: e.target.value }))}
                      className="text-xs"
                    />
                  </div>
                  <div className="rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-900">执行时生成冲突报告</div>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          对生成的解冲突补丁进行 AI 评分，会增加执行耗时。
                        </p>
                      </div>
                      <Switch
                        checked={Boolean(config.cvekit_options.enable_conflict_summary)}
                        onCheckedChange={checked =>
                          setConfig(prev => ({
                            ...prev,
                            cvekit_options: {
                              ...prev.cvekit_options,
                              enable_conflict_summary: checked,
                            },
                          }))
                        }
                        disabled={running || loadingConfig}
                        aria-label="执行时生成冲突报告"
                      />
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      当前 report
                    </div>
                    <div className="mt-1 break-all font-mono text-[12px] text-slate-900">
                      {baseReportPath || '--'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      过滤后 report
                    </div>
                    <div className="mt-1 break-all font-mono text-[12px] text-slate-900">
                      {filteredReportPath || '--'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      生成配置路径
                    </div>
                    <div className="mt-1 break-all font-mono text-[12px] text-slate-900">
                      {configPath || '--'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm xl:col-span-2">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                      Message Template
                    </p>
                    <h4 className="mt-1 text-sm font-semibold text-foreground">
                      目标仓库提交信息模板
                    </h4>
                    <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-2 text-xs text-muted-foreground">
                      <span>可用变量：</span>
                      <span>{'{{subject}}'}、</span>
                      <span>{'{{commit_id}}'}、</span>
                      <span>{'{{source}}'} =</span>
                      <Select
                        value={config.commit_message_source}
                        onValueChange={value =>
                          setConfig(prev => ({
                            ...prev,
                            commit_message_source:
                              value === 'openEuler' || value === 'upstream' ? value : 'auto',
                          }))
                        }
                        disabled={running || loadingConfig}
                      >
                        <SelectTrigger className="h-7 w-[156px] bg-white px-2 text-xs" size="sm">
                          <SelectValue placeholder="自动判断" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">自动判断</SelectItem>
                          <SelectItem value="openEuler">全部使用 openEuler</SelectItem>
                          <SelectItem value="upstream">全部使用 upstream</SelectItem>
                        </SelectContent>
                      </Select>
                      <span>
                        、{'{{body}}'}、{'{{trailers}}'}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setConfig(prev => ({
                          ...prev,
                          commit_message_template: DEFAULT_COMMIT_MESSAGE_TEMPLATE,
                        }))
                      }
                      disabled={running || loadingConfig}
                    >
                      <RotateCcw className="mr-1 h-4 w-4" />
                      恢复默认模板
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={config.commit_message_template}
                  onChange={event =>
                    setConfig(prev => ({ ...prev, commit_message_template: event.target.value }))
                  }
                  onBlur={() =>
                    setConfig(prev => ({
                      ...prev,
                      commit_message_template: prev.commit_message_template.trim()
                        ? prev.commit_message_template
                        : DEFAULT_COMMIT_MESSAGE_TEMPLATE,
                    }))
                  }
                  className="min-h-[220px] resize-y font-mono text-xs leading-5"
                  spellCheck={false}
                />
              </div>
            </CardContent>
          ) : null}
        </Card>

        <CommitTable
          excelPath={excelPath}
          onExcelPathChange={setExcelPath}
          running={running}
          runningLabel={runningLabel}
          canPauseRunAll={Boolean(runAllControl) && runAllPauseState === 'running'}
          runAllPauseState={runAllPauseState}
          baseReportPath={baseReportPath}
          filteredRows={filteredRows}
          paginatedRows={paginatedRows}
          titleCandidates={titleCandidates}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          titleFilter={titleFilter}
          onTitleFilterChange={setTitleFilter}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          conflictFilter={conflictFilter}
          onConflictFilterChange={setConflictFilter}
          mergedFilter={mergedFilter}
          onMergedFilterChange={setMergedFilter}
          selectedRowIds={selectedRowIds}
          selectedRowSet={selectedRowSet}
          clearSelection={() => setSelectedRowIds([])}
          allFilteredSelected={allFilteredSelected}
          onToggleSelectAll={toggleSelectAllFiltered}
          onToggleRowSelection={toggleRowSelection}
          inspectedRowId={inspectedRowId}
          analyzingConflictRowId={analyzingConflictRowId}
          currentCommitPage={currentCommitPage}
          totalCommitPages={totalCommitPages}
          paginationItems={paginationItems}
          onCommitPageChange={setCommitPage}
          originalCommitCount={originalCommits.length}
          canContinueReport={canContinueReport}
          onOpenPathBrowser={openPathBrowser}
          onGenerateReport={handleGenerateReport}
          onRunAll={handleRunAll}
          onPauseRunAll={handlePauseRunAll}
          onContinueReport={handleContinueReport}
          onExecuteSelected={handleExecuteSelected}
          onDeleteSelectedRows={handleDeleteSelectedRows}
          onResetWorkingRows={handleResetWorkingRows}
          onOpenInspector={openInspector}
          onCopyText={handleCopyText}
          onLoadPatchPreview={(row, resource) => void loadPatchPreview(row, resource)}
          canAnalyzeConflictRow={canAnalyzeConflictRow}
          onAnalyzeConflictRow={(row) => void handleAnalyzeConflictRow(row)}
          firstBlockingConflictRowId={firstBlockingConflictRowId}
          canRecheckConflictRow={canRecheckConflictRow}
          onRecheckConflictRow={(row) => void handleRecheckConflictRow(row)}
          canApplyRow={canApplyRow}
          canResolveConflictRow={canResolveConflictRow}
          onApplyRow={row => void handleApplyRow(row)}
          onResolveConflictRow={row => void handleResolveConflictRow(row)}
        />

        <div className="space-y-4">
          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <SupportPanel
            supportTab={supportTab}
            onSupportTabChange={setSupportTab}
            targetPath={config.target_path}
            running={running}
            timeline={timeline}
            conflictReportText={conflictReportText}
            gitLogEntries={gitLogEntries}
            gitLogLoading={gitLogLoading}
            gitShowLoading={gitShowLoading}
            gitShowContent={gitShowContent}
            gitLogError={gitLogError}
            selectedGitRevision={selectedGitRevision}
            selectedGitEntry={selectedGitEntry}
            onLoadGitLog={handleLoadGitLog}
            onLoadGitShow={handleLoadGitShow}
          />
        </div>
      </div>

      <InspectorSheet
        open={inspectorOpen}
        onOpenChange={setInspectorOpen}
        row={inspectedRow}
        config={config}
        inspectorTab={inspectorTab}
        onInspectorTabChange={setInspectorTab}
        patchAnchorRefs={patchAnchorRefs}
        activePatchKey={activePatchKey}
        activePatchPreview={activePatchPreview}
        compareLeftResource={compareLeftResource}
        compareRightResource={compareRightResource}
        compareLeftPreview={compareLeftPreview}
        compareRightPreview={compareRightPreview}
        manualPatchText={manualPatchText}
        onManualPatchTextChange={value => {
          setManualPatchText(value)
          setManualPatchResult(null)
        }}
        manualPatchLoading={manualPatchLoading}
        manualPatchResult={manualPatchResult}
        onCheckManualPatch={() => void handleCheckManualPatch()}
        onApplyManualPatch={() => void handleApplyManualPatch()}
        onUpdateMergedInTarget={updateMergedInTarget}
        onCopyText={(text, label) => void handleCopyText(text, label)}
        onDownloadPatch={handleDownloadPatch}
        onLoadPatchPreview={loadPatchPreview}
        commitMessagePreviewLoading={commitMessagePreviewLoadingRowId === inspectedRow?.rowId}
        onRefreshCommitMessagePreview={row => void handleRefreshCommitMessagePreview(row)}
      />

      <Dialog open={pathBrowserOpen} onOpenChange={setPathBrowserOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>选择服务器上的 Excel 文件</DialogTitle>
            <DialogDescription>
              点击目录进入，点击 Excel 文件后自动回填到表格路径输入框
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                value={browsePath}
                onChange={e => setBrowsePath(e.target.value)}
                className="font-mono text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadBrowsePath(browsePath)}
                disabled={browseLoading}
              >
                {browseLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : '打开'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => browseParentPath && loadBrowsePath(browseParentPath)}
                disabled={browseLoading || !browseParentPath}
              >
                返回上级
              </Button>
            </div>

            <div className="max-h-[420px] overflow-hidden rounded-md border">
              <ScrollArea className="h-[420px]">
                <div className="divide-y">
                  {browseEntries.map(entry => {
                    const isExcel = !entry.is_dir && /\.(xlsx|xls)$/i.test(entry.name)
                    return (
                      <button
                        key={entry.path}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent/40"
                        onClick={() => {
                          if (entry.is_dir) {
                            void loadBrowsePath(entry.path)
                            return
                          }
                          if (!isExcel) return
                          setExcelPath(entry.path)
                          setPathBrowserOpen(false)
                        }}
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium">{entry.name}</div>
                          <div className="truncate font-mono text-[11px] text-muted-foreground">
                            {entry.path}
                          </div>
                        </div>
                        <Badge variant="outline">
                          {entry.is_dir ? '目录' : isExcel ? 'Excel' : '文件'}
                        </Badge>
                      </button>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPathBrowserOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
