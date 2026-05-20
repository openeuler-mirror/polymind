export type BackportStage =
  | 'idle'
  | 'config_generated'
  | 'report_generated'
  | 'interactive_editing'
  | 'executing'
  | 'completed'
  | 'failed'

export interface BackportConfig {
  project_url: string
  project_dir: string
  source_branch: string
  target_path: string
  target_release: string
  patch_dataset_dir: string
  signer_name: string
  signer_email: string
  current_excel_path: string
  current_report_path: string
  current_filtered_report_path: string
}

export interface BackportConfigUpdateResponse {
  ok: boolean
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

export interface BackportGenerateReportRequest {
  config: BackportConfig
  excelPath: string
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

export interface BackportManualPatchRequest {
  config: BackportConfig
  patchText: string
}

export interface BackportRefreshReportRequest {
  config: BackportConfig
  baseReportPath: string
}
