'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Plus, RefreshCw, RotateCcw, Save, Wrench } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

import { CommitTable } from '@/components/tool-panel/backport/commit-table'
import { CommitImportDialog } from '@/components/tool-panel/backport/commit-import-dialog'
import {
  InspectorSheet,
  type InspectorTab,
  type PatchLoadState,
} from '@/components/tool-panel/backport/inspector-sheet'
import { PrerequisiteReviewPanel } from '@/components/tool-panel/backport/prerequisite-review-panel'
import { RepositoryAccessPanel } from '@/components/tool-panel/backport/repository-access-panel'
import { SupportPanel } from '@/components/tool-panel/backport/support-panel'
import {
  BACKPORT_OPERATION_IDS,
  DEFAULT_BACKPORT_CONFIG,
  DEFAULT_COMMIT_MESSAGE_TEMPLATE,
  type BackportConflictAnalysisPatch,
  type BackportOperationId,
  type RowStatusKind,
  buildCompactBackportConflictAnalysisMessage,
  buildConflictReportText,
  buildPatchPreviewKey,
  buildPatchResources,
  deepClone,
  isSkippedRow,
  mergeCommitRows,
  normalizeBackportConfig,
  normalizeCommitRows,
  parseBoolLike,
  parseMergedLike,
  resolveBackportFailureMessage,
  resolveBackportModelReference,
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
  BackportAttemptSummary,
  BackportCommitItem,
  BackportCommitImportEntry,
  BackportCommitRow,
  BackportConfig,
  BackportExecutionRunSummary,
  BackportExecutionSummary,
  BackportGitLogEntry,
  BackportOperationDiagnostics,
  BackportOperationResultData,
  BackportPatchResource,
  BackportPrerequisiteCandidate,
  BackportPrerequisiteManifest,
  BackportRepositoryInfo,
  BackportRepositoryPrepareResponse,
  BackportRepositoryRole,
  BackportRuntimeStatus,
  BackportRunAllControl,
  BackportRunProgress,
  BackportRunSummary,
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
const BACKPORT_ACTIVE_RUN_STORAGE_KEY = 'polymind.backport.activeTaskId.v3'
const PREREQ_STATE_STORAGE_KEY = 'polymind.backport.prereqState'
const PREREQ_REVIEW_STALE_CODE = 'BACKPORT_PREREQUISITE_REVIEW_STALE'
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
  const provider = String(model.provider || '')
    .trim()
    .toLowerCase()
  if (!model.enabled) return false
  if (provider === 'custom') return model.compatibility === 'openai'
  return BACKPORT_SUPPORTED_PROVIDERS.has(provider)
}

const formatBackportModelLabel = (model: ModelConfig, t: TFunction): string => {
  const provider = String(model.provider || '').trim()
  return provider ? `${model.name} · ${formatProviderLabel(provider, t)}` : model.name
}

const PROVIDER_LABEL_KEYS: Record<string, string> = {
  custom: 'backport.provider.custom',
  local: 'backport.provider.local',
}

const formatProviderLabel = (provider: string, t: TFunction): string => {
  const normalized = provider.trim().toLowerCase()
  const labelKey = PROVIDER_LABEL_KEYS[normalized]
  if (labelKey) return t(labelKey)
  return provider.trim()
}

const toRunAllNumber = (value: number | undefined): number => {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : 0
}

const hasRunAllNumber = (value: number | undefined): value is number => {
  return Number.isFinite(Number(value))
}

const buildLegacyRepositoryInfo = (
  role: BackportRepositoryRole,
  localPath: string,
  branch: string,
  sourceUrl = ''
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

const buildPrerequisiteInputKey = (
  config: BackportConfig,
  excelPath: string,
  commitEntries: BackportCommitImportEntry[] = []
): string =>
  JSON.stringify({
    excelPath: excelPath.trim(),
    commitEntries,
    sourcePath: config.project_dir,
    sourceBranch: config.source_branch,
    sourceHead: config.source_repo_state?.head || '',
    targetPath: config.target_path,
    targetRelease: config.target_release,
    targetHead: config.target_repo_state?.head || '',
  })

export function BackportPage() {
  const { t } = useTranslation('tool-panel')
  const { toast } = useToast()
  const patchAnchorRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const workingCommitsRef = useRef<BackportCommitRow[]>([])
  const configRef = useRef<BackportConfig>(DEFAULT_BACKPORT_CONFIG)
  const runAllRowStartedAtRef = useRef<Record<string, number>>({})
  const runAllLastProcessedCountRef = useRef(0)
  const runAllReportRefreshInFlightRef = useRef(false)
  const runAllPendingReportRefreshPathRef = useRef<string | null>(null)
  const runAllLastLockEventRef = useRef('')
  const prereqInputKeyRef = useRef('')

  const [config, setConfig] = useState<BackportConfig>(DEFAULT_BACKPORT_CONFIG)
  const prereqEnabled = Boolean(config.enable_prerequisite_scan)
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
  const [runAllPauseState, setRunAllPauseState] = useState<
    'idle' | 'running' | 'pause_requested' | 'paused'
  >('idle')
  const [runAllStatusCardVisible, setRunAllStatusCardVisible] = useState(false)
  const [activeRunId, setActiveRunId] = useState('')
  const [runHistory, setRunHistory] = useState<BackportRunSummary[]>([])
  const [executionHistory, setExecutionHistory] = useState<BackportExecutionSummary[]>([])
  const [selectedExecution, setSelectedExecution] = useState('')
  const [restoringRun, setRestoringRun] = useState(false)
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
  const [prereqOnly, setPrereqOnly] = useState(false)
  const [prereqManifest, setPrereqManifest] = useState<BackportPrerequisiteManifest | null>(null)
  const [prereqSelected, setPrereqSelected] = useState<BackportPrerequisiteCandidate[]>([])
  const [prereqReviewed, setPrereqReviewed] = useState(false)
  const [prereqRescanning, setPrereqRescanning] = useState(false)
  const [prereqGeneratedReportPath, setPrereqGeneratedReportPath] = useState('')
  const [commitPage, setCommitPage] = useState(1)
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([])
  const [timeline, setTimeline] = useState<BackportTimelineEntry[]>([])
  const [executionSummary, setExecutionSummary] = useState<BackportExecutionRunSummary | null>(null)
  const [supportTab, setSupportTab] = useState<'timeline' | 'summary' | 'git' | 'conflict-report'>(
    'timeline'
  )
  const [gitLogEntries, setGitLogEntries] = useState<BackportGitLogEntry[]>([])
  const [gitLogLoading, setGitLogLoading] = useState(false)
  const [selectedGitRevision, setSelectedGitRevision] = useState<string | null>(null)
  const [gitShowLoading, setGitShowLoading] = useState(false)
  const [gitShowContent, setGitShowContent] = useState('')
  const [gitLogError, setGitLogError] = useState('')
  const [pathBrowserOpen, setPathBrowserOpen] = useState(false)
  const [commitImportOpen, setCommitImportOpen] = useState(false)
  const [commitEntries, setCommitEntries] = useState<BackportCommitImportEntry[]>([])
  const [browsePath, setBrowsePath] = useState('')
  const [browseEntries, setBrowseEntries] = useState<BackportBrowseEntry[]>([])
  const [browseParentPath, setBrowseParentPath] = useState<string | null>(null)
  const [browseLoading, setBrowseLoading] = useState(false)
  const [recentRepositories, setRecentRepositories] = useState<BackportRepositoryInfo[]>([])
  const [repositoryDialogRole, setRepositoryDialogRole] = useState<BackportRepositoryRole | null>(
    null
  )
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
  const [attemptHistory, setAttemptHistory] = useState<BackportAttemptSummary[]>([])
  const [attemptHistoryLoading, setAttemptHistoryLoading] = useState(false)
  const [attemptHistoryVersion, setAttemptHistoryVersion] = useState(0)
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
    useChatStore.getState().openSettingsPanel('model')
  }

  const sourceRepository = useMemo(
    () =>
      config.source_repo_state ||
      buildLegacyRepositoryInfo(
        'source',
        config.project_dir,
        config.source_branch,
        config.project_url
      ),
    [config.project_dir, config.project_url, config.source_branch, config.source_repo_state]
  )

  const targetRepository = useMemo(
    () =>
      config.target_repo_state ||
      buildLegacyRepositoryInfo('target', config.target_path, config.target_release),
    [config.target_path, config.target_release, config.target_repo_state]
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

      if (prereqOnly && stringifyValue(item.origin) !== 'prerequisite') {
        return false
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
  }, [
    workingCommits,
    titleFilter,
    statusFilter,
    conflictFilter,
    mergedFilter,
    prereqOnly,
    searchQuery,
  ])

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
  const inspectedRowNumber = stringifyValue(inspectedRow?.data.row_number).trim()
  const inspectedLegacyRowId = stringifyValue(inspectedRow?.data.row_id).trim()
  const inspectedCaseRowKey =
    inspectedRowNumber || (/^\d+$/.test(inspectedLegacyRowId) ? inspectedLegacyRowId : '')
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

  useEffect(() => {
    if (loadingConfig) return
    const nextKey = buildPrerequisiteInputKey(config, excelPath, commitEntries)
    if (!prereqInputKeyRef.current) {
      prereqInputKeyRef.current = nextKey
      return
    }
    if (prereqInputKeyRef.current === nextKey) return
    prereqInputKeyRef.current = nextKey
    setPrereqManifest(null)
    setPrereqSelected([])
    setPrereqReviewed(false)
    setPrereqGeneratedReportPath('')
  }, [
    loadingConfig,
    excelPath,
    commitEntries,
    config.project_dir,
    config.source_branch,
    config.source_repo_state?.head,
    config.target_path,
    config.target_release,
    config.target_repo_state?.head,
  ])

  useEffect(() => {
    if (prereqManifest) {
      window.localStorage.setItem(
        PREREQ_STATE_STORAGE_KEY,
        JSON.stringify({
          excelPath,
          commitEntries,
          sourcePath: config.project_dir,
          targetPath: config.target_path,
          inputKey: buildPrerequisiteInputKey(config, excelPath, commitEntries),
          inputDigest: prereqManifest.input_digest,
          targetRef: prereqManifest.target_ref,
          reviewVersion: prereqManifest.review?.review_version || '',
          manifest: prereqManifest,
          selected: prereqSelected,
          reviewed: prereqReviewed,
        })
      )
    } else {
      window.localStorage.removeItem(PREREQ_STATE_STORAGE_KEY)
    }
  }, [
    prereqManifest,
    prereqSelected,
    prereqReviewed,
    excelPath,
    commitEntries,
    config.project_dir,
    config.source_branch,
    config.source_repo_state?.head,
    config.target_path,
    config.target_release,
    config.target_repo_state?.head,
  ])

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

  const rememberActiveRun = (runId: string) => {
    const normalized = runId.trim()
    if (!normalized) return
    setActiveRunId(normalized)
    window.localStorage.setItem(BACKPORT_ACTIVE_RUN_STORAGE_KEY, normalized)
  }

  const refreshRunHistory = async () => {
    try {
      const response = await backportService.listRuns()
      setRunHistory(response.runs)
      return response.runs
    } catch (cause) {
      console.warn('Failed to load Backport task history:', cause)
      return []
    }
  }

  const refreshExecutionHistory = async (runId: string) => {
    try {
      const response = await backportService.listExecutions(runId)
      setExecutionHistory(response.executions)
      return response.executions
    } catch (cause) {
      console.warn('Failed to load Backport Run history:', cause)
      setExecutionHistory([])
      return []
    }
  }

  const getRunAllRowKey = (row: BackportCommitRow) =>
    stringifyValue(
      row.data.row_id || row.data.commit || row.data.input_commit || row.rowId
    ).trim() || row.rowId

  const formatRunAllRowState = (data: BackportCommitItem | undefined) => {
    if (!data) return t('backport.runAll.unknownState')
    const status = resolveStatusMeta(data, t).label
    const conflict = resolveConflictMeta(data, t).label
    return `${status} / ${conflict}`
  }

  const formatRunAllDuration = (startedAt: number | undefined) => {
    if (!startedAt) return t('backport.runAll.elapsedPlaceholder')
    const elapsedSeconds = Math.max(0, (Date.now() - startedAt) / 1000)
    return elapsedSeconds >= 60
      ? t('backport.runAll.elapsedMinutes', { minutes: (elapsedSeconds / 60).toFixed(1) })
      : t('backport.runAll.elapsedSeconds', { seconds: elapsedSeconds.toFixed(1) })
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
      throw new Error(t('backport.error.noResultBlock'))
    }

    setStage(result.stage || (result.status === 'success' ? 'interactive_editing' : 'failed'))

    if (result.status === 'failed') {
      const message = resolveBackportFailureMessage(
        result.diagnostics,
        result.summary || result.diagnostics?.error_text || t('backport.error.executionFailed'),
        t
      )
      setError(message)
      addTimeline(t('backport.timeline.executionFailed'), 'error', message)
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
      setExecutionSummary(null)
    }

    if (result.artifacts?.config_path) {
      setConfigPath(result.artifacts.config_path)
    }

    if (result.artifacts?.run_id) {
      rememberActiveRun(result.artifacts.run_id)
      void refreshRunHistory()
      void refreshExecutionHistory(result.artifacts.run_id)
    }
    if (result.artifacts?.attempt_dir) {
      setAttemptHistoryVersion(version => version + 1)
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
        result.operation === 'run_all' ||
        result.operation === 'prerequisite_commits'
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
      addTimeline(t('backport.timeline.executionStarted'), 'info')
      return
    }

    if (event.type === 'thinking') {
      const thinkingText = String(payload.thinking || '').trim()
      if (thinkingText) {
        addTimeline(t('backport.timeline.planningSteps'), 'info', thinkingText)
      }
      return
    }

    if (event.type === 'tool.call.started') {
      addTimeline(
        t('backport.timeline.toolCallStarted', {
          tool: String(payload.tool_name || 'unknown'),
        }),
        'info'
      )
      return
    }

    if (event.type === 'tool.call.response') {
      addTimeline(
        t('backport.timeline.toolCallFinished', {
          tool: String(payload.name || payload.tool_name || 'unknown'),
          result: payload.is_error
            ? t('backport.timeline.toolCallFailed')
            : t('backport.timeline.toolCallCompleted'),
        }),
        payload.is_error ? 'error' : 'success'
      )
      return
    }

    if (event.type === 'stream.error' || event.type === 'client.error') {
      addTimeline(
        t('backport.timeline.streamFailed'),
        'error',
        JSON.stringify(payload, null, 2)
      )
    }
  }

  const handleRunAllProgress = (progress: BackportRunProgress) => {
    setRunAllStatusCardVisible(true)
    setRunAllProgress(progress)
    const lockEvent = stringifyValue(progress.lock_event).trim()
    if (lockEvent && lockEvent !== runAllLastLockEventRef.current) {
      const lockOwner = [
        progress.lock_owner_task_id
          ? t('backport.runAll.lockOwnerTask', { taskId: progress.lock_owner_task_id })
          : '',
        progress.lock_owner_operation
          ? t('backport.runAll.lockOwnerOperation', {
              operation: progress.lock_owner_operation,
            })
          : '',
      ]
        .filter(Boolean)
        .join('\n')
      if (lockEvent === 'repository_lock_waiting') {
        addTimeline(
          t('backport.timeline.waitingForRepository'),
          'info',
          [progress.message || '', lockOwner].filter(Boolean).join('\n')
        )
      } else if (lockEvent === 'repository_lock_acquired') {
        addTimeline(
          t('backport.timeline.repositoryLockAcquired'),
          'success',
          progress.message || t('backport.runAll.continueCurrentTask')
        )
      } else if (lockEvent === 'repository_lock_timeout') {
        addTimeline(
          t('backport.timeline.repositoryLockTimeout'),
          'error',
          progress.message || t('backport.runAll.repositoryBusyRetry')
        )
      }
      runAllLastLockEventRef.current = lockEvent
    }
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
        const failed = resolveStatusMeta(row.data, t).kind === 'failed'
        addTimeline(
          t('backport.timeline.commitRunFinished', { commit }),
          failed ? 'error' : 'success',
          [
            title ? t('backport.runAll.titleLine', { title }) : '',
            t('backport.runAll.statusLine', { previous: previousState, next: nextState }),
            duration,
            progress.message ? t('backport.runAll.noteLine', { message: progress.message }) : '',
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

  const restoreRun = async (
    runId: string,
    restoreConfig: BackportConfig,
    knownSummary?: BackportRunSummary
  ): Promise<boolean> => {
    const normalizedRunId = runId.trim()
    if (!normalizedRunId) return false
    setRestoringRun(true)
    setExecutionSummary(null)
    rememberActiveRun(normalizedRunId)
    setCommitEntries([])
    if (knownSummary?.commit_csv_path) {
      try {
        const preview = await backportService.previewCommitImportText(
          await backportService.getTaskCommitCsv(normalizedRunId),
          'csv'
        )
        if (preview.errors?.length || preview.entries.length === 0) {
          throw new Error(preview.errors?.[0]?.message || t('backport.error.archivedCsvNoEntries'))
        }
        setCommitEntries(preview.entries)
        setExcelPath('')
        setConfig(prev => ({ ...prev, current_excel_path: '' }))
      } catch (cause) {
        console.warn('Failed to restore archived Backport commit CSV:', cause)
      }
    } else if (knownSummary?.excel_path) {
      setExcelPath(knownSummary.excel_path)
      setConfig(prev => ({ ...prev, current_excel_path: knownSummary.excel_path }))
    }
    try {
      const executions = await refreshExecutionHistory(normalizedRunId)
      const preferredExecution = knownSummary?.current_execution
      const selected =
        executions.find(item => item.execution === preferredExecution) || executions[0]
      setSelectedExecution(selected ? String(selected.execution) : '')
      let current = await backportService.getRun(normalizedRunId)
      setExecutionSummary(current.execution_summary || null)
      if (current.progress) {
        handleRunAllProgress(current.progress)
      }
      if (current.status === 'running') {
        setRunning(true)
        setRunningLabel(BACKPORT_OPERATION_IDS.resumeRun)
        setRunAllPauseState('running')
        setRunAllStatusCardVisible(Boolean(current.progress))
        if (current.action === 'run_all') {
          setRunAllControl({
            runId: normalizedRunId,
            pause: () => backportService.pauseRun(normalizedRunId),
          })
        }
        addTimeline(t('backport.timeline.reconnectedRunningTask'), 'info', normalizedRunId)
        current = await backportService.resumeRun(normalizedRunId, handleRunAllProgress, {
          onRunUpdated: run => {
            setExecutionSummary(run.execution_summary || null)
            setRunAllStatusCardVisible(currentVisible => currentVisible || Boolean(run.progress))
            if (run.pause_requested && run.status === 'running') {
              setRunAllPauseState('pause_requested')
            }
          },
        })
      }

      if (current.result?.parsedResult) {
        applyOperationResult(current.result.parsedResult)
      } else {
        let reportPath =
          current.progress?.current_report_path ||
          knownSummary?.current_report_path ||
          restoreConfig.current_report_path ||
          ''
        // 任务不在列表且后端为持久化恢复记录时,result/progress 可能不含
        // report 路径:从 task manifest 补充定位信息,避免只恢复任务 ID 无内容
        if (!reportPath) {
          try {
            const task = await backportService.getTask(normalizedRunId)
            reportPath = task?.current_report_path || ''
          } catch (taskError) {
            console.warn('Failed to load saved task manifest for report path:', taskError)
          }
        }
        if (reportPath) {
          const loaded = await backportService.loadReport({
            config: restoreConfig,
            baseReportPath: reportPath,
          })
          applyOperationResult(loaded.parsedResult)
        } else if (current.status !== 'running') {
          // 非运行中任务必须能加载到 report,否则视为恢复失败
          // (running 任务无 report 属正常,继续轮询即可)
          throw new Error(t('backport.error.reportContentNotFound'))
        }
      }

      if (current.status === 'interrupted') {
        setStage('paused')
        setRunAllPauseState('paused')
        setError(t('backport.error.interruptedRecovered'))
        addTimeline(
          t('backport.timeline.runInterrupted'),
          'error',
          t('backport.timeline.restoredLastReport')
        )
      } else if (current.status === 'paused') {
        setRunAllPauseState('paused')
      } else if (current.status === 'failed') {
        setStage('failed')
        setError(current.error || t('backport.error.runFailed'))
      }
      return true
    } catch (cause) {
      console.warn('Failed to restore Backport run:', cause)
      addTimeline(
        t('backport.timeline.restoreFailed'),
        'error',
        cause instanceof Error ? cause.message : t('backport.error.savedRunUnreadable')
      )
      return false
    } finally {
      setRunning(false)
      setRunningLabel('')
      setRunAllControl(null)
      setRestoringRun(false)
      void refreshRunHistory()
    }
  }

  const runOperation = async (
    operationId: BackportOperationId,
    label: string,
    runner: () => Promise<Awaited<ReturnType<typeof backportService.generateReport>>>
  ) => {
    setRunning(true)
    setRunningLabel(operationId)
    setGitLogError('')
    addTimeline(t('backport.timeline.stepStarted', { label }), 'info')

    try {
      const response = await runner()
      applyOperationResult(response.parsedResult)
      return response
    } catch (cause) {
      console.error(`Failed to run Backport operation: ${label}`, cause)
      const diagnostics = (cause as Error & { diagnostics?: BackportOperationDiagnostics })
        .diagnostics
      const message = resolveBackportFailureMessage(
        diagnostics,
        cause instanceof Error ? cause.message : t('backport.error.operationFailed', { label }),
        t
      )
      setError(message)
      setStage('failed')
      addTimeline(t('backport.timeline.operationFailed', { label }), 'error', message)
      toast({
        title: t('common:status.error'),
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
        errors: [
          cause instanceof Error ? cause.message : t('backport.error.runtimeStatusLoadFailed'),
        ],
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
      let sanitizedConfig = normalizeBackportConfig({
        ...nextConfig,
        current_excel_path: '',
        current_report_path: '',
        current_filtered_report_path: '',
      })
      try {
        const models = await modelService.getModels()
        setBackportModels(models)
        const compatibleModels = models.filter(isBackportCompatibleModel)
        const modelResolution = resolveBackportModelReference(
          sanitizedConfig.backport_model_id,
          compatibleModels
        )
        sanitizedConfig = {
          ...sanitizedConfig,
          backport_model_id: modelResolution.modelId,
        }
        if (modelResolution.shouldOpenSelector) {
          setRuntimeModelSelectorOpen(true)
        }
        if (modelResolution.repaired) {
          try {
            await backportService.updateConfig({
              ...nextConfig,
              backport_model_id: modelResolution.modelId,
            })
          } catch (repairError) {
            console.error('Failed to repair Backport model reference:', repairError)
            toast({
              title: t('backport.toast.noticeTitle'),
              description: t('backport.toast.modelRepairSaveFailed'),
              variant: 'destructive',
            })
          }
        }
      } catch (modelError) {
        console.error('Failed to load Backport model list:', modelError)
        toast({
          title: t('backport.toast.noticeTitle'),
          description: t('backport.toast.modelListLoadFailed'),
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
      try {
        const rawPrereq = window.localStorage.getItem(PREREQ_STATE_STORAGE_KEY)
        if (rawPrereq && sanitizedConfig.enable_prerequisite_scan) {
          const saved = JSON.parse(rawPrereq) as {
            excelPath?: string
            commitEntries?: BackportCommitImportEntry[]
            sourcePath?: string
            targetPath?: string
            inputKey?: string
            inputDigest?: string
            targetRef?: string
            reviewVersion?: string
            manifest?: BackportPrerequisiteManifest
            selected?: BackportPrerequisiteCandidate[]
            reviewed?: boolean
          }
          const restoredExcelPath = saved.excelPath || ''
          const restoredCommitEntries = Array.isArray(saved.commitEntries)
            ? saved.commitEntries
            : []
          const review = saved.manifest?.review
          const currentInputKey = buildPrerequisiteInputKey(
            sanitizedConfig,
            restoredExcelPath,
            restoredCommitEntries
          )
          if (
            saved.manifest &&
            review &&
            saved.sourcePath === sanitizedConfig.project_dir &&
            saved.targetPath === sanitizedConfig.target_path &&
            saved.inputKey === currentInputKey &&
            saved.inputDigest === saved.manifest.input_digest &&
            review.input_digest === saved.manifest.input_digest &&
            saved.targetRef === saved.manifest.target_ref &&
            review.target_ref === saved.manifest.target_ref &&
            saved.reviewVersion === review.review_version
          ) {
            prereqInputKeyRef.current = currentInputKey
            setExcelPath(restoredExcelPath)
            setCommitEntries(restoredCommitEntries)
            setPrereqManifest(saved.manifest)
            setPrereqSelected(
              Array.isArray(saved.selected)
                ? saved.selected
                : (saved.manifest.candidates || []).filter(candidate => candidate.default_selected)
            )
            setPrereqReviewed(Boolean(saved.reviewed))
          }
        }
      } catch {
        window.localStorage.removeItem(PREREQ_STATE_STORAGE_KEY)
      }
      if (!prereqInputKeyRef.current) {
        prereqInputKeyRef.current = buildPrerequisiteInputKey(
          sanitizedConfig,
          sanitizedConfig.current_excel_path || ''
        )
      }
      try {
        // 旧 key(activeRunId)迁移到新 key(activeTaskId.v3):删除前若新 key
        // 为空且旧 key 有值则迁移,避免升级后首次打开丢失上次任务
        const legacyRunId = window.localStorage.getItem('polymind.backport.activeRunId')
        let storedRunId = window.localStorage.getItem(BACKPORT_ACTIVE_RUN_STORAGE_KEY) || ''
        if (!storedRunId && legacyRunId) {
          window.localStorage.setItem(BACKPORT_ACTIVE_RUN_STORAGE_KEY, legacyRunId)
          storedRunId = legacyRunId
        }
        window.localStorage.removeItem('polymind.backport.activeRunId')
        const runs = await refreshRunHistory()
        if (storedRunId) {
          // 优先直接恢复 localStorage 中保存的任务(不依赖任务列表包含它);
          // 单任务恢复失败(任务已清理/过期)时提示用户,再回退最新任务
          const savedRun = runs.find(run => run.run_id === storedRunId)
          let restored = false
          try {
            const probe = await backportService.getRun(storedRunId)
            if (probe) {
              // restoreRun 内部失败(执行历史/状态/report 加载)时返回 false,
              // 由外层提示并回退最新任务
              restored = await restoreRun(storedRunId, sanitizedConfig, savedRun)
            }
          } catch (probeError) {
            console.warn('Saved Backport task unavailable, falling back to latest:', probeError)
          }
          if (restored) {
            return
          }
          toast({
            title: t('backport.toast.noticeTitle'),
            description: t('backport.toast.taskUnavailableSwitched'),
          })
        }
        // 无保存 ID 或保存 ID 恢复失败:回退到任务列表最新任务
        const selectedRun = runs[0]
        if (selectedRun) {
          await restoreRun(selectedRun.run_id, sanitizedConfig, selectedRun)
        }
      } catch (restoreError) {
        console.warn('Failed to restore Backport history:', restoreError)
      }
    } catch (cause) {
      console.error('Failed to load Backport page:', cause)
      toast({
        title: t('common:status.error'),
        description: t('backport.toast.configLoadFailed'),
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
    setAttemptHistory([])
    if (!inspectedCaseRowKey || !activeRunId) return
    setAttemptHistoryLoading(true)
    void backportService
      .listCaseAttempts(activeRunId, inspectedCaseRowKey)
      .then(response => setAttemptHistory(response.attempts))
      .catch(cause => {
        console.warn('Failed to load Backport attempt history:', cause)
        setAttemptHistory([])
      })
      .finally(() => setAttemptHistoryLoading(false))
  }, [inspectedCaseRowKey, activeRunId, attemptHistoryVersion])

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
      addTimeline(t('backport.timeline.configSaved'), 'success', savedConfigPath || undefined)
      if (!silent) {
        toast({
          title: t('common:status.success'),
          description: t('backport.toast.configSaved'),
        })
      }
    } catch (cause) {
      console.error('Failed to save Backport config:', cause)
      toast({
        title: t('common:status.error'),
        description: t('backport.toast.configSaveFailed'),
        variant: 'destructive',
      })
    } finally {
      setSavingConfig(false)
    }
  }

  const buildConfigWithRepository = (
    previousConfig: BackportConfig,
    role: BackportRepositoryRole,
    repository: BackportRepositoryInfo
  ): BackportConfig => {
    if (role === 'source') {
      return {
        ...previousConfig,
        project_url: repository.source_url || '',
        project_dir: repository.local_path,
        source_branch:
          repository.selected_branch || repository.default_branch || previousConfig.source_branch,
        source_repo_input: repository.input,
        source_repo_state: repository,
      }
    }
    return {
      ...previousConfig,
      target_path: repository.local_path,
      target_release:
        repository.selected_branch || repository.default_branch || previousConfig.target_release,
      target_repo_input: repository.input,
      target_repo_state: repository,
    }
  }

  const shouldHydrateRepository = (
    repository: BackportRepositoryInfo | null | undefined,
    localPath: string
  ) => {
    if (!localPath.trim()) return false
    if (!repository) return true
    if (!repository.short_head.trim()) return true
    if (
      (repository.local_branches || []).length <= 1 &&
      (repository.remote_branches || []).length === 0
    ) {
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
    repository: BackportRepositoryInfo
  ) => {
    const nextConfig = buildConfigWithRepository(configRef.current, role, repository)
    setConfig(nextConfig)
    await handleSaveConfig(true, nextConfig)
    await loadRecentRepositories()
    addTimeline(
      t('backport.timeline.repositoryPrepared', {
        role:
          role === 'source'
            ? t('backport.repository.role.source')
            : t('backport.repository.role.target'),
      }),
      'success',
      repository.local_path
    )
  }

  const pollRepositoryPrepareTask = async (
    role: BackportRepositoryRole,
    taskId: string
  ): Promise<BackportRepositoryPrepareResponse> => {
    let current = await backportService.getRepositoryPrepareTask(taskId)
    setRepositoryPrepareTask(current)
    while (current.status === 'running') {
      await new Promise(resolve => setTimeout(resolve, 1500))
      current = await backportService.getRepositoryPrepareTask(taskId)
      setRepositoryPrepareTask(current)
    }
    if (current.status === 'failed') {
      throw new Error(current.error || t('backport.error.repositoryPrepareFailed'))
    }
    if (!current.result) {
      throw new Error(t('backport.error.repositoryPrepareNoResult'))
    }
    await applyPreparedRepository(role, current.result)
    return current
  }

  const handlePrepareRepository = async () => {
    const role = repositoryDialogRole
    const input = repositoryInput.trim()
    if (!role || !input) {
      toast({
        title: t('backport.toast.noticeTitle'),
        description: t('backport.toast.pasteRepoInput'),
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
            title: t('backport.prepareStep.parseLocalPath'),
            status: 'running',
            detail: input,
          },
          {
            title: t('backport.prepareStep.confirmGitRepo'),
            status: 'running',
            detail: 'git rev-parse --is-inside-work-tree / git rev-parse HEAD',
          },
          {
            title: t('backport.prepareStep.readBranchAndStatus'),
            status: 'running',
            detail:
              role === 'target'
                ? t('backport.prepareStep.targetChecksWritable')
                : t('backport.prepareStep.sourceLightweightRead'),
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
              title: t('backport.prepareStep.localRepoReadDone'),
              status: 'success',
              detail: refreshed.short_head
                ? `${refreshed.selected_branch || t('backport.prepareStep.currentCommit')} @ ${refreshed.short_head}`
                : refreshed.local_path,
            },
          ],
          result: refreshed,
          error: '',
        }))
        await applyPreparedRepository(role, refreshed)
        toast({
          title: t('backport.toast.repositoryReady'),
          description: refreshed.display_name || input,
        })
        setRepositoryDialogRole(null)
        setRepositoryInput('')
        setRepositoryPrepareTask(null)
        setRepositoryPreparingRole(null)
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : t('backport.error.localRepoCheckFailed')
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
          title: t('backport.toast.localRepoCheckFailed'),
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
          title: t('backport.prepareStep.submitPrepareRequest'),
          status: 'running',
          detail: 'POST /backport/repositories/prepare',
        },
        {
          title: t('backport.prepareStep.waitingBackendDetect'),
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
        title: t('backport.toast.repositoryReady'),
        description: completed.result?.display_name || input,
      })
      setRepositoryDialogRole(null)
      setRepositoryInput('')
      setRepositoryPrepareTask(null)
      setRepositoryPreparingRole(null)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t('backport.error.repositoryPrepareFailed')
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
        title: t('backport.toast.repositoryPrepareFailed'),
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
          title: t('backport.refreshStep.readCurrentCommit'),
          status: 'running',
          detail: `git -C ${repository.local_path} rev-parse HEAD`,
        },
        {
          title: t('backport.refreshStep.readBranches'),
          status: 'running',
          detail: 'git branch --format=... / git branch -r --format=...',
        },
        {
          title: t('backport.refreshStep.checkWorktreeClean'),
          status: 'running',
          detail: 'git status --porcelain=v1 -uall',
        },
        {
          title: t('backport.refreshStep.readOriginUrl'),
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
        title: t('backport.toast.repositoryStatusRefreshed'),
        description: refreshed.display_name,
      })
      setRepositoryPrepareTask(null)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t('backport.error.repositoryRefreshFailed')
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
        title: t('backport.toast.repositoryRefreshFailed'),
        description: message,
        variant: 'destructive',
      })
    } finally {
      setRepositoryPreparingRole(null)
    }
  }

  const handleRepositoryBranchChange = (role: BackportRepositoryRole, branch: string) => {
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
        title: t('backport.toast.noticeTitle'),
        description: t('backport.toast.generateReportFirst'),
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
        title: t('backport.toast.previewRefreshed'),
        description:
          resolveCommitTitle(row.data) ||
          stringifyValue(row.data.commit || row.data.input_commit) ||
          'Commit Message',
      })
    } catch (cause) {
      toast({
        title: t('backport.toast.previewRefreshFailed'),
        description:
          cause instanceof Error ? cause.message : t('backport.toast.commitMessagePreviewFailed'),
        variant: 'destructive',
      })
    } finally {
      setCommitMessagePreviewLoadingRowId(null)
    }
  }

  const handleImportAndFindPrereqs = async () => {
    if (!excelPath.trim() && commitEntries.length === 0) {
      toast({
        title: t('backport.toast.noticeTitle'),
        description: t('backport.toast.importCommitsOrExcel'),
      })
      return
    }

    const scanConfig = normalizeBackportConfig({
      ...configRef.current,
      current_excel_path: excelPath.trim(),
      current_report_path: '',
      current_filtered_report_path: '',
    })
    setBaseReportPath('')
    setFilteredReportPath('')
    setPrereqGeneratedReportPath('')
    setActiveRunId('')
    window.localStorage.removeItem(BACKPORT_ACTIVE_RUN_STORAGE_KEY)
    configRef.current = scanConfig
    prereqInputKeyRef.current = buildPrerequisiteInputKey(
      scanConfig,
      excelPath.trim(),
      commitEntries
    )
    await handleSaveConfig(true, scanConfig)

    const response = await runOperation(
      commitEntries.length > 0
        ? BACKPORT_OPERATION_IDS.importCommitsFindPrereqs
        : BACKPORT_OPERATION_IDS.importExcelFindPrereqs,
      commitEntries.length > 0
        ? t('backport.operation.importCommitsFindPrereqs')
        : t('backport.operation.importExcelFindPrereqs'),
      () =>
        backportService.findPrerequisiteCommits(
          {
            config: scanConfig,
            excelPath: excelPath.trim(),
            commitEntries,
          },
          handleAgentEvent
        )
    )
    const manifest = response.parsedResult?.manifest
    if (!manifest) {
      throw new Error(t('backport.error.prereqScanNoResult'))
    }
    setPrereqManifest(manifest)
    setPrereqSelected(manifest.candidates.filter(candidate => candidate.default_selected))
    setPrereqReviewed(false)
  }

  const handlePrereqConfirm = (selected: BackportPrerequisiteCandidate[]) => {
    const rows: BackportCommitItem[] = selected.map(candidate => ({
      commit: candidate.commit,
      commit_title: candidate.title || '',
      status: 'pending',
      origin: 'prerequisite',
      required_by: candidate.required_by || [],
      capabilities: candidate.capabilities || [],
    }))
    setWorkingCommits(prev => mergeCommitRows(prev, rows))
    setOriginalCommits(prev => mergeCommitRows(prev, rows))
    setPrereqSelected(selected)
    setPrereqReviewed(true)
  }

  const handlePrereqCancel = () => {
    setPrereqManifest(null)
    setPrereqSelected([])
    setPrereqReviewed(false)
    setPrereqGeneratedReportPath('')
  }

  const handlePrereqRescan = async () => {
    setPrereqReviewed(false)
    setPrereqSelected([])
    setPrereqRescanning(true)
    try {
      await handleImportAndFindPrereqs()
    } finally {
      setPrereqRescanning(false)
    }
  }

  const handleGenerateReportWithPrereqs = async () => {
    if ((!excelPath.trim() && commitEntries.length === 0) || !prereqManifest?.review) {
      await handleImportAndFindPrereqs()
      return
    }

    const generateConfig = normalizeBackportConfig({
      ...configRef.current,
      current_excel_path: excelPath.trim(),
    })
    configRef.current = generateConfig
    await handleSaveConfig(true, generateConfig)
    let createdRunId = ''
    try {
      const response = await runOperation(
        BACKPORT_OPERATION_IDS.generateConfigAndReport,
        t('backport.operation.generateConfigAndReport'),
        () =>
          backportService.generateReport(
            {
              config: generateConfig,
              excelPath: excelPath.trim(),
              commitEntries,
              prerequisite_commits: prereqSelected,
              prerequisite_review: prereqManifest.review,
            },
            handleAgentEvent,
            {
              onRunCreated: control => {
                createdRunId = control.runId
                rememberActiveRun(control.runId)
                void refreshRunHistory()
              },
            }
          )
      )
      const reportPath =
        response.parsedResult?.artifacts?.base_report_path ||
        response.parsedResult?.artifacts?.report_path ||
        response.parsedResult?.report?.report_path ||
        ''
      if (!createdRunId || !reportPath) {
        throw new Error(t('backport.error.generateReportNoTaskOrReport'))
      }
      const nextConfig = normalizeBackportConfig({
        ...generateConfig,
        current_report_path: reportPath,
        current_filtered_report_path: '',
      })
      configRef.current = nextConfig
      setConfig(nextConfig)
      setPrereqGeneratedReportPath(reportPath)
      return { response, runId: createdRunId, reportPath }
    } catch (cause) {
      if ((cause as Error & { code?: string }).code === PREREQ_REVIEW_STALE_CODE) {
        setPrereqManifest(null)
        setPrereqSelected([])
        setPrereqReviewed(false)
        setPrereqGeneratedReportPath('')
        setError('')
        toast({
          title: t('backport.toast.prereqReviewStale'),
          description: t('backport.toast.prereqReviewStaleDesc'),
          variant: 'destructive',
        })
        return
      }
      throw cause
    }
  }

  const handleGenerateReport = async () => {
    if (prereqEnabled && !prereqReviewed) {
      return handleImportAndFindPrereqs()
    }
    if (prereqEnabled && prereqReviewed) {
      return handleGenerateReportWithPrereqs()
    }
    if (!excelPath.trim() && commitEntries.length === 0) {
      toast({
        title: t('backport.toast.noticeTitle'),
        description: t('backport.toast.importCommitsOrExcel'),
      })
      return
    }

    await handleSaveConfig(true)
    setConfig(prev => ({ ...prev, current_excel_path: excelPath.trim() }))
    await runOperation(
      BACKPORT_OPERATION_IDS.generateConfigAndReport,
      t('backport.operation.generateConfigAndReport'),
      () =>
        backportService.generateReport(
          {
            config,
            excelPath: excelPath.trim(),
            commitEntries,
            runId: activeRunId || undefined,
          },
          handleAgentEvent,
          {
            onRunCreated: control => {
              rememberActiveRun(control.runId)
              void refreshRunHistory()
            },
          }
        )
    )
  }

  const handleRunAll = async () => {
    const normalizedExcelPath = excelPath.trim()
    let normalizedBaseReportPath = baseReportPath.trim()
    let runTaskId = activeRunId
    let generatedPrerequisiteReport = false
    if (!normalizedExcelPath && commitEntries.length === 0 && !normalizedBaseReportPath) {
      toast({
        title: t('backport.toast.noticeTitle'),
        description: t('backport.toast.importOrGenerateReport'),
      })
      return
    }

    if (prereqEnabled && !prereqReviewed) {
      await handleImportAndFindPrereqs()
      return
    }
    if (prereqEnabled && prereqReviewed) {
      if (!prereqManifest?.review) {
        setPrereqReviewed(false)
        await handleImportAndFindPrereqs()
        return
      }
      if (!prereqGeneratedReportPath || prereqGeneratedReportPath !== normalizedBaseReportPath) {
        const generated = await handleGenerateReportWithPrereqs()
        if (!generated) return
        normalizedBaseReportPath = generated.reportPath
        runTaskId = generated.runId
        generatedPrerequisiteReport = true
      }
    }

    await handleSaveConfig(true)
    const runConfig = normalizeBackportConfig({
      ...configRef.current,
      current_excel_path: normalizedExcelPath,
    })
    if (
      !generatedPrerequisiteReport &&
      ((stage === 'completed' && runTaskId) || (!runTaskId && !normalizedBaseReportPath))
    ) {
      try {
        const operationId = runTaskId
          ? BACKPORT_OPERATION_IDS.regenerateExecutionReport
          : BACKPORT_OPERATION_IDS.generateExecutionReport
        const operationName = runTaskId
          ? t('backport.operation.regenerateExecutionReport')
          : t('backport.operation.generateExecutionReport')
        let generatedRunId = ''
        const regenerated = await runOperation(operationId, operationName, async () => {
          const response = await backportService.generateReport(
            {
              config: runConfig,
              excelPath: normalizedExcelPath,
              commitEntries,
              runId: runTaskId || undefined,
            },
            handleAgentEvent,
            {
              onRunCreated: control => {
                generatedRunId = control.runId
                rememberActiveRun(control.runId)
              },
            }
          )
          if (
            !response.parsedResult?.artifacts?.base_report_path &&
            !response.parsedResult?.artifacts?.report_path
          ) {
            throw new Error(t('backport.error.noUsableReportAfterRerun'))
          }
          return response
        })
        normalizedBaseReportPath =
          regenerated.parsedResult?.artifacts?.base_report_path ||
          regenerated.parsedResult?.artifacts?.report_path ||
          ''
        runTaskId = generatedRunId || runTaskId
      } catch {
        return
      }
    }
    configRef.current = runConfig
    setConfig(runConfig)
    setExcelPath(normalizedExcelPath)
    setRunAllProgress(null)
    setExecutionSummary(null)
    setRunAllControl(null)
    setRunAllPauseState('running')
    setRunAllStatusCardVisible(true)
    runAllRowStartedAtRef.current = {}
    runAllLastProcessedCountRef.current = 0
    runAllReportRefreshInFlightRef.current = false
    runAllPendingReportRefreshPathRef.current = null
    runAllLastLockEventRef.current = ''

    let response: Awaited<ReturnType<typeof backportService.runAll>>
    try {
      response = await runOperation(
        BACKPORT_OPERATION_IDS.runAll,
        t('backport.operation.runAll'),
        () =>
          backportService.runAll(
            {
              config: runConfig,
              excelPath: normalizedExcelPath,
              commitEntries,
              runId: runTaskId || undefined,
              baseReportPath: normalizedBaseReportPath,
              workingReportPath: generatedPrerequisiteReport
                ? normalizedBaseReportPath
                : filteredReportPath.trim() || normalizedBaseReportPath,
            },
            handleAgentEvent,
            handleRunAllProgress,
            {
              onRunCreated: control => {
                rememberActiveRun(control.runId)
                setRunAllControl(control)
                setRunAllPauseState('running')
                void refreshRunHistory()
              },
              onRunUpdated: run => {
                setExecutionSummary(run.execution_summary || null)
                if (run.pause_requested && run.status === 'running') {
                  setRunAllPauseState('pause_requested')
                }
              },
            }
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
      runAllLastLockEventRef.current = ''
      throw cause
    }
    setRunAllControl(null)
    if (response.parsedResult?.stage === 'paused') {
      setRunAllPauseState('paused')
      toast({
        title: t('backport.toast.pausedTitle'),
        description: response.parsedResult.summary || t('backport.toast.reportSavedCanResume'),
      })
      return
    }
    setRunAllPauseState('idle')
    if (response.parsedResult?.stage === 'completed') {
      toast({
        title: t('backport.toast.completedTitle'),
        description: t('backport.toast.runAllCompleted'),
      })
    } else if (response.parsedResult?.stage === 'interactive_editing') {
      toast({
        title: t('backport.toast.pausedTitle'),
        description: response.parsedResult.summary || t('backport.toast.needsManualContinue'),
      })
    }
  }

  const handlePauseRunAll = async () => {
    if (!runAllControl || runAllPauseState !== 'running') return
    const previousProgress = runAllProgress
    setRunAllPauseState('pause_requested')
    setRunAllProgress(current => ({
      ...(current || {}),
      phase: 'pause_requested',
      message: t('backport.runAll.pausingMessage'),
    }))
    try {
      await runAllControl.pause()
    } catch (cause) {
      console.error('Failed to pause Backport run_all:', cause)
      setRunAllPauseState('running')
      setRunAllProgress(previousProgress)
      toast({
        title: t('backport.toast.pauseFailed'),
        description: cause instanceof Error ? cause.message : t('backport.toast.pauseRunAllFailed'),
        variant: 'destructive',
      })
    }
  }

  const handleContinueReport = async () => {
    if (!baseReportPath.trim()) {
      toast({
        title: t('backport.toast.noticeTitle'),
        description: t('backport.toast.noReportToContinue'),
        duration: 1200,
      })
      return
    }
    if (firstBlockingConflictRow) {
      toast({
        title: t('backport.toast.noticeTitle'),
        description: t('backport.toast.resolveConflictFirst'),
        duration: 1200,
      })
      return
    }
    if (!hasPendingRows) {
      toast({
        title: t('backport.toast.noticeTitle'),
        description: t('backport.toast.noPendingCommits'),
        duration: 1200,
      })
      return
    }

    await runOperation(
      BACKPORT_OPERATION_IDS.continueCheck,
      t('backport.operation.continueCheck'),
      () =>
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
      const response = await runOperation(
        BACKPORT_OPERATION_IDS.refreshGitLog,
        t('backport.operation.refreshGitLog'),
        () => backportService.loadGitLog({ config }, handleAgentEvent)
      )
      const result = response.parsedResult
      if (result?.status === 'failed') {
        setGitLogError(
          result.summary || result.diagnostics?.error_text || t('backport.error.gitLogRefreshFailed')
        )
      }
    } catch (cause) {
      setGitLogError(
        cause instanceof Error ? cause.message : t('backport.error.gitLogRefreshFailed')
      )
    } finally {
      setGitLogLoading(false)
    }
  }

  const handleLoadGitShow = async (revision: string) => {
    setSelectedGitRevision(revision)
    setGitShowLoading(true)
    setGitLogError('')
    try {
      const response = await runOperation(
        BACKPORT_OPERATION_IDS.readGitShow,
        t('backport.operation.readGitShow'),
        () =>
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
        setGitLogError(
          result.summary || result.diagnostics?.error_text || t('backport.error.gitShowReadFailed')
        )
      }
    } catch (cause) {
      setGitLogError(
        cause instanceof Error ? cause.message : t('backport.error.gitShowReadFailed')
      )
    } finally {
      setGitShowLoading(false)
    }
  }

  const handleDownloadCommitCsv = async () => {
    if (!activeRunId) return
    try {
      const content = await backportService.getTaskCommitCsv(activeRunId)
      const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'commits.csv'
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (cause) {
      toast({
        title: t('backport.toast.csvDownloadFailed'),
        description: cause instanceof Error ? cause.message : t('backport.toast.archivedCsvMissing'),
        variant: 'destructive',
      })
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
      const message = cause instanceof Error ? cause.message : t('backport.error.serverPathReadFailed')
      toast({
        title: t('common:status.error'),
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
        title: t('backport.toast.noticeTitle'),
        description: t('backport.toast.generateReportFirst'),
      })
      return
    }
    if (resolved.commits.length === 0) {
      toast({
        title: t('backport.toast.noticeTitle'),
        description: t('backport.toast.noExecutableRows'),
      })
      return
    }

    await handleSaveConfig(true)
    await runOperation(
      BACKPORT_OPERATION_IDS.executeSelected,
      t('backport.operation.executeSelected'),
      () =>
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
    await runOperation(
      BACKPORT_OPERATION_IDS.applySingleCommit,
      t('backport.operation.applySingleCommit'),
      () =>
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
        title: t('backport.toast.noticeTitle'),
        description: t('backport.toast.pastePatchToCheck'),
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
        result?.status === 'success'
          ? t('backport.timeline.manualPatchCheckPassed')
          : t('backport.timeline.manualPatchCheckFailed'),
        result?.status === 'success' ? 'success' : 'error',
        result?.diagnostics?.error_text || result?.manual_patch?.stderr || result?.summary
      )
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : t('backport.error.manualPatchCheckFailed')
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
        result?.status === 'success'
          ? t('backport.timeline.manualPatchApplied')
          : t('backport.timeline.manualPatchApplyFailed'),
        result?.status === 'success' ? 'success' : 'error',
        result?.diagnostics?.error_text || result?.manual_patch?.stderr || result?.summary
      )
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : t('backport.error.manualPatchApplyFailed')
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
    await runOperation(
      BACKPORT_OPERATION_IDS.resolveConflictRow,
      t('backport.operation.resolveConflictRow'),
      () =>
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
    await runOperation(
      BACKPORT_OPERATION_IDS.recheckConflict,
      t('backport.operation.recheckConflict'),
      () =>
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
        title: t('backport.toast.noticeTitle'),
        description: t('backport.toast.generateReportBeforeAnalyze'),
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
            error: cause instanceof Error ? cause.message : t('backport.error.patchReadFailed'),
          })
        }
      }

      const taskMessage = buildCompactBackportConflictAnalysisMessage({
        config,
        baseReportPath: baseReportPath.trim(),
        workingReportPath: currentWorkingReportPath,
        row,
        patches: analysisPatches,
        t,
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
        t('backport.timeline.conflictAnalysisStarted'),
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
      const message =
        cause instanceof Error ? cause.message : t('backport.error.conflictAnalysisFailed')
      addTimeline(t('backport.timeline.conflictAnalysisFailed'), 'error', message)

      if (conversationId && thinkingMessageId) {
        const store = useChatStore.getState()
        store.deleteMessage(conversationId, thinkingMessageId)
        store.addMessage(conversationId, {
          id: generateUUID(),
          role: 'assistant',
          content: t('backport.conflictAnalysisFailedRetry'),
          timestamp: new Date(),
          isStreaming: false,
        })
        store.setStreaming(conversationId, false)
      }

      toast({
        title: t('common:status.error'),
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
    addTimeline(
      t('backport.timeline.restoredOriginalList'),
      'info',
      t('backport.timeline.restoredCount', { count: originalCommits.length })
    )
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
    addTimeline(
      t('backport.timeline.deletedSelectedRows'),
      'info',
      t('backport.timeline.deletedCount', { count: selected.size })
    )
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
    setExecutionHistory([])
    setSelectedExecution('')
  }

  const handleNewTask = () => {
    handleResetAll()
    setActiveRunId('')
    window.localStorage.removeItem(BACKPORT_ACTIVE_RUN_STORAGE_KEY)
    addTimeline(
      t('backport.timeline.newTaskCreated'),
      'info',
      t('backport.timeline.newTaskHint')
    )
  }

  const handleSelectRun = (runId: string) => {
    const selected = runHistory.find(run => run.run_id === runId)
    void restoreRun(runId, configRef.current, selected)
  }

  const handleSelectExecution = (value: string) => {
    const execution = executionHistory.find(item => String(item.execution) === value)
    if (!execution?.report_path) return
    setSelectedExecution(value)
    setExecutionSummary(execution.execution_summary)
    void backportService
      .loadReport({
        config: configRef.current,
        baseReportPath: execution.report_path,
      })
      .then(response => {
        applyOperationResult(response.parsedResult)
        setStage(execution.status === 'success' ? 'completed' : 'interactive_editing')
        addTimeline(
          t('backport.timeline.switchedToRun', { execution: execution.execution }),
          'info',
          execution.report_path
        )
      })
      .catch(cause => {
        toast({
          title: t('backport.toast.historyLoadFailed'),
          description: cause instanceof Error ? cause.message : t('backport.toast.historyReportUnreadable'),
          variant: 'destructive',
        })
      })
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
        title: t('common:action.copied'),
        description: t('backport.toast.copiedToClipboard', { label }),
      })
    } catch (cause) {
      console.error(`Failed to copy ${label}:`, cause)
      toast({
        title: t('backport.toast.copyFailed'),
        description: t('backport.toast.unableToCopy', { label }),
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
      const message = cause instanceof Error ? cause.message : t('backport.error.patchReadFailed')
      setPatchPreviews(prev => ({
        ...prev,
        [previewKey]: {
          status: 'error',
          resource,
          error: message,
        },
      }))
      toast({
        title: t('common:status.error'),
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
      success: workingCommits.filter(row => resolveStatusMeta(row.data, t).kind === 'success')
        .length,
      conflict: workingCommits.filter(row => resolveStatusMeta(row.data, t).kind === 'conflict')
        .length,
      noop: workingCommits.filter(row => resolveStatusMeta(row.data, t).kind === 'noop').length,
      skipped: workingCommits.filter(row => resolveStatusMeta(row.data, t).kind === 'skipped')
        .length,
      unmatched: workingCommits.filter(row => resolveStatusMeta(row.data, t).kind === 'unmatched')
        .length,
      failed: workingCommits.filter(row => resolveStatusMeta(row.data, t).kind === 'failed')
        .length,
    }
  }, [workingCommits, t])

  const conflictReportText = useMemo(
    () =>
      buildConflictReportText(
        workingCommits,
        Boolean(config.cvekit_options.enable_conflict_summary),
        t
      ),
    [workingCommits, config.cvekit_options.enable_conflict_summary, t]
  )

  const runAllPhaseLabel = useMemo(() => {
    if (!runAllProgress?.phase) return ''
    const labels: Record<string, string> = {
      initializing: t('backport.runAll.phase.initializing'),
      checking: t('backport.runAll.phase.checking'),
      applying: t('backport.runAll.phase.applying'),
      resolving: t('backport.runAll.phase.resolving'),
      waiting_for_repository: t('backport.runAll.phase.waitingForRepository'),
      skipped: t('backport.runAll.phase.skipped'),
      failed: t('backport.runAll.phase.failed'),
      completed: t('backport.runAll.phase.completed'),
      pause_requested: t('backport.runAll.phase.pauseRequested'),
      paused: t('backport.runAll.phase.paused'),
    }
    return labels[runAllProgress.phase] || runAllProgress.phase
  }, [runAllProgress, t])

  const runAllDisplayLabel = useMemo(() => {
    if (runAllPauseState === 'paused') return t('backport.runAll.displayPaused')
    if (runAllPauseState === 'pause_requested') return t('backport.runAll.displayPausing')
    return runAllPhaseLabel || t('backport.runAll.displayRunning')
  }, [runAllPauseState, runAllPhaseLabel, t])

  const runAllDisplayMessage = useMemo(() => {
    if (runAllPauseState === 'pause_requested') return t('backport.runAll.pausingMessage')
    if (runAllPauseState === 'paused') return t('backport.runAll.pausedMessage')
    return runAllProgress?.message || t('backport.runAll.processingMessage')
  }, [runAllPauseState, runAllProgress?.message, t])

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
        sourceRepository.selected_branch ||
        sourceRepository.current_branch ||
        sourceRepository.default_branch ||
        t('backport.summary.noBranchSelected')
      }`
    : t('backport.summary.sourceNotConfigured')
  const targetConfigSummary = targetRepository
    ? `${targetRepository.display_name} ${
        targetRepository.selected_branch ||
        targetRepository.current_branch ||
        targetRepository.default_branch ||
        t('backport.summary.noBranchSelected')
      }`
    : t('backport.summary.targetNotConfigured')
  const signerConfigSummary =
    config.signer_name.trim() && config.signer_email.trim()
      ? t('backport.summary.signerConfigured')
      : t('backport.summary.signerPending')
  const runtimeConfigSummary = loadingRuntimeStatus
    ? t('backport.summary.runtimeChecking')
    : runtimeStatus?.ok
      ? t('backport.summary.runtimeChecked')
      : t('backport.summary.runtimePending')
  const overallConfigSummary =
    sourceRepository &&
    targetRepository &&
    config.signer_name.trim() &&
    config.signer_email.trim() &&
    runtimeStatus?.ok
      ? t('backport.summary.configReady')
      : t('backport.summary.configIncomplete')

  return (
    <div className="h-full w-full overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.08),transparent_36%),linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,1))]">
      <div className="mx-auto max-w-7xl space-y-4 p-4">
        <div className="flex flex-col gap-3 rounded-3xl border border-slate-200/80 bg-white/85 p-5 shadow-[0_18px_60px_-28px_rgba(15,23,42,0.35)] backdrop-blur xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-2 text-blue-700">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                {t('backport.page.title')}
              </h2>
              <p className="text-sm text-slate-600">{t('backport.page.description')}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {runHistory.length > 0 ? (
              <Select
                value={activeRunId || undefined}
                onValueChange={handleSelectRun}
                disabled={running || restoringRun}
              >
                <SelectTrigger className="h-8 w-[220px] bg-white text-xs">
                  <SelectValue placeholder={t('backport.page.selectHistoryTask')} />
                </SelectTrigger>
                <SelectContent>
                  {runHistory.map(run => (
                    <SelectItem key={run.run_id} value={run.run_id}>
                      {run.display_name} · {run.status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {executionHistory.length > 0 ? (
              <Select
                value={selectedExecution || undefined}
                onValueChange={handleSelectExecution}
                disabled={running || restoringRun}
              >
                <SelectTrigger className="h-8 w-[150px] bg-white text-xs">
                  <SelectValue placeholder={t('backport.page.selectRun')} />
                </SelectTrigger>
                <SelectContent>
                  {executionHistory.map(execution => (
                    <SelectItem
                      key={execution.execution}
                      value={String(execution.execution)}
                      disabled={!execution.report_path}
                    >
                      Run #{execution.execution} · {execution.status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={handleNewTask}
              disabled={running || restoringRun}
            >
              <Plus className="mr-1 h-4 w-4" />
              {t('backport.page.newTask')}
            </Button>
            <Badge
              variant="outline"
              className={cn(
                'border-slate-200 bg-slate-50 text-slate-700',
                stage === 'completed' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                stage === 'failed' && 'border-red-200 bg-red-50 text-red-700'
              )}
            >
              {stageLabel(stage, t)}
            </Badge>
            <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
              {t('backport.page.totalCount', { count: rowSummary.total })}
            </Badge>
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
              {t('backport.page.successCount', { count: rowSummary.success })}
            </Badge>
            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
              {t('backport.page.conflictCount', { count: rowSummary.conflict })}
            </Badge>
            {rowSummary.unmatched > 0 ? (
              <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
                {t('backport.page.unmatchedCount', { count: rowSummary.unmatched })}
              </Badge>
            ) : null}
            <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
              {t('backport.page.noActionCount', { count: rowSummary.noop + rowSummary.skipped })}
            </Badge>
            <Button variant="outline" size="sm" onClick={handleResetAll}>
              <RotateCcw className="mr-1 h-4 w-4" />
              {t('backport.page.resetPage')}
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
                        <span>{t('backport.page.runAllLabel', { label: runAllDisplayLabel })}</span>
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
                    <span>
                      {t('backport.page.processedCount', {
                        count: toRunAllNumber(runAllProgress.processed_count),
                      })}
                    </span>
                    <span>
                      {t('backport.page.failedCount', {
                        count: toRunAllNumber(runAllProgress.failed_count),
                      })}
                    </span>
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
                {savingConfig ? t('backport.page.saving') : t('backport.page.saveAsTemplate')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfigExpanded(prev => !prev)}>
                {configExpanded ? (
                  <>
                    <ChevronUp className="mr-1 h-4 w-4" />
                    {t('backport.page.collapseConfig')}
                  </>
                ) : (
                  <>
                    <ChevronDown className="mr-1 h-4 w-4" />
                    {t('backport.page.expandConfig')}
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
                  <span className="text-slate-500">{t('backport.page.signerIdentity')}</span>
                  {config.signer_name.trim() && config.signer_email.trim() ? (
                    <span className="font-mono text-slate-950">
                      {config.signer_name.trim()} &lt;{config.signer_email.trim()}&gt;
                    </span>
                  ) : (
                    <span>{t('backport.page.signerRequired')}</span>
                  )}
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="ml-2 h-auto px-0 py-0 text-sm"
                    onClick={() => setSignerEditorOpen(prev => !prev)}
                  >
                    {signerEditorOpen
                      ? t('backport.page.collapse')
                      : config.signer_name.trim() && config.signer_email.trim()
                        ? t('backport.page.edit')
                        : t('backport.page.setup')}
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
                  <span className="text-slate-500">{t('backport.page.runtimeStatus')}</span>
                  {loadingRuntimeStatus ? (
                    <span>{t('backport.page.runtimeChecking')}</span>
                  ) : runtimeStatus?.ok ? (
                    <>
                      <span className="mx-1 inline-block h-1.5 w-1.5 rounded-full bg-slate-950 align-middle" />
                      <span>{t('backport.page.runtimeChecked')}</span>
                      <span className="ml-2 text-xs text-slate-500">
                        {t('backport.page.runtimeModelInfo', {
                          model:
                            runtimeStatus.model_name ||
                            selectedBackportModel?.name ||
                            t('backport.page.modelConfigured'),
                        })}
                      </span>
                    </>
                  ) : (
                    <span>
                      {runtimeStatus?.errors[0] || t('backport.page.runtimeSetupHint')}
                    </span>
                  )}

                  {compatibleBackportModels.length > 0 ? (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="ml-2 h-auto px-0 py-0 text-sm"
                      onClick={() => setRuntimeModelSelectorOpen(prev => !prev)}
                    >
                      {runtimeModelSelectorOpen
                        ? t('backport.page.collapse')
                        : t('backport.page.switchModel')}
                    </Button>
                  ) : null}
                  {!runtimeStatus?.ok ? (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="ml-2 h-auto px-0 py-0 text-sm"
                      onClick={openModelSettings}
                    >
                      {t('backport.page.goModelSettings')}
                    </Button>
                  ) : null}
                  {!runtimeStatus?.ok && !loadingRuntimeStatus ? (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="ml-2 h-auto px-0 py-0 text-sm"
                      onClick={() => void loadRuntimeStatus(config)}
                      disabled={loadingRuntimeStatus}
                    >
                      {t('backport.page.recheck')}
                    </Button>
                  ) : null}
                </div>
              </div>

              {signerEditorOpen ? (
                <div className="grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-2">
                  <Input
                    value={config.signer_name}
                    onChange={e => setConfig(prev => ({ ...prev, signer_name: e.target.value }))}
                    placeholder={t('backport.page.signerNamePlaceholder')}
                    className="h-8 bg-white text-xs"
                    disabled={running || loadingConfig}
                  />
                  <Input
                    type="email"
                    value={config.signer_email}
                    onChange={e => setConfig(prev => ({ ...prev, signer_email: e.target.value }))}
                    placeholder={t('backport.page.signerEmailPlaceholder')}
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
                      <SelectValue
                        placeholder={
                          loadingModels
                            ? t('backport.page.loadingModels')
                            : t('backport.page.selectModel')
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={BACKPORT_MODEL_EMPTY_VALUE}>
                        {t('backport.page.modelNotSelected')}
                      </SelectItem>
                      {compatibleBackportModels.map(model => (
                        <SelectItem key={model.id} value={model.id}>
                          {formatBackportModelLabel(model, t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="truncate text-xs text-slate-500">
                    {selectedBackportModel?.apiBaseUrl || t('backport.page.modelDefaultApiBase')}
                  </div>
                </div>
              ) : null}
            </div>
          }
          onAddRepository={role => openRepositoryDialog(role, 'add')}
          onSelectRecentRepository={role => openRepositoryDialog(role, 'recent')}
          onRefreshRepository={role => void handleRefreshRepository(role)}
          onBranchChange={handleRepositoryBranchChange}
        >
          <div className="space-y-0">
            <section className="grid gap-3 py-4 lg:grid-cols-[140px_minmax(0,1fr)]">
              <div>
                <h4 className="text-sm font-medium text-slate-900">
                  {t('backport.config.commitSource.title')}
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('backport.config.commitSource.description')}
                </p>
              </div>
              <div className="space-y-2">
                <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)]">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {t('backport.config.commitSource.ruleLabel')}
                    </p>
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
                        <SelectValue placeholder={t('backport.config.commitSource.autoDetect')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">
                          {t('backport.config.commitSource.autoDetect')}
                        </SelectItem>
                        <SelectItem value="openEuler">
                          {t('backport.config.commitSource.allOpenEuler')}
                        </SelectItem>
                        <SelectItem value="upstream">
                          {t('backport.config.commitSource.allUpstream')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {config.commit_message_source === 'auto' ? (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">
                        {t('backport.config.commitSource.linuxUpstreamRepo')}
                      </p>
                      <Input
                        value={config.linux_repo_path}
                        onChange={e =>
                          setConfig(prev => ({ ...prev, linux_repo_path: e.target.value }))
                        }
                        className="font-mono text-xs"
                        placeholder={t('backport.config.commitSource.linuxRepoPlaceholder')}
                        disabled={running || loadingConfig}
                      />
                    </div>
                  ) : (
                    <div className="flex min-h-9 items-end pb-1 text-xs leading-5 text-muted-foreground">
                      {t('backport.config.commitSource.directWriteHint', {
                        source: config.commit_message_source,
                      })}
                    </div>
                  )}
                </div>
                {config.commit_message_source === 'auto' ? (
                  <p className="text-xs leading-5 text-muted-foreground">
                    {t('backport.config.commitSource.autoDetectHint')}
                  </p>
                ) : null}
              </div>
            </section>

            <section className="grid gap-3 border-t border-slate-100 py-4 lg:grid-cols-[140px_minmax(0,1fr)]">
              <div>
                <h4 className="text-sm font-medium text-slate-900">
                  {t('backport.config.targetLayout.title')}
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('backport.config.targetLayout.description')}
                </p>
              </div>
              <div className="space-y-3">
                <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {t('backport.config.targetLayout.layoutType')}
                    </p>
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
                        <SelectItem value="none">
                          {t('backport.config.targetLayout.disabled')}
                        </SelectItem>
                        <SelectItem value="anolis">
                          {t('backport.config.targetLayout.anolisSplit')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {t('backport.config.targetLayout.defaultLevel')}
                    </p>
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
                      disabled={
                        running || loadingConfig || config.target_config_layout !== 'anolis'
                      }
                    >
                      <SelectTrigger className="h-9 bg-white text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="L0-MANDATORY">L0-MANDATORY</SelectItem>
                        <SelectItem value="L1-RECOMMEND">
                          {t('backport.config.targetLayout.levelRecommend')}
                        </SelectItem>
                        <SelectItem value="L2-OPTIONAL">L2-OPTIONAL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  {t('backport.config.targetLayout.anolisHint')}
                </p>
              </div>
            </section>

            <section className="space-y-3 border-t border-slate-100 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-medium text-slate-900">
                    {t('backport.config.template.title')}
                  </h4>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                    {[
                      '{{subject}}',
                      '{{commit_id}}',
                      '{{source}}',
                      '{{body_prefix}}',
                      '{{body_separator}}',
                      '{{body}}',
                      '{{trailers}}',
                    ].map(item => (
                      <span
                        key={item}
                        className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px]"
                      >
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
                  {t('backport.config.template.restoreDefault')}
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
              <p className="text-xs leading-5 text-muted-foreground">
                {t('backport.config.template.hint', {
                  bodyPrefix: '{{body_prefix}}',
                  bodySeparator: '{{body_separator}}',
                  body: '{{body}}',
                  source: '{{source}}',
                })}
              </p>
            </section>

            <section className="grid gap-3 border-t border-slate-100 py-4 lg:grid-cols-[140px_minmax(0,1fr)]">
              <div>
                <h4 className="text-sm font-medium text-slate-900">
                  {t('backport.config.options.title')}
                </h4>
              </div>
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-900">
                      {t('backport.config.options.conflictSummary')}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {t('backport.config.options.conflictSummaryHint')}
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
                    aria-label={t('backport.config.options.conflictSummary')}
                  />
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-900">
                      {t('backport.config.options.prerequisiteScan')}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {t('backport.config.options.prerequisiteScanHint')}
                    </p>
                  </div>
                  <Switch
                    checked={Boolean(config.enable_prerequisite_scan)}
                    onCheckedChange={checked => {
                      setConfig(prev => ({ ...prev, enable_prerequisite_scan: checked }))
                      if (!checked) {
                        setPrereqManifest(null)
                        setPrereqSelected([])
                        setPrereqReviewed(false)
                        setPrereqGeneratedReportPath('')
                        setPrereqOnly(false)
                      }
                    }}
                    disabled={running || loadingConfig}
                    aria-label={t('backport.config.options.prerequisiteScan')}
                  />
                </div>
              </div>
            </section>
          </div>
        </RepositoryAccessPanel>

        {prereqEnabled && prereqManifest && !prereqReviewed ? (
          <PrerequisiteReviewPanel
            manifest={prereqManifest}
            initialSelected={prereqSelected}
            rescanning={prereqRescanning}
            onCancel={handlePrereqCancel}
            onConfirm={handlePrereqConfirm}
            onRescan={() => void handlePrereqRescan()}
          />
        ) : null}

        <CommitTable
          excelPath={excelPath}
          onExcelPathChange={value => {
            if (value !== excelPath) {
              setCommitEntries([])
              setPrereqReviewed(false)
              setPrereqManifest(null)
              setPrereqSelected([])
              setPrereqGeneratedReportPath('')
              setPrereqOnly(false)
            }
            setExcelPath(value)
          }}
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
          hasCommitEntries={commitEntries.length > 0}
          onOpenCommitImport={() => setCommitImportOpen(true)}
          onDownloadCommitCsv={
            activeRunId && commitEntries.length > 0
              ? () => void handleDownloadCommitCsv()
              : undefined
          }
          onOpenPathBrowser={openPathBrowser}
          onGenerateReport={handleGenerateReport}
          generateReportLabel={
            prereqEnabled
              ? prereqReviewed
                ? t('backport.button.generateReport')
                : commitEntries.length > 0
                  ? t('backport.operation.importCommitsFindPrereqs')
                  : t('backport.operation.importExcelFindPrereqs')
              : activeRunId
                ? t('backport.button.importExcelNewVersion')
                : commitEntries.length > 0
                  ? t('backport.button.importCommitsGenerateReport')
                  : t('backport.button.importExcelGenerateReport')
          }
          prereqOnly={prereqOnly}
          onPrereqOnlyChange={setPrereqOnly}
          onRunAll={handleRunAll}
          runAllIdleLabel={
            stage === 'completed'
              ? t('backport.button.rerunFromCurrentRepo')
              : t('backport.operation.runAll')
          }
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
            <div className="whitespace-pre-line rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <SupportPanel
            supportTab={supportTab}
            onSupportTabChange={setSupportTab}
            targetPath={config.target_path}
            running={running}
            timeline={timeline}
            executionSummary={executionSummary}
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
        attemptHistory={attemptHistory}
        attemptHistoryLoading={attemptHistoryLoading}
        onCheckManualPatch={() => void handleCheckManualPatch()}
        onApplyManualPatch={() => void handleApplyManualPatch()}
        onUpdateMergedInTarget={updateMergedInTarget}
        onCopyText={(text, label) => void handleCopyText(text, label)}
        onDownloadPatch={handleDownloadPatch}
        onLoadPatchPreview={loadPatchPreview}
        commitMessagePreviewLoading={commitMessagePreviewLoadingRowId === inspectedRow?.rowId}
        onRefreshCommitMessagePreview={row => void handleRefreshCommitMessagePreview(row)}
      />

      <Dialog
        open={repositoryDialogRole !== null}
        onOpenChange={open => !open && closeRepositoryDialog()}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {repositoryMode === 'recent'
                ? t('backport.repository.dialog.selectRecentTitle', {
                    role:
                      repositoryDialogRole === 'source'
                        ? t('backport.repository.role.source')
                        : t('backport.repository.role.target'),
                  })
                : t('backport.repository.dialog.addTitle', {
                    role:
                      repositoryDialogRole === 'source'
                        ? t('backport.repository.role.source')
                        : t('backport.repository.role.target'),
                  })}
            </DialogTitle>
            <DialogDescription>
              {repositoryMode === 'recent'
                ? t('backport.repository.dialog.selectRecentDescription')
                : t('backport.repository.dialog.addDescription')}
            </DialogDescription>
          </DialogHeader>

          {repositoryMode === 'recent' ? (
            <div className="max-h-[420px] overflow-auto rounded-lg border border-slate-200">
              {recentRepositories.filter(item => item.role === repositoryDialogRole).length ===
              0 ? (
                <div className="px-3 py-10 text-center text-sm text-slate-500">
                  {t('backport.repository.dialog.noRecent', {
                    role:
                      repositoryDialogRole === 'source'
                        ? t('backport.repository.role.source')
                        : t('backport.repository.role.target'),
                  })}
                </div>
              ) : (
                <div className="divide-y">
                  {recentRepositories
                    .filter(item => item.role === repositoryDialogRole)
                    .map(repository => (
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
                            {repository.selected_branch ||
                              repository.default_branch ||
                              t('backport.repository.dialog.branchNotSet')}
                          </div>
                        </div>
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {repository.input_type === 'remote'
                            ? t('backport.repository.dialog.remote')
                            : t('backport.repository.dialog.local')}
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
                  onChange={event => setRepositoryInput(event.target.value)}
                  placeholder={t('backport.repository.dialog.inputPlaceholder')}
                  className="font-mono text-xs"
                  disabled={repositoryPrepareTask?.status === 'running'}
                />
                <div className="text-xs text-slate-500">
                  {repositoryInput.trim()
                    ? /^(https?:\/\/|ssh:\/\/|git:\/\/|[^@\s]+@[^:\s]+:)/.test(
                        repositoryInput.trim()
                      )
                      ? t('backport.repository.dialog.detectedRemote')
                      : t('backport.repository.dialog.detectedLocalPath')
                    : t('backport.repository.dialog.inputHint')}
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
                        : 'border-blue-200 bg-blue-50'
                  )}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {repositoryPrepareTask.status === 'running' ? (
                      <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                    ) : null}
                    <span>
                      {repositoryPrepareTask.status === 'failed'
                        ? t('backport.repository.dialog.prepareStatusFailed')
                        : repositoryPrepareTask.status === 'success'
                          ? t('backport.repository.dialog.prepareStatusSuccess')
                          : t('backport.repository.dialog.prepareStatusRunning')}
                    </span>
                    <span className="ml-auto font-mono text-xs">
                      {repositoryPrepareTask.progress}%
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/80">
                    <div
                      className="h-full bg-blue-600 transition-all"
                      style={{ width: `${repositoryPrepareTask.progress || 8}%` }}
                    />
                  </div>
                  {repositoryPrepareTask.error ? (
                    <div className="mt-2 text-xs leading-5 text-red-700">
                      {repositoryPrepareTask.error}
                    </div>
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
            <Button
              type="button"
              variant="outline"
              onClick={closeRepositoryDialog}
              disabled={repositoryPrepareTask?.status === 'running'}
            >
              {t('common:action.close')}
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
                {t('backport.repository.dialog.detectAndPrepare')}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CommitImportDialog
        open={commitImportOpen}
        onOpenChange={setCommitImportOpen}
        onConfirm={entries => {
          const rows = normalizeCommitRows(entries)
          setCommitEntries(entries)
          setActiveRunId('')
          setExcelPath('')
          setConfig(prev => ({ ...prev, current_excel_path: '' }))
          setOriginalCommits(rows)
          setWorkingCommits(rows)
          setBaseReportPath('')
          setFilteredReportPath('')
          setPrereqManifest(null)
          setPrereqSelected([])
          setPrereqReviewed(false)
          setPrereqGeneratedReportPath('')
          setPrereqOnly(false)
          toast({
            title: t('backport.toast.commitListUpdated'),
            description: t('backport.toast.commitListUpdatedDesc', { count: entries.length }),
          })
        }}
      />

      <Dialog open={pathBrowserOpen} onOpenChange={setPathBrowserOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('backport.pathBrowser.title')}</DialogTitle>
            <DialogDescription>{t('backport.pathBrowser.description')}</DialogDescription>
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
                {browseLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : t('backport.pathBrowser.open')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => browseParentPath && loadBrowsePath(browseParentPath)}
                disabled={browseLoading || !browseParentPath}
              >
                {t('backport.pathBrowser.parentDir')}
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
                          {entry.is_dir
                            ? t('backport.pathBrowser.dir')
                            : isExcel
                              ? 'Excel'
                              : t('backport.pathBrowser.file')}
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
              {t('common:action.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
