'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, RefreshCw, RotateCcw, Save, Wrench } from 'lucide-react'

import { CommitTable } from '@/components/tool-panel/backport/commit-table'
import {
  InspectorSheet,
  type InspectorTab,
  type PatchLoadState,
} from '@/components/tool-panel/backport/inspector-sheet'
import { RepositoryAccessPanel } from '@/components/tool-panel/backport/repository-access-panel'
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
  BackportRepositoryInfo,
  BackportRepositoryPrepareResponse,
  BackportRepositoryRole,
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
  return provider ? `${model.name} · ${formatProviderLabel(provider)}` : model.name
}

const formatProviderLabel = (provider: string): string => {
  const normalized = provider.trim().toLowerCase()
  if (normalized === 'custom') return '自定义'
  if (normalized === 'local') return '本地'
  return provider.trim()
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

const buildLegacyRepositoryInfo = (
  role: BackportRepositoryRole,
  localPath: string,
  branch: string,
  sourceUrl = '',
): BackportRepositoryInfo | null => {
  const normalizedPath = localPath.trim()
  if (!normalizedPath) return null
  const name = normalizedPath.split('/').filter(Boolean).pop() || normalizedPath
  return {
    role,
    input: sourceUrl || normalizedPath,
    input_type: sourceUrl ? 'remote' : 'local',
    display_name: name,
    source_url: sourceUrl,
    local_path: normalizedPath,
    default_branch: branch,
    selected_branch: branch,
    current_branch: branch,
    head: '',
    short_head: '',
    local_branches: branch ? [branch] : [],
    remote_branches: [],
    status_clean: true,
    operation_in_progress: false,
    writable: role === 'target',
    can_read: true,
    can_write: true,
    warnings: [],
    cache_dir: '',
    updated_at: 0,
  }
}

const isRemoteRepositoryInput = (input: string): boolean =>
  /^(https?:\/\/|ssh:\/\/|git:\/\/|[^@\s]+@[^:\s]+:)/.test(input.trim())

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
  const [runtimeModelSelectorOpen, setRuntimeModelSelectorOpen] = useState(false)
  const [signerEditorOpen, setSignerEditorOpen] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [configExpanded, setConfigExpanded] = useState(true)
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
  const [recentRepositories, setRecentRepositories] = useState<BackportRepositoryInfo[]>([])
  const [repositoryDialogRole, setRepositoryDialogRole] = useState<BackportRepositoryRole | null>(null)
  const [repositoryInput, setRepositoryInput] = useState('')
  const [repositoryPrepareTask, setRepositoryPrepareTask] =
    useState<BackportRepositoryPrepareResponse | null>(null)
  const [repositoryPreparingRole, setRepositoryPreparingRole] =
    useState<BackportRepositoryRole | null>(null)
  const [repositoryMode, setRepositoryMode] = useState<'add' | 'recent'>('add')
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

  const openModelSettings = () => {
    const store = useChatStore.getState()
    store.setSettingsActiveSection('model')
    if (!store.rightPanelTabs.some(tab => tab.id === 'settings')) {
      store.addRightPanelTab({ id: 'settings', name: '设置', color: 'text-gray-500' })
    }
    store.setActiveRightPanelTab('settings')
  }

  const sourceRepository = useMemo(
    () =>
      config.source_repo_state ||
      buildLegacyRepositoryInfo('source', config.project_dir, config.source_branch, config.project_url),
    [config.project_dir, config.project_url, config.source_branch, config.source_repo_state],
  )

  const targetRepository = useMemo(
    () =>
      config.target_repo_state ||
      buildLegacyRepositoryInfo('target', config.target_path, config.target_release),
    [config.target_path, config.target_release, config.target_repo_state],
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
    () =>
      workingCommits.find(row => Boolean(row.data.has_conflict) && !isSkippedRow(row.data)) || null,
    [workingCommits]
  )
  const firstBlockingConflictRowId = firstBlockingConflictRow?.rowId || null
  const hasPendingRows = useMemo(
    () =>
      workingCommits.some(
        row => stringifyValue(row.data.status).trim().toLowerCase() === 'pending'
      ),
    [workingCommits]
  )
  const canContinueReport =
    Boolean(baseReportPath.trim()) && hasPendingRows && !firstBlockingConflictRow

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

  const getRunAllRowKey = (row: BackportCommitRow) =>
    stringifyValue(
      row.data.row_id || row.data.commit || row.data.input_commit || row.rowId
    ).trim() || row.rowId

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
        const commit = stringifyValue(row.data.commit || row.data.input_commit || rowKey).slice(
          0,
          12
        )
        const title = resolveCommitTitle(row.data)
        const previousState = formatRunAllRowState(previousRow?.data)
        const nextState = formatRunAllRowState(row.data)
        const duration = formatRunAllDuration(
          runAllRowStartedAtRef.current[rowKey] || runAllRowStartedAtRef.current[progressRowId]
        )
        const failed = resolveStatusMeta(row.data).kind === 'failed'
        addTimeline(
          `Commit ${commit} 运行完成`,
          failed ? 'error' : 'success',
          [
            title ? `标题: ${title}` : '',
            `状态: ${previousState} -> ${nextState}`,
            duration,
            progress.message ? `说明: ${progress.message}` : '',
          ]
            .filter(Boolean)
            .join('\n')
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

  const loadRecentRepositories = async () => {
    try {
      const response = await backportService.getRecentRepositories()
      setRecentRepositories(response.repositories || [])
    } catch (cause) {
      console.warn('Failed to load Backport recent repositories:', cause)
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
          description: '加载运行模型列表失败',
          variant: 'destructive',
        })
      }
      setConfig(sanitizedConfig)
      setExcelPath(sanitizedConfig.current_excel_path || '')
      setBaseReportPath(sanitizedConfig.current_report_path || '')
      setFilteredReportPath(sanitizedConfig.current_filtered_report_path || '')
      setLastSavedCommitMessageTemplate(sanitizedConfig.commit_message_template)
      void loadRuntimeStatus(sanitizedConfig)
      void loadRecentRepositories()
      void hydrateConfiguredRepositories(sanitizedConfig)
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

  const handleSaveConfig = async (silent = false, configOverride?: BackportConfig) => {
    setSavingConfig(true)
    try {
      const persistedConfig = normalizeBackportConfig(configOverride || config)
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

  const buildConfigWithRepository = (
    previousConfig: BackportConfig,
    role: BackportRepositoryRole,
    repository: BackportRepositoryInfo,
  ): BackportConfig => {
    if (role === 'source') {
      return {
        ...previousConfig,
        project_url: repository.source_url || '',
        project_dir: repository.local_path,
        source_branch: repository.selected_branch || repository.default_branch || previousConfig.source_branch,
        source_repo_input: repository.input,
        source_repo_state: repository,
      }
    }
    return {
      ...previousConfig,
      target_path: repository.local_path,
      target_release: repository.selected_branch || repository.default_branch || previousConfig.target_release,
      target_repo_input: repository.input,
      target_repo_state: repository,
    }
  }

  const shouldHydrateRepository = (
    repository: BackportRepositoryInfo | null | undefined,
    localPath: string,
  ) => {
    if (!localPath.trim()) return false
    if (!repository) return true
    if (!repository.short_head.trim()) return true
    if ((repository.local_branches || []).length <= 1 && (repository.remote_branches || []).length === 0) {
      return true
    }
    return false
  }

  const hydrateConfiguredRepositories = async (baseConfig: BackportConfig) => {
    let nextConfig = baseConfig
    let changed = false

    if (shouldHydrateRepository(baseConfig.source_repo_state, baseConfig.project_dir)) {
      try {
        const refreshedSource = await backportService.refreshRepository({
          role: 'source',
          localPath: baseConfig.project_dir,
          sourceUrl: baseConfig.source_repo_state?.source_url || '',
          selectedBranch: baseConfig.source_branch,
        })
        nextConfig = buildConfigWithRepository(nextConfig, 'source', refreshedSource)
        changed = true
      } catch (cause) {
        console.warn('Failed to hydrate Backport source repository:', cause)
      }
    }

    if (shouldHydrateRepository(baseConfig.target_repo_state, baseConfig.target_path)) {
      try {
        const refreshedTarget = await backportService.refreshRepository({
          role: 'target',
          localPath: baseConfig.target_path,
          sourceUrl: baseConfig.target_repo_state?.source_url || '',
          selectedBranch: baseConfig.target_release,
        })
        nextConfig = buildConfigWithRepository(nextConfig, 'target', refreshedTarget)
        changed = true
      } catch (cause) {
        console.warn('Failed to hydrate Backport target repository:', cause)
      }
    }

    if (!changed) return
    setConfig(nextConfig)
    await handleSaveConfig(true, nextConfig)
  }

  const openRepositoryDialog = (role: BackportRepositoryRole, mode: 'add' | 'recent' = 'add') => {
    setRepositoryDialogRole(role)
    setRepositoryMode(mode)
    setRepositoryPrepareTask(null)
    setRepositoryInput('')
    if (mode === 'recent') {
      void loadRecentRepositories()
    }
  }

  const closeRepositoryDialog = () => {
    if (repositoryPrepareTask?.status === 'running') return
    setRepositoryDialogRole(null)
    setRepositoryInput('')
    setRepositoryPrepareTask(null)
    setRepositoryPreparingRole(null)
  }

  const applyPreparedRepository = async (
    role: BackportRepositoryRole,
    repository: BackportRepositoryInfo,
  ) => {
    const nextConfig = buildConfigWithRepository(configRef.current, role, repository)
    setConfig(nextConfig)
    await handleSaveConfig(true, nextConfig)
    await loadRecentRepositories()
    addTimeline(`${role === 'source' ? '源仓库' : '目标仓库'}已准备`, 'success', repository.local_path)
  }

  const pollRepositoryPrepareTask = async (
    role: BackportRepositoryRole,
    taskId: string,
  ): Promise<BackportRepositoryPrepareResponse> => {
    let current = await backportService.getRepositoryPrepareTask(taskId)
    setRepositoryPrepareTask(current)
    while (current.status === 'running') {
      await new Promise(resolve => setTimeout(resolve, 1500))
      current = await backportService.getRepositoryPrepareTask(taskId)
      setRepositoryPrepareTask(current)
    }
    if (current.status === 'failed') {
      throw new Error(current.error || '仓库准备失败')
    }
    if (!current.result) {
      throw new Error('仓库准备未返回结果')
    }
    await applyPreparedRepository(role, current.result)
    return current
  }

  const handlePrepareRepository = async () => {
    const role = repositoryDialogRole
    const input = repositoryInput.trim()
    if (!role || !input) {
      toast({
        title: '提示',
        description: '请粘贴 Git URL 或服务器本地仓库路径',
      })
      return
    }

    setRepositoryPreparingRole(role)
    const preferredBranch = role === 'source' ? config.source_branch : config.target_release

    if (!isRemoteRepositoryInput(input)) {
      setRepositoryPrepareTask({
        task_id: `refresh-${role}`,
        status: 'running',
        role,
        input,
        progress: 35,
        steps: [
          {
            title: '解析本地路径',
            status: 'running',
            detail: input,
          },
          {
            title: '确认 Git 仓库并读取当前提交',
            status: 'running',
            detail: 'git rev-parse --is-inside-work-tree / git rev-parse HEAD',
          },
          {
            title: '读取分支和工作区状态',
            status: 'running',
            detail: role === 'target' ? '目标仓库会检查未提交修改和可写状态' : '源仓库只做轻量读取',
          },
        ],
        result: null,
        error: '',
      })
      try {
        const refreshed = await backportService.refreshRepository({
          role,
          localPath: input,
          selectedBranch: preferredBranch,
        })
        setRepositoryPrepareTask(prev => ({
          task_id: prev?.task_id || `refresh-${role}`,
          status: 'success',
          role,
          input,
          progress: 100,
          steps: [
            ...(prev?.steps || []),
            {
              title: '本地仓库已读取完成',
              status: 'success',
              detail: refreshed.short_head
                ? `${refreshed.selected_branch || '当前提交'} @ ${refreshed.short_head}`
                : refreshed.local_path,
            },
          ],
          result: refreshed,
          error: '',
        }))
        await applyPreparedRepository(role, refreshed)
        toast({
          title: '仓库已就绪',
          description: refreshed.display_name || input,
        })
        setRepositoryDialogRole(null)
        setRepositoryInput('')
        setRepositoryPrepareTask(null)
        setRepositoryPreparingRole(null)
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : '本地仓库检查失败'
        setRepositoryPrepareTask(prev => ({
          task_id: prev?.task_id || `refresh-${role}`,
          status: 'failed',
          role,
          input,
          progress: 100,
          steps: prev?.steps || [],
          result: null,
          error: message,
        }))
        toast({
          title: '本地仓库检查失败',
          description: message,
          variant: 'destructive',
        })
        setRepositoryPreparingRole(null)
      }
      return
    }

    setRepositoryPrepareTask({
      task_id: `prepare-${role}`,
      status: 'running',
      role,
      input,
      progress: 8,
      steps: [
        {
          title: '提交仓库准备请求',
          status: 'running',
          detail: 'POST /backport/repositories/prepare',
        },
        {
          title: '等待后端检测仓库类型',
          status: 'running',
          detail: input,
        },
      ],
      result: null,
      error: '',
    })
    try {
      const created = await backportService.prepareRepository({
        role,
        input,
        preferredBranch,
      })
      setRepositoryPrepareTask(created)
      const completed = await pollRepositoryPrepareTask(role, created.task_id)
      toast({
        title: '仓库已就绪',
        description: completed.result?.display_name || input,
      })
      setRepositoryDialogRole(null)
      setRepositoryInput('')
      setRepositoryPrepareTask(null)
      setRepositoryPreparingRole(null)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '仓库准备失败'
      setRepositoryPrepareTask(prev => ({
        task_id: prev?.task_id || '',
        status: 'failed',
        role,
        input,
        progress: 100,
        steps: prev?.steps || [],
        result: null,
        error: message,
      }))
      toast({
        title: '仓库准备失败',
        description: message,
        variant: 'destructive',
      })
      setRepositoryPreparingRole(null)
    }
  }

  const handleSelectRecentRepository = async (repository: BackportRepositoryInfo) => {
    const role = repositoryDialogRole || repository.role
    await applyPreparedRepository(role, { ...repository, role })
    closeRepositoryDialog()
  }

  const handleRefreshRepository = async (role: BackportRepositoryRole) => {
    const repository = role === 'source' ? sourceRepository : targetRepository
    if (!repository) return
    setRepositoryPreparingRole(role)
    setRepositoryPrepareTask({
      task_id: `refresh-${role}`,
      status: 'running',
      role,
      input: repository.input || repository.local_path,
      progress: 45,
      steps: [
        {
          title: '读取当前提交',
          status: 'running',
          detail: `git -C ${repository.local_path} rev-parse HEAD`,
        },
        {
          title: '读取本地分支和远程分支',
          status: 'running',
          detail: 'git branch --format=... / git branch -r --format=...',
        },
        {
          title: '检查工作区是否干净',
          status: 'running',
          detail: 'git status --porcelain=v1 -uall',
        },
        {
          title: '读取 origin 地址',
          status: 'running',
          detail: 'git remote get-url origin',
        },
      ],
      result: null,
      error: '',
    })
    try {
      const refreshed = await backportService.refreshRepository({
        role,
        localPath: repository.local_path,
        sourceUrl: repository.source_url,
        selectedBranch: repository.selected_branch,
      })
      await applyPreparedRepository(role, refreshed)
      toast({
        title: '仓库状态已刷新',
        description: refreshed.display_name,
      })
      setRepositoryPrepareTask(null)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '刷新仓库失败'
      setRepositoryPrepareTask({
        task_id: `refresh-${role}`,
        status: 'failed',
        role,
        input: repository.input || repository.local_path,
        progress: 100,
        steps: [],
        result: null,
        error: message,
      })
      toast({
        title: '刷新仓库失败',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setRepositoryPreparingRole(null)
    }
  }

  const handleRepositoryBranchChange = (
    role: BackportRepositoryRole,
    branch: string,
  ) => {
    const repository = role === 'source' ? sourceRepository : targetRepository
    if (!repository) return
    const nextRepository = {
      ...repository,
      selected_branch: branch,
    }
    const nextConfig = buildConfigWithRepository(configRef.current, role, nextRepository)
    setConfig(nextConfig)
    void handleSaveConfig(true, nextConfig)
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
    return (
      !running &&
      row.rowId === firstBlockingConflictRowId &&
      Boolean(row.data.has_conflict) &&
      !isSkippedRow(row.data) &&
      baseReportPath.trim().length > 0
    )
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
        handleAgentEvent
      )
    )
  }

  const canRecheckConflictRow = (row: BackportCommitRow): boolean => {
    return (
      !running &&
      row.rowId === firstBlockingConflictRowId &&
      Boolean(row.data.has_conflict) &&
      !isSkippedRow(row.data) &&
      baseReportPath.trim().length > 0
    )
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

  const sourceConfigSummary = sourceRepository
    ? `${sourceRepository.display_name} ${
        sourceRepository.selected_branch || sourceRepository.current_branch || sourceRepository.default_branch || '未选分支'
      }`
    : '源仓库未配置'
  const targetConfigSummary = targetRepository
    ? `${targetRepository.display_name} ${
        targetRepository.selected_branch || targetRepository.current_branch || targetRepository.default_branch || '未选分支'
      }`
    : '目标仓库未配置'
  const signerConfigSummary =
    config.signer_name.trim() && config.signer_email.trim() ? '提交身份已设置' : '提交身份待设置'
  const runtimeConfigSummary = loadingRuntimeStatus
    ? '环境检查中'
    : runtimeStatus?.ok
      ? '环境检查完成'
      : '环境待配置'
  const overallConfigSummary =
    sourceRepository && targetRepository && config.signer_name.trim() && config.signer_email.trim() && runtimeStatus?.ok
      ? '配置已就绪'
      : '配置待完善'

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
                          <span className="ml-2 font-mono text-blue-800">
                            {runAllProgress.current_title}
                          </span>
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
                <Progress
                  value={runAllProgressPercent}
                  className="mt-3 h-1.5 bg-blue-100 [&>div]:bg-blue-600"
                />
              </div>
            </div>
          ) : null}
        </div>

        <RepositoryAccessPanel
          sourceRepository={sourceRepository}
          targetRepository={targetRepository}
          preparingRole={repositoryPreparingRole}
          prepareTask={repositoryPrepareTask}
          running={running}
          expanded={configExpanded}
          headerAction={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSaveConfig()}
                disabled={savingConfig || running || loadingConfig}
              >
                <Save className="mr-1 h-4 w-4" />
                {savingConfig ? '保存中...' : '保存为模板'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfigExpanded(prev => !prev)}>
                {configExpanded ? (
                  <>
                    <ChevronUp className="mr-1 h-4 w-4" />
                    收起配置
                  </>
                ) : (
                  <>
                    <ChevronDown className="mr-1 h-4 w-4" />
                    展开配置
                  </>
                )}
              </Button>
            </div>
          }
          collapsedSummary={
            <>
              <span className="font-medium text-slate-950">{overallConfigSummary}：</span>
              <span>{sourceConfigSummary}</span>
              <span className="px-1.5 text-slate-400">-&gt;</span>
              <span>{targetConfigSummary}</span>
              <span className="px-1.5 text-slate-300">·</span>
              <span>{signerConfigSummary}</span>
              <span className="px-1.5 text-slate-300">·</span>
              <span>{runtimeConfigSummary}</span>
            </>
          }
          summary={
            <div className="space-y-3 text-sm">
              <div className="grid gap-3 border-t border-slate-100 pt-3 lg:grid-cols-2">
                <div
                  className={cn(
                    'min-w-0',
                    config.signer_name.trim() && config.signer_email.trim()
                      ? 'text-slate-700'
                      : 'text-amber-800'
                  )}
                >
                  <span className="text-slate-500">提交身份：</span>
                  {config.signer_name.trim() && config.signer_email.trim() ? (
                    <span className="font-mono text-slate-950">
                      {config.signer_name.trim()} &lt;{config.signer_email.trim()}&gt;
                    </span>
                  ) : (
                    <span>需要设置提交人姓名和邮箱</span>
                  )}
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="ml-2 h-auto px-0 py-0 text-sm"
                    onClick={() => setSignerEditorOpen(prev => !prev)}
                  >
                    {signerEditorOpen
                      ? '收起'
                      : config.signer_name.trim() && config.signer_email.trim()
                        ? '修改'
                        : '设置'}
                  </Button>
                </div>

                <div
                  className={cn(
                    'min-w-0 lg:justify-self-start',
                    loadingRuntimeStatus
                      ? 'text-slate-600'
                      : runtimeStatus?.ok
                        ? 'text-slate-700'
                        : 'text-amber-800'
                  )}
                >
                  <span className="text-slate-500">环境状态：</span>
                  {loadingRuntimeStatus ? (
                    <span>正在检查...</span>
                  ) : runtimeStatus?.ok ? (
                    <>
                      <span className="mx-1 inline-block h-1.5 w-1.5 rounded-full bg-slate-950 align-middle" />
                      <span>检查完成</span>
                      <span className="ml-2 text-xs text-slate-500">
                        模型 {runtimeStatus.model_name || selectedBackportModel?.name || '已配置'}，cvekit 已找到
                      </span>
                    </>
                  ) : (
                    <span>{runtimeStatus?.errors[0] || '请先配置可用模型、密钥，并确认 cvekit 可用。'}</span>
                  )}

                  {runtimeStatus?.ok ? (

                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="ml-2 h-auto px-0 py-0 text-sm"
                      onClick={() => setRuntimeModelSelectorOpen(prev => !prev)}
                    >
                      {runtimeModelSelectorOpen ? '收起' : '切换模型'}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="ml-2 h-auto px-0 py-0 text-sm"
                      onClick={openModelSettings}
                    >
                      去模型设置
                    </Button>
                  )}
                  {!runtimeStatus?.ok && !loadingRuntimeStatus ? (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="ml-2 h-auto px-0 py-0 text-sm"
                      onClick={() => void loadRuntimeStatus(config)}
                      disabled={loadingRuntimeStatus}
                    >
                      重新检测
                    </Button>
                  ) : null}
                </div>
              </div>

              {signerEditorOpen ? (
                <div className="grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-2">
                  <Input
                    value={config.signer_name}
                    onChange={e => setConfig(prev => ({ ...prev, signer_name: e.target.value }))}
                    placeholder="提交人姓名"
                    className="h-8 bg-white text-xs"
                    disabled={running || loadingConfig}
                  />
                  <Input
                    type="email"
                    value={config.signer_email}
                    onChange={e => setConfig(prev => ({ ...prev, signer_email: e.target.value }))}
                    placeholder="提交人邮箱"
                    className="h-8 bg-white text-xs"
                    disabled={running || loadingConfig}
                  />
                </div>
              ) : null}

              {runtimeModelSelectorOpen ? (
                <div className="grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-[280px_minmax(0,1fr)] sm:items-center">
                  <Select
                    value={config.backport_model_id || BACKPORT_MODEL_EMPTY_VALUE}
                    onValueChange={value => {
                      const nextModelId = value === BACKPORT_MODEL_EMPTY_VALUE ? '' : value
                      const nextConfig = {
                        ...config,
                        backport_model_id: nextModelId,
                      }
                      setConfig(nextConfig)
                      void handleSaveConfig(true, nextConfig)
                      void loadRuntimeStatus(nextConfig)
                    }}
                    disabled={
                      running ||
                      loadingConfig ||
                      loadingModels ||
                      compatibleBackportModels.length === 0
                    }
                  >
                    <SelectTrigger className="h-8 bg-white text-xs text-slate-900">
                      <SelectValue placeholder={loadingModels ? '加载模型中...' : '选择运行模型'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={BACKPORT_MODEL_EMPTY_VALUE}>未选择</SelectItem>
                      {compatibleBackportModels.map(model => (
                        <SelectItem key={model.id} value={model.id}>
                          {formatBackportModelLabel(model)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="truncate text-xs text-slate-500">
                    {selectedBackportModel?.apiBaseUrl || '将使用 cvekit 对应模型服务的默认地址。'}
                  </div>
                </div>
              ) : null}
            </div>
          }
          onAddRepository={(role) => openRepositoryDialog(role, 'add')}
          onSelectRecentRepository={(role) => openRepositoryDialog(role, 'recent')}
          onRefreshRepository={(role) => void handleRefreshRepository(role)}
          onBranchChange={handleRepositoryBranchChange}
        >
          <div className="space-y-0">
            <section className="grid gap-3 py-4 lg:grid-cols-[140px_minmax(0,1fr)]">
              <div>
                <h4 className="text-sm font-medium text-slate-900">提交信息来源</h4>
                <p className="mt-1 text-xs text-muted-foreground">决定模板里的 {'{{source}}'}。</p>
              </div>
              <div className="space-y-2">
                <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)]">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">来源规则</p>
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
                      <SelectTrigger className="h-9 bg-white text-xs">
                        <SelectValue placeholder="自动判断" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">自动判断</SelectItem>
                        <SelectItem value="openEuler">全部使用 openEuler</SelectItem>
                        <SelectItem value="upstream">全部使用 upstream</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {config.commit_message_source === 'auto' ? (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Linux 上游仓库</p>
                      <Input
                        value={config.linux_repo_path}
                        onChange={e =>
                          setConfig(prev => ({ ...prev, linux_repo_path: e.target.value }))
                        }
                        className="font-mono text-xs"
                        placeholder="例如 ~/Image/linux"
                        disabled={running || loadingConfig}
                      />
                    </div>
                  ) : (
                    <div className="flex min-h-9 items-end pb-1 text-xs leading-5 text-muted-foreground">
                      当前会直接写入 {config.commit_message_source}，不需要配置 Linux 上游仓库。
                    </div>
                  )}
                </div>
                {config.commit_message_source === 'auto' ? (
                  <p className="text-xs leading-5 text-muted-foreground">
                    自动判断时会在 Linux 上游仓库中搜索原始提交；找到则使用 upstream，否则使用 openEuler。
                  </p>
                ) : null}
              </div>
            </section>

            <section className="grid gap-3 border-t border-slate-100 py-4 lg:grid-cols-[140px_minmax(0,1fr)]">
              <div>
                <h4 className="text-sm font-medium text-slate-900">目标配置布局</h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  仅目标仓需要拆分配置文件时调整。
                </p>
              </div>
              <div className="space-y-3">
                <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">布局类型</p>
                    <Select
                      value={config.target_config_layout}
                      onValueChange={value =>
                        setConfig(prev => ({
                          ...prev,
                          target_config_layout: value === 'anolis' ? 'anolis' : 'none',
                        }))
                      }
                      disabled={running || loadingConfig}
                    >
                      <SelectTrigger className="h-9 bg-white text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">不启用</SelectItem>
                        <SelectItem value="anolis">Anolis 拆分配置</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">新建配置默认 Level</p>
                    <Select
                      value={config.target_config_layout_opts.default_level}
                      onValueChange={value =>
                        setConfig(prev => ({
                          ...prev,
                          target_config_layout_opts: {
                            ...prev.target_config_layout_opts,
                            default_level:
                              value === 'L0-MANDATORY' || value === 'L2-OPTIONAL'
                                ? value
                                : 'L1-RECOMMEND',
                          },
                        }))
                      }
                      disabled={running || loadingConfig || config.target_config_layout !== 'anolis'}
                    >
                      <SelectTrigger className="h-9 bg-white text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="L0-MANDATORY">L0-MANDATORY</SelectItem>
                        <SelectItem value="L1-RECOMMEND">L1-RECOMMEND（默认）</SelectItem>
                        <SelectItem value="L2-OPTIONAL">L2-OPTIONAL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  启用 Anolis 后，defconfig 中的 CONFIG_* 变更会映射到目标仓的独立配置文件。
                </p>
              </div>
            </section>

            <section className="space-y-3 border-t border-slate-100 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-medium text-slate-900">提交信息模板</h4>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                    {['{{subject}}', '{{commit_id}}', '{{source}}', '{{body}}', '{{trailers}}'].map(item => (
                      <span key={item} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px]">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
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
                className="min-h-[160px] resize-y font-mono text-xs leading-5"
                spellCheck={false}
              />
            </section>

            <section className="grid gap-3 border-t border-slate-100 py-4 lg:grid-cols-[140px_minmax(0,1fr)]">
              <div>
                <h4 className="text-sm font-medium text-slate-900">执行选项</h4>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-900">执行时生成冲突报告</div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    对解冲突补丁进行 AI 评分，会增加执行耗时。
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
            </section>

          </div>
        </RepositoryAccessPanel>

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
          onAnalyzeConflictRow={row => void handleAnalyzeConflictRow(row)}
          firstBlockingConflictRowId={firstBlockingConflictRowId}
          canRecheckConflictRow={canRecheckConflictRow}
          onRecheckConflictRow={row => void handleRecheckConflictRow(row)}
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

      <Dialog open={repositoryDialogRole !== null} onOpenChange={(open) => !open && closeRepositoryDialog()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {repositoryMode === 'recent'
                ? `选择已有${repositoryDialogRole === 'source' ? '源仓库' : '目标仓库'}`
                : `添加${repositoryDialogRole === 'source' ? '源仓库' : '目标仓库'}`}
            </DialogTitle>
            <DialogDescription>
              {repositoryMode === 'recent'
                ? '选择系统之前准备过的仓库，分支仍可在卡片中重新选择。'
                : '粘贴 Git URL 或服务器上的本地仓库路径，系统会检测并准备成可用状态。'}
            </DialogDescription>
          </DialogHeader>

          {repositoryMode === 'recent' ? (
            <div className="max-h-[420px] overflow-auto rounded-lg border border-slate-200">
              {recentRepositories.filter(item => item.role === repositoryDialogRole).length === 0 ? (
                <div className="px-3 py-10 text-center text-sm text-slate-500">
                  暂无最近使用的{repositoryDialogRole === 'source' ? '源仓库' : '目标仓库'}
                </div>
              ) : (
                <div className="divide-y">
                  {recentRepositories
                    .filter(item => item.role === repositoryDialogRole)
                    .map((repository) => (
                      <button
                        key={`${repository.role}-${repository.local_path}-${repository.source_url}`}
                        className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left hover:bg-slate-50"
                        onClick={() => void handleSelectRecentRepository(repository)}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-950">
                            {repository.display_name}
                          </div>
                          <div className="mt-1 truncate font-mono text-[11px] text-slate-500">
                            {repository.source_url || repository.local_path}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {repository.selected_branch || repository.default_branch || '未设置分支'}
                          </div>
                        </div>
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {repository.input_type === 'remote' ? '远程' : '本地'}
                        </Badge>
                      </button>
                    ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Input
                  value={repositoryInput}
                  onChange={(event) => setRepositoryInput(event.target.value)}
                  placeholder="https://gitcode.com/openeuler/kernel.git 或 ~/Image/kernel"
                  className="font-mono text-xs"
                  disabled={repositoryPrepareTask?.status === 'running'}
                />
                <div className="text-xs text-slate-500">
                  {repositoryInput.trim()
                    ? /^(https?:\/\/|ssh:\/\/|git:\/\/|[^@\s]+@[^:\s]+:)/.test(repositoryInput.trim())
                      ? '已识别：远程 Git 仓库'
                      : '已识别：服务器本地路径'
                    : '支持 HTTPS、SSH Git 地址，也支持 /home/... 或 ~/... 本地路径。'}
                </div>
              </div>

              {repositoryPrepareTask ? (
                <div
                  className={cn(
                    'rounded-lg border px-3 py-3',
                    repositoryPrepareTask.status === 'failed'
                      ? 'border-red-200 bg-red-50'
                      : repositoryPrepareTask.status === 'success'
                        ? 'border-emerald-200 bg-emerald-50'
                        : 'border-blue-200 bg-blue-50',
                  )}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {repositoryPrepareTask.status === 'running' ? (
                      <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                    ) : null}
                    <span>
                      {repositoryPrepareTask.status === 'failed'
                        ? '准备失败'
                        : repositoryPrepareTask.status === 'success'
                          ? '准备完成'
                          : '正在准备仓库'}
                    </span>
                    <span className="ml-auto font-mono text-xs">
                      {repositoryPrepareTask.progress}%
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/80">
                    <div className="h-full bg-blue-600 transition-all" style={{ width: `${repositoryPrepareTask.progress || 8}%` }} />
                  </div>
                  {repositoryPrepareTask.error ? (
                    <div className="mt-2 text-xs leading-5 text-red-700">{repositoryPrepareTask.error}</div>
                  ) : null}
                  {repositoryPrepareTask.steps.length > 0 ? (
                    <div className="mt-2 space-y-1 text-xs text-slate-600">
                      {repositoryPrepareTask.steps.slice(-5).map((step, index) => (
                        <div key={`${step.title}-${index}`}>
                          <div>{step.title}</div>
                          {step.detail ? (
                            <div className="truncate font-mono text-[11px] text-slate-500">
                              {step.detail}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeRepositoryDialog} disabled={repositoryPrepareTask?.status === 'running'}>
              关闭
            </Button>
            {repositoryMode === 'add' ? (
              <Button
                type="button"
                onClick={() => void handlePrepareRepository()}
                disabled={!repositoryInput.trim() || repositoryPrepareTask?.status === 'running'}
              >
                {repositoryPrepareTask?.status === 'running' ? (
                  <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
                ) : null}
                检测并准备
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
