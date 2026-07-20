export type BackportStage =
  | 'idle'
  | 'config_generated'
  | 'report_generated'
  | 'interactive_editing'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'paused'

export type BackportTargetConfigLayout = 'none' | 'anolis'

export type BackportTargetConfigDefaultLevel = 'L0-MANDATORY' | 'L1-RECOMMEND' | 'L2-OPTIONAL'

export interface BackportTargetConfigLayoutOptions {
  default_level: BackportTargetConfigDefaultLevel
}

export interface BackportConfig {
  project_url: string
  backport_model_id: string
  project_dir: string
  source_branch: string
  target_path: string
  target_release: string
  target_config_layout: BackportTargetConfigLayout
  target_config_layout_opts: BackportTargetConfigLayoutOptions
  patch_dataset_dir: string
  signer_name: string
  signer_email: string
  commit_message_template: string
  commit_message_source: 'auto' | 'openEuler' | 'upstream'
  linux_repo_path: string
  commit_sort: string
  current_excel_path: string
  current_report_path: string
  current_filtered_report_path: string
  source_repo_input?: string
  target_repo_input?: string
  source_repo_state?: BackportRepositoryInfo | null
  target_repo_state?: BackportRepositoryInfo | null
  cvekit_options: Record<string, unknown>
}

export interface BackportConfigUpdateResponse {
  ok: boolean
  config_path?: string
}

export interface BackportRuntimeStatus {
  ok: boolean
  model_configured: boolean
  model_name: string
  model_provider: string
  api_key_available: boolean
  cvekit_available: boolean
  cvekit_path: string
  errors: string[]
}

export type BackportRepositoryRole = 'source' | 'target'

export interface BackportRepositoryInfo {
  role: BackportRepositoryRole
  input: string
  input_type: 'remote' | 'local'
  display_name: string
  source_url: string
  local_path: string
  default_branch: string
  selected_branch: string
  current_branch: string
  head: string
  short_head: string
  local_branches: string[]
  remote_branches: string[]
  status_clean: boolean
  operation_in_progress: boolean
  writable: boolean
  can_read: boolean
  can_write: boolean
  warnings: string[]
  cache_dir: string
  updated_at: number
}

export interface BackportRepositoryPrepareResponse {
  task_id: string
  status: 'running' | 'success' | 'failed'
  role: BackportRepositoryRole
  input: string
  progress: number
  steps: Array<{ title: string; status: string; detail?: string }>
  result: BackportRepositoryInfo | null
  error: string
}

export interface BackportRecentRepositoriesResponse {
  repositories: BackportRepositoryInfo[]
}

export interface BackportBrowseEntry {
  name: string
  path: string
  is_dir: boolean
}

export interface BackportBrowseResponse {
  current_path: string
  parent_path?: string | null
  entries: BackportBrowseEntry[]
}

export interface BackportCommitItem {
  [key: string]: unknown
}

export interface BackportCommitRow {
  rowId: string
  data: BackportCommitItem
}

export type BackportPatchKind = 'original' | 'current' | 'backported'

export interface BackportPatchDescriptor {
  exists: boolean
  file_name: string
}

export interface BackportPatchMap {
  original?: BackportPatchDescriptor
  current?: BackportPatchDescriptor
  backported?: BackportPatchDescriptor
}

export interface BackportPatchResource {
  kind: BackportPatchKind
  label: string
  exists: boolean
  fileId: string
  fileName: string
}

export interface BackportPatchPreviewResponse {
  kind: BackportPatchKind
  file_name: string
  patch_text: string
  size_bytes: number
}

export interface BackportGitLogEntry {
  hash: string
  shortHash: string
  refs: string
  subject: string
  committedAt: string
}

export interface BackportTimelineEntry {
  id: string
  timestamp: number
  level: 'info' | 'success' | 'error'
  title: string
  details?: string
}

export type BackportSaveSource = 'selected' | 'filtered' | 'all'

export interface BackportToolSnapshot {
  tool_name: string
  arguments_text: string
  response_text: string
  is_error: boolean
}

export interface BackportOperationArtifacts {
  run_dir?: string
  config_path?: string
  base_config_path?: string
  report_path?: string
  base_report_path?: string
  filtered_report_path?: string
}

export interface BackportOperationDiagnostics {
  error_text?: string
  last_tool?: BackportToolSnapshot | null
}

export interface BackportCommitMessagePreview {
  message: string
  context: Record<string, unknown>
  source_detection: Record<string, unknown>
  warnings: string[]
}

export interface BackportManualPatchResult {
  returncode: string
  stdout: string
  stderr: string
}

export interface BackportOperationResultData {
  operation: string
  status: 'success' | 'failed'
  stage?: BackportStage
  summary?: string
  artifacts?: BackportOperationArtifacts
  report?: {
    report_path?: string
    commit_count?: number
    commits?: BackportCommitItem[]
    raw?: Record<string, unknown> | null
  }
  git?: {
    entries?: BackportGitLogEntry[]
    revision?: string | null
    show_content?: string
  }
  patch?: BackportPatchPreviewResponse
  commit_message?: BackportCommitMessagePreview
  manual_patch?: BackportManualPatchResult
  diagnostics?: BackportOperationDiagnostics
}

export interface BackportRunResponse {
  agentId: string
  agentName: string
  sessionId: string
  assistantText: string
  parsedResult: BackportOperationResultData | null
  toolSnapshots: BackportToolSnapshot[]
}

export interface BackportRunProgress {
  phase?: string
  message?: string
  current_report_path?: string
  current_index?: number
  total?: number
  current_commit?: string
  current_title?: string
  current_row_id?: string
  processed_count?: number
  failed_count?: number
  updated_commits?: BackportCommitItem[]
  conflict_report_summary?: Record<string, unknown>
}

export interface BackportAsyncRunResponse {
  run_id: string
  action: string
  status: 'running' | 'success' | 'failed'
  result: BackportRunResponse | null
  error: string
  progress?: BackportRunProgress | null
  pause_requested?: boolean
  paused_at?: number | null
}

export interface BackportRunAllControl {
  runId: string
  pause: () => Promise<BackportAsyncRunResponse>
}

export interface BackportRunAllLifecycle {
  onRunCreated?: (control: BackportRunAllControl) => void
  onRunUpdated?: (run: BackportAsyncRunResponse) => void
}

export type BackportRunAllPauseState = 'idle' | 'running' | 'pause_requested' | 'paused'

export interface BackportRunAllUiState {
  pauseState: BackportRunAllPauseState
  progress: BackportRunProgress | null
  control: BackportRunAllControl | null
  rowStartedAt: Record<string, number>
  lastProcessedCount: number
  reportRefreshInFlight: boolean
  pendingReportRefreshPath: string | null
  statusCardVisible: boolean
}

export function resetRunAllStateForGeneratedReport(
  _state: BackportRunAllUiState
): BackportRunAllUiState {
  return {
    pauseState: 'idle',
    progress: null,
    control: null,
    rowStartedAt: {},
    lastProcessedCount: 0,
    reportRefreshInFlight: false,
    pendingReportRefreshPath: null,
    statusCardVisible: false,
  }
}

export interface BackportGenerateReportRequest {
  config: BackportConfig
  excelPath: string
}

export interface BackportLoadReportRequest {
  config: BackportConfig
  baseReportPath: string
}

export interface BackportRunAllRequest {
  config: BackportConfig
  excelPath: string
  baseReportPath?: string
  workingReportPath?: string
}

export interface BackportLoadGitLogRequest {
  config: BackportConfig
}

export interface BackportLoadGitShowRequest {
  config: BackportConfig
  revision: string
}

export interface BackportLoadPatchPreviewRequest {
  baseReportPath: string
  workingReportPath?: string
  row: BackportCommitItem
  kind: BackportPatchKind
}

export interface BackportExecuteRequest {
  config: BackportConfig
  baseReportPath: string
  workingReportPath?: string
  selectedCommits: BackportCommitItem[]
  source: BackportSaveSource
}

export interface BackportApplyRowRequest {
  config: BackportConfig
  baseReportPath: string
  workingReportPath?: string
  row: BackportCommitItem
}

export interface BackportContinueReportRequest {
  config: BackportConfig
  baseReportPath: string
}

export interface BackportRecheckConflictRequest {
  config: BackportConfig
  baseReportPath: string
  workingReportPath?: string
  row: BackportCommitItem
}

export interface BackportTryResolveRequest {
  config: BackportConfig
  baseReportPath: string
  workingReportPath?: string
  row: BackportCommitItem
}

export interface BackportCommitMessagePreviewRequest {
  config: BackportConfig
  baseReportPath: string
  workingReportPath?: string
  row: BackportCommitItem
  commitMessageTemplate?: string
}

export interface BackportManualPatchRequest {
  config: BackportConfig
  patchText: string
}
