import type { TFunction } from 'i18next'

import i18n from '@/lib/i18n/config'
import type {
  BackportCommitItem,
  BackportCommitRow,
  BackportConfig,
  BackportOperationDiagnostics,
  BackportPatchKind,
  BackportPatchMap,
  BackportPatchPreviewResponse,
  BackportPatchResource,
  BackportRunSummaryCase,
  BackportStage,
} from '@/lib/backport-types'
import type { ModelConfig } from '@/lib/types'

const resolveBackportTranslator = (t?: TFunction): TFunction =>
  (t ?? i18n.getFixedT(null, 'tool-panel')) as TFunction

/** Stable identifiers for long-running operations, used for state comparison across components. */
export const BACKPORT_OPERATION_IDS = {
  importCommitsFindPrereqs: 'import_commits_find_prereqs',
  importExcelFindPrereqs: 'import_excel_find_prereqs',
  generateConfigAndReport: 'generate_config_and_report',
  generateExecutionReport: 'generate_execution_report',
  regenerateExecutionReport: 'regenerate_execution_report',
  runAll: 'run_all',
  continueCheck: 'continue_check',
  refreshGitLog: 'refresh_git_log',
  readGitShow: 'read_git_show',
  executeSelected: 'execute_selected',
  applySingleCommit: 'apply_single_commit',
  resolveConflictRow: 'resolve_conflict_row',
  recheckConflict: 'recheck_conflict',
  resumeRun: 'resume_run',
} as const

export type BackportOperationId =
  (typeof BACKPORT_OPERATION_IDS)[keyof typeof BACKPORT_OPERATION_IDS]

export interface BackportModelResolution {
  modelId: string
  repaired: boolean
  shouldOpenSelector: boolean
}

const TARGET_REPOSITORY_LOCK_TIMEOUT = 'TARGET_REPOSITORY_LOCK_TIMEOUT'

export const DEFAULT_COMMIT_MESSAGE_TEMPLATE = `{{subject}}

{{body_prefix}}

commit {{commit_id}} {{source}}
{{body_separator}}

{{body}}

{{trailers}}`

export const DEFAULT_BACKPORT_CONFIG: BackportConfig = {
  project_url: '',
  backport_model_id: '',
  project_dir: '',
  source_branch: '',
  target_path: '',
  target_release: '',
  target_config_layout: 'none',
  target_config_layout_opts: {
    default_level: 'L1-RECOMMEND',
  },
  patch_dataset_dir: '~/patched_output',
  signer_name: '',
  signer_email: '',
  commit_message_template: DEFAULT_COMMIT_MESSAGE_TEMPLATE,
  commit_message_source: 'upstream',
  linux_repo_path: '~/Image/linux',
  commit_sort: 'describe',
  current_excel_path: '',
  current_report_path: '',
  current_filtered_report_path: '',
  source_repo_input: '',
  target_repo_input: '',
  source_repo_state: null,
  target_repo_state: null,
  enable_prerequisite_scan: false,
  cvekit_options: {},
}

export function resolveBackportModelReference(
  savedModelId: string,
  compatibleModels: readonly ModelConfig[]
): BackportModelResolution {
  const normalizedModelId = savedModelId.trim()
  const configuredModelExists = compatibleModels.some(model => model.id === normalizedModelId)
  if (configuredModelExists) {
    return {
      modelId: normalizedModelId,
      repaired: false,
      shouldOpenSelector: false,
    }
  }

  const fallbackModel =
    compatibleModels.find(model => model.isDefault) ||
    (compatibleModels.length === 1 ? compatibleModels[0] : null)
  const repaired = Boolean(normalizedModelId)

  return {
    modelId: fallbackModel?.id || '',
    repaired,
    shouldOpenSelector: repaired && !fallbackModel && compatibleModels.length > 1,
  }
}

export type RowStatusKind =
  | 'success'
  | 'failed'
  | 'conflict'
  | 'noop'
  | 'skipped'
  | 'unmatched'
  | 'pending'

export function resolveBackportFailureMessage(
  diagnostics: BackportOperationDiagnostics | null | undefined,
  fallback: string,
  t?: TFunction
): string {
  const translate = resolveBackportTranslator(t)
  if (
    diagnostics?.code === TARGET_REPOSITORY_LOCK_TIMEOUT &&
    diagnostics.retryable === true
  ) {
    const waitText =
      typeof diagnostics.wait_seconds === 'number'
        ? translate('backport.error.lockTimeoutWait', {
            seconds: Math.round(diagnostics.wait_seconds),
          })
        : ''
    return translate('backport.error.lockTimeout', { waitText })
  }
  return fallback || diagnostics?.error_text || translate('backport.error.executionFailed')
}

export function resolveRunSummaryDetectionText(
  item: BackportRunSummaryCase,
  t?: TFunction
): string {
  const translate = resolveBackportTranslator(t)
  if (item.detection.state === 'running') return translate('backport.runSummary.detection.running')
  if (item.detection.state === 'not_started')
    return translate('backport.runSummary.detection.notStarted')
  switch (item.detection.result) {
    case 'clean_apply':
      return translate('backport.runSummary.detection.cleanApply')
    case 'conflict':
      return translate('backport.runSummary.detection.conflict')
    case 'equivalent_exists':
      return translate('backport.runSummary.detection.equivalentExists')
    case 'already_present':
      return translate('backport.runSummary.detection.alreadyPresent')
    default:
      return translate('backport.runSummary.detection.failed')
  }
}

export function resolveRunSummaryFinalText(item: BackportRunSummaryCase, t?: TFunction): string {
  const translate = resolveBackportTranslator(t)
  if (item.final.state === 'running') return translate('backport.runSummary.final.running')
  if (item.final.result === 'applied') {
    return item.final.applied_commit
      ? translate('backport.runSummary.final.appliedWithCommit', {
          commit: item.final.applied_commit.slice(0, 12),
        })
      : translate('backport.runSummary.final.applied')
  }
  if (item.final.result === 'skipped') return translate('backport.runSummary.final.skipped')
  if (item.final.result === 'ready_to_apply')
    return translate('backport.runSummary.final.readyToApply')
  if (item.final.result === 'failed') return translate('backport.runSummary.final.failed')
  return translate('backport.runSummary.final.unfinished')
}

const RELEVANT_PATCH_HUNK_CHAR_LIMIT = 1600

export type BackportConflictAnalysisPatch = {
  resource: BackportPatchResource
  response?: BackportPatchPreviewResponse
  error?: string
}

export function normalizeBackportConfig(config: Partial<BackportConfig>): BackportConfig {
  const legacyConfig = config as Partial<BackportConfig> & { enable_conflict_summary?: boolean }
  const cvekitOptions = {
    ...(config.cvekit_options || {}),
  }
  if (
    typeof legacyConfig.enable_conflict_summary === 'boolean' &&
    typeof cvekitOptions.enable_conflict_summary === 'undefined'
  ) {
    cvekitOptions.enable_conflict_summary = legacyConfig.enable_conflict_summary
  }
  const normalized = {
    ...DEFAULT_BACKPORT_CONFIG,
    ...config,
    cvekit_options: cvekitOptions,
    target_config_layout_opts: {
      ...DEFAULT_BACKPORT_CONFIG.target_config_layout_opts,
      ...config.target_config_layout_opts,
    },
  }
  if (normalized.target_config_layout !== 'anolis') {
    normalized.target_config_layout = 'none'
  }
  if (
    !['L0-MANDATORY', 'L1-RECOMMEND', 'L2-OPTIONAL'].includes(
      normalized.target_config_layout_opts.default_level
    )
  ) {
    normalized.target_config_layout_opts.default_level = 'L1-RECOMMEND'
  }
  if (!normalized.commit_message_template.trim()) {
    normalized.commit_message_template = DEFAULT_COMMIT_MESSAGE_TEMPLATE
  }
  if (!['auto', 'openEuler', 'upstream'].includes(normalized.commit_message_source)) {
    normalized.commit_message_source = 'upstream'
  }
  return normalized
}

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function resolveCommitTitle(item: BackportCommitItem): string {
  return stringifyValue(
    item.commit_title ||
      item.title ||
      item.subject ||
      item.summary ||
      item.message ||
      item.commit_message ||
      item.commit_subject ||
      ''
  ).trim()
}

function conflictReportStatusLabel(status: string, t?: TFunction): string {
  const translate = resolveBackportTranslator(t)
  const normalized = status.trim().toLowerCase()
  const labels: Record<string, string> = {
    success: translate('backport.conflictReport.status.success'),
    failed: translate('backport.conflictReport.status.failed'),
    skipped: translate('backport.conflictReport.status.skipped'),
    pending: translate('backport.conflictReport.status.pending'),
  }
  return labels[normalized] || status || translate('backport.common.unknown')
}

export function buildConflictReportText(
  rows: BackportCommitRow[],
  enabled: boolean,
  t?: TFunction
): string {
  const translate = resolveBackportTranslator(t)
  if (!enabled) return ''

  const sections = rows
    .map(row => {
      const commit = stringifyValue(row.data.commit || row.data.input_commit).trim()
      const shortCommit = commit
        ? commit.slice(0, 12)
        : translate('backport.conflictReport.unknownCommit')
      const title = resolveCommitTitle(row.data)
      const heading = `${shortCommit}${title ? ` ${title}` : ''}`
      const engine = stringifyValue(row.data.backport_engine).trim().toLowerCase()

      if (engine === 'opencode') {
        const explanation = stringifyValue(row.data.backport_explanation).trim()
        const error = stringifyValue(row.data.error).trim()
        if (!explanation && !error) return ''

        const status = stringifyValue(row.data.status).trim().toLowerCase()
        const statusLabel =
          status === 'failed'
            ? translate('backport.conflictReport.status.failed')
            : Boolean(row.data.equivalent_exists)
              ? translate('backport.conflictReport.equivalentInTarget')
              : translate('backport.conflictReport.backportPatchGenerated')
        const lines = [heading, '', translate('backport.conflictReport.statusLine', { status: statusLabel })]
        if (explanation)
          lines.push('', translate('backport.conflictReport.migrationNotes'), explanation)
        if (status === 'failed' && error)
          lines.push('', translate('backport.conflictReport.errorLine', { error }))
        return lines.join('\n')
      }

      const summary = row.data.conflict_summary
      if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return ''

      const summaryData = summary as Record<string, unknown>
      const status = stringifyValue(summaryData.status).trim()
      const normalizedStatus = status.toLowerCase()
      const score = stringifyValue(summaryData.score).trim()
      const reason = stringifyValue(summaryData.reason).trim()
      const error = stringifyValue(summaryData.error).trim()

      if (normalizedStatus === 'success') {
        return [
          heading,
          '',
          translate('backport.conflictReport.scoreLine', { score: score || '-' }),
          '',
          translate('backport.conflictReport.reason'),
          reason || translate('backport.conflictReport.noReason'),
        ].join('\n')
      }

      const lines = [
        heading,
        '',
        translate('backport.conflictReport.statusLine', {
          status: conflictReportStatusLabel(status, translate),
        }),
      ]
      if (error || normalizedStatus === 'failed') {
        lines.push(
          '',
          translate('backport.conflictReport.errorLine', {
            error: error || translate('backport.conflictReport.noError'),
          })
        )
      }
      if (reason) lines.push('', translate('backport.conflictReport.reason'), reason)
      return lines.join('\n')
    })
    .filter(Boolean)

  return sections.map((section, index) => `## ${index + 1}. ${section}`).join('\n\n')
}

function fileNameFromPath(path: string): string {
  const segments = path.split('/').filter(Boolean)
  return segments[segments.length - 1] || ''
}

export function normalizeCommitRows(commits: BackportCommitItem[]): BackportCommitRow[] {
  return commits.map((item, index) => {
    const normalized = typeof item === 'object' && item !== null ? deepClone(item) : {}
    const commit = stringifyValue(normalized['commit'] || normalized['input_commit'] || '')
    const title = resolveCommitTitle(normalized)
    return {
      rowId: `${commit || 'commit'}::${title || 'title'}::${index}::${Date.now()}`,
      data: normalized,
    }
  })
}

function resolveCommitIdentity(item: BackportCommitItem): string {
  const candidates = [
    item.row_id,
    item.commit,
    item.input_commit,
    item.original_patch_path,
    item.patch_path,
    item.backported_patch_path,
  ]

  for (const candidate of candidates) {
    const value = stringifyValue(candidate).trim().toLowerCase()
    if (value) return value
  }

  return ''
}

export function mergeCommitRows(
  baseRows: BackportCommitRow[],
  updatedCommits: BackportCommitItem[]
): BackportCommitRow[] {
  const updatesById = new Map<string, BackportCommitItem>()
  const unmatched: BackportCommitItem[] = []

  for (const commit of updatedCommits) {
    const identity = resolveCommitIdentity(commit)
    if (identity) {
      updatesById.set(identity, deepClone(commit))
    } else {
      unmatched.push(deepClone(commit))
    }
  }

  const nextRows = baseRows.map(row => {
    const identity = resolveCommitIdentity(row.data)
    if (!identity) return row

    const update = updatesById.get(identity)
    if (!update) return row

    updatesById.delete(identity)
    const baseData = deepClone(row.data)
    const updateData = deepClone(update)
    const basePatches = (baseData.patches as BackportPatchMap | undefined) || {}
    const updatePatches = (updateData.patches as BackportPatchMap | undefined) || {}
    const mergedPatches = {
      ...basePatches,
      ...updatePatches,
      backported:
        basePatches.backported?.exists && updatePatches.backported?.exists === false
          ? basePatches.backported
          : updatePatches.backported || basePatches.backported,
    }

    return {
      ...row,
      data: {
        ...baseData,
        ...updateData,
        patches: mergedPatches,
      },
    }
  })

  const appendedRows = [...updatesById.values(), ...unmatched].map((item, index) => ({
    rowId: `${resolveCommitIdentity(item) || 'commit'}::appended::${index}::${Date.now()}`,
    data: item,
  }))

  return [...nextRows, ...appendedRows]
}

export function parseBoolLike(value: string): boolean | 'invalid' {
  const text = value.trim().toLowerCase()
  if (['1', 'true', 't', 'yes', 'y'].includes(text)) return true
  if (['0', 'false', 'f', 'no', 'n'].includes(text)) return false
  return 'invalid'
}

export function parseMergedLike(value: string): boolean | null | 'skipped' | 'invalid' {
  const text = value.trim().toLowerCase()
  if (['1', 'true', 't', 'yes', 'y'].includes(text)) return true
  if (['0', 'false', 'f', 'no', 'n'].includes(text)) return false
  if (['none', 'null', 'na', 'n/a', '-'].includes(text)) return null
  if (text === 'skipped') return 'skipped'
  return 'invalid'
}

export function formatGitDate(value: string): string {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function stageLabel(stage: BackportStage, t?: TFunction): string {
  const translate = resolveBackportTranslator(t)
  const map: Record<BackportStage, string> = {
    idle: translate('backport.stage.idle'),
    config_generated: translate('backport.stage.configGenerated'),
    report_generated: translate('backport.stage.reportGenerated'),
    interactive_editing: translate('backport.stage.interactiveEditing'),
    executing: translate('backport.stage.executing'),
    completed: translate('backport.stage.completed'),
    failed: translate('backport.stage.failed'),
    paused: translate('backport.stage.paused'),
  }
  return map[stage]
}

export function isSkippedRow(item: BackportCommitItem): boolean {
  const status = stringifyValue(item.status).trim().toLowerCase()
  return (
    Boolean(item.is_merge_commit) ||
    String(item.merged_in_target || '').toLowerCase() === 'skipped' ||
    status === 'skipped'
  )
}

export function hasPatchResource(item: BackportCommitItem, kind: BackportPatchKind): boolean {
  const patches = (item.patches as BackportPatchMap | undefined) || {}
  const descriptor = patches[kind]
  const fallbackPath =
    kind === 'original'
      ? stringifyValue(item.original_patch_path).trim()
      : kind === 'current'
        ? stringifyValue(item.patch_path).trim()
        : stringifyValue(item.backported_patch_path).trim()
  return descriptor?.exists ?? Boolean(fallbackPath)
}

function isCommitLookupFailure(item: BackportCommitItem): boolean {
  const error = `${stringifyValue(item.error)} ${stringifyValue(item.conflict_check_error)}`
  return error.includes('无法根据 commit title 找到提交') || error.includes('commit title 为空')
}

export function resolveBackportProgressText(item: BackportCommitItem, t?: TFunction): string {
  const translate = resolveBackportTranslator(t)
  const appliedCommit = stringifyValue(item.applied_commit).trim()
  const status = stringifyValue(item.status).trim().toLowerCase()
  if (appliedCommit) {
    return stringifyValue(item.applied_patch_kind).trim() === 'backported'
      ? translate('backport.progress.appliedBackported', { commit: appliedCommit.slice(0, 12) })
      : translate('backport.progress.applied', { commit: appliedCommit.slice(0, 12) })
  }
  if (Boolean(item.equivalent_exists)) return translate('backport.progress.equivalentInTarget')
  if (isSkippedRow(item)) return translate('backport.progress.skipped')
  if (status === 'pending') return translate('backport.progress.pendingCheck')
  if (item.merged_in_target === true) return translate('backport.progress.mergedInTarget')
  if (Boolean(item.has_conflict) && hasPatchResource(item, 'backported')) {
    return translate('backport.progress.conflictBackported')
  }
  if (Boolean(item.has_conflict)) return translate('backport.progress.conflictNoPatch')
  if (hasPatchResource(item, 'current')) return translate('backport.progress.currentPatchReady')
  if (hasPatchResource(item, 'original')) return translate('backport.progress.originalPatchKept')
  return translate('backport.progress.noPatch')
}

export function resolveStatusMeta(
  item: BackportCommitItem,
  t?: TFunction
): {
  kind: RowStatusKind
  label: string
  className: string
} {
  const translate = resolveBackportTranslator(t)
  const status = stringifyValue(item.status).trim().toLowerCase()
  const appliedCommit = stringifyValue(item.applied_commit).trim()
  const appliedPatchKind = stringifyValue(item.applied_patch_kind).trim()

  if (appliedCommit) {
    return {
      kind: 'success',
      label:
        appliedPatchKind === 'backported'
          ? translate('backport.status.appliedBackported')
          : translate('backport.status.applied'),
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    }
  }

  if (isSkippedRow(item)) {
    return {
      kind: 'skipped',
      label: translate('backport.status.skipped'),
      className: 'border-slate-200 bg-slate-50 text-slate-700',
    }
  }

  if (Boolean(item.equivalent_exists)) {
    return {
      kind: 'noop',
      label: translate('backport.status.equivalentExists'),
      className: 'border-sky-200 bg-sky-50 text-sky-700',
    }
  }

  if (item.merged_in_target === true) {
    return {
      kind: 'noop',
      label: translate('backport.status.targetIncluded'),
      className: 'border-sky-200 bg-sky-50 text-sky-700',
    }
  }

  if (Boolean(item.empty_patch)) {
    return {
      kind: 'failed',
      label: translate('common:status.failed'),
      className: 'border-red-200 bg-red-50 text-red-700',
    }
  }

  if (hasPatchResource(item, 'backported')) {
    return {
      kind: 'conflict',
      label: translate('backport.status.pendingApply'),
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    }
  }

  if (status === 'pending') {
    return {
      kind: 'pending',
      label: translate('backport.status.pendingCheck'),
      className: 'border-slate-200 bg-slate-50 text-slate-600',
    }
  }

  if (status === 'failed' || status === 'error' || stringifyValue(item.error).trim()) {
    if (isCommitLookupFailure(item)) {
      return {
        kind: 'unmatched',
        label: translate('backport.status.unmatched'),
        className: 'border-orange-200 bg-orange-50 text-orange-700',
      }
    }
    return {
      kind: 'failed',
      label: translate('common:status.failed'),
      className: 'border-red-200 bg-red-50 text-red-700',
    }
  }

  if (item.has_conflict === null || item.has_conflict === undefined) {
    return {
      kind: 'pending',
      label: translate('backport.status.resultUnknown'),
      className: 'border-slate-200 bg-slate-50 text-slate-600',
    }
  }

  if (Boolean(item.has_conflict)) {
    return {
      kind: 'conflict',
      label: hasPatchResource(item, 'backported')
        ? translate('backport.status.pendingApply')
        : translate('backport.status.conflict'),
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    }
  }

  return {
    kind: 'success',
    label: translate('backport.status.noConflictPendingMerge'),
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  }
}

export function resolveConflictMeta(
  item: BackportCommitItem,
  t?: TFunction
): {
  label: string
  className: string
  detail: string
} {
  const translate = resolveBackportTranslator(t)
  const method = stringifyValue(item.conflict_check_method).trim()
  const error = stringifyValue(item.conflict_check_error).trim()
  const status = stringifyValue(item.status).trim().toLowerCase()
  const appliedCommit = stringifyValue(item.applied_commit).trim()
  const appliedPatchKind = stringifyValue(item.applied_patch_kind).trim()

  if (appliedCommit) {
    return {
      label:
        appliedPatchKind === 'backported'
          ? translate('backport.conflict.resolved')
          : translate('backport.conflict.none'),
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      detail: resolveBackportProgressText(item, translate),
    }
  }

  if (isSkippedRow(item)) {
    return {
      label: translate('backport.conflict.skipped'),
      className: 'border-slate-200 bg-slate-50 text-slate-700',
      detail: error || translate('backport.conflict.mergeCommitSkipped'),
    }
  }

  if (Boolean(item.equivalent_exists) || item.merged_in_target === true) {
    return {
      label: translate('backport.conflict.noActionNeeded'),
      className: 'border-sky-200 bg-sky-50 text-sky-700',
      detail: resolveBackportProgressText(item, translate),
    }
  }

  if (Boolean(item.empty_patch)) {
    return {
      label: translate('backport.conflict.abnormalResult'),
      className: 'border-red-200 bg-red-50 text-red-700',
      detail: error || translate('backport.conflict.noUsablePatch'),
    }
  }

  if (hasPatchResource(item, 'backported')) {
    return {
      label: translate('backport.conflict.resolved'),
      className: 'border-amber-200 bg-amber-50 text-amber-700',
      detail: translate('backport.conflict.backportPatchReady'),
    }
  }

  if (status === 'pending') {
    return {
      label: translate('backport.conflict.pendingCheck'),
      className: 'border-slate-200 bg-slate-50 text-slate-600',
      detail: translate('backport.conflict.notCheckedYet'),
    }
  }

  if (item.has_conflict === null || item.has_conflict === undefined) {
    return {
      label: translate('backport.conflict.resultUnknown'),
      className: 'border-slate-200 bg-slate-50 text-slate-600',
      detail: translate('backport.conflict.noClearResult'),
    }
  }

  if (Boolean(item.has_conflict)) {
    return {
      label: hasPatchResource(item, 'backported')
        ? translate('backport.conflict.backportPatchGenerated')
        : translate('backport.conflict.hasConflict'),
      className: 'border-amber-200 bg-amber-50 text-amber-700',
      detail:
        error ||
        resolveBackportProgressText(item, translate) ||
        method ||
        translate('backport.conflict.checkHit'),
    }
  }

  if (error) {
    if (isCommitLookupFailure(item)) {
      return {
        label: translate('backport.conflict.unmatched'),
        className: 'border-orange-200 bg-orange-50 text-orange-700',
        detail: error,
      }
    }
    return {
      label: translate('backport.conflict.checkFailed'),
      className: 'border-red-200 bg-red-50 text-red-700',
      detail: error,
    }
  }

  return {
    label: translate('backport.conflict.none'),
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    detail: method || 'apply',
  }
}

export function resolveTargetMeta(
  item: BackportCommitItem,
  t?: TFunction
): {
  label: string
  className: string
} {
  const translate = resolveBackportTranslator(t)
  if (stringifyValue(item.applied_commit).trim()) {
    return {
      label: translate('backport.target.applied'),
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    }
  }
  if (isSkippedRow(item)) {
    return {
      label: translate('backport.target.skipped'),
      className: 'border-slate-200 bg-slate-50 text-slate-700',
    }
  }
  if (Boolean(item.equivalent_exists)) {
    return {
      label: translate('backport.target.equivalent'),
      className: 'border-sky-200 bg-sky-50 text-sky-700',
    }
  }
  if (item.merged_in_target === true) {
    return {
      label: translate('backport.target.exists'),
      className: 'border-sky-200 bg-sky-50 text-sky-700',
    }
  }
  if (Boolean(item.empty_patch)) {
    return {
      label: translate('backport.target.notApplied'),
      className: 'border-red-200 bg-red-50 text-red-700',
    }
  }
  if (item.merged_in_target === false) {
    return {
      label: translate('backport.target.notApplied'),
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    }
  }
  return {
    label: translate('backport.target.notChecked'),
    className: 'border-slate-200 bg-slate-50 text-slate-700',
  }
}

export function buildPatchResources(
  item: BackportCommitItem,
  rowId: string,
  t?: TFunction
): BackportPatchResource[] {
  const translate = resolveBackportTranslator(t)
  const commitId =
    stringifyValue(item.row_id || item.commit || item.input_commit || rowId).trim() || rowId
  const patches = (item.patches as BackportPatchMap | undefined) || {}

  const originalMeta = patches.original
  const currentMeta = patches.current
  const backportedMeta = patches.backported

  const originalPath = stringifyValue(item.original_patch_path).trim()
  const currentPath = stringifyValue(item.patch_path).trim()
  const backportedPath = stringifyValue(item.backported_patch_path).trim()

  return [
    {
      kind: 'original',
      label: translate('backport.patchKind.original'),
      exists: originalMeta?.exists ?? Boolean(originalPath),
      fileId: `${commitId}:original`,
      fileName: originalMeta?.file_name || (originalPath ? fileNameFromPath(originalPath) : ''),
    },
    {
      kind: 'current',
      label: translate('backport.patchKind.current'),
      exists: currentMeta?.exists ?? Boolean(currentPath),
      fileId: `${commitId}:current`,
      fileName: currentMeta?.file_name || (currentPath ? fileNameFromPath(currentPath) : ''),
    },
    {
      kind: 'backported',
      label: translate('backport.patchKind.backported'),
      exists: backportedMeta?.exists ?? Boolean(backportedPath),
      fileId: `${commitId}:backported`,
      fileName:
        backportedMeta?.file_name || (backportedPath ? fileNameFromPath(backportedPath) : ''),
    },
  ]
}

export function buildDisplayPatchResources(
  item: BackportCommitItem,
  rowId: string,
  t?: TFunction
): BackportPatchResource[] {
  const translate = resolveBackportTranslator(t)
  const resources = buildPatchResources(item, rowId, translate)
  const original = resources.find(resource => resource.kind === 'original') || resources[0]
  const applicable =
    resources.find(resource => resource.kind === 'backported' && resource.exists) ||
    resources.find(resource => resource.kind === 'current' && resource.exists) ||
    original

  const displayResources: BackportPatchResource[] = []
  if (original) {
    displayResources.push({
      ...original,
      label: translate('backport.patchKind.original'),
    })
  }
  if (applicable) {
    displayResources.push({
      ...applicable,
      label: translate('backport.patchKind.current'),
      fileId: `${rowId}:applicable:${applicable.kind}`,
    })
  }
  return displayResources
}

export function buildPatchPreviewKey(rowId: string, resource: BackportPatchResource): string {
  return `${rowId}:${resource.fileId}:${resource.fileName || 'missing'}`
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))]
}

function normalizePatchPath(path: string): string {
  return path
    .trim()
    .replace(/^"|"$/g, '')
    .replace(/^[ab]\//, '')
}

function resolveEffectiveStatus(item: BackportCommitItem): string {
  if (isSkippedRow(item)) return 'skipped'
  if (stringifyValue(item.status).trim().toLowerCase() === 'pending') return 'pending'
  if (Boolean(item.has_conflict)) return 'conflict'
  if (Boolean(item.empty_patch)) return 'empty_patch'
  if (Boolean(item.equivalent_exists)) return 'equivalent_exists'
  if (item.merged_in_target === true) return 'merged'
  if (stringifyValue(item.error).trim()) return 'failed'
  return stringifyValue(item.status).trim() || 'unknown'
}

function buildInvestigationContext({
  config,
  baseReportPath,
  workingReportPath,
  row,
}: {
  config: BackportConfig
  baseReportPath: string
  workingReportPath: string
  row: BackportCommitRow
}) {
  return {
    effective_status: resolveEffectiveStatus(row.data),
    commit: stringifyValue(row.data.commit).trim(),
    input_commit: stringifyValue(row.data.input_commit).trim(),
    title: resolveCommitTitle(row.data),
    committed_datetime: stringifyValue(row.data.committed_datetime).trim(),
    git_describe: stringifyValue(row.data.git_describe).trim(),
    source_branch: config.source_branch,
    target_branch: config.target_release,
    source_repo_path: config.project_dir,
    target_repo_path: config.target_path,
    report_path: workingReportPath || baseReportPath,
    row_id: stringifyValue(row.data.row_id).trim() || row.rowId,
  }
}

function evidenceLinesFromValue(value: unknown): string[] {
  if (value === null || value === undefined) return []
  if (typeof value === 'string') return value.split(/\r?\n/)
  try {
    return JSON.stringify(value, null, 2).split(/\r?\n/)
  } catch {
    return [String(value)]
  }
}

function extractStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(item => extractStringList(item))
  }
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(item => extractStringList(item))
  }
  const text = stringifyValue(value).trim()
  if (!text) return []
  return text
    .split(/[,，\n]/)
    .map(item => item.trim())
    .filter(Boolean)
}

function isGitHintLine(line: string): boolean {
  return /^\s*(?:"?stderr"?\s*[:=]\s*)?["']?hint:/i.test(line)
}

function extractFailureEvidence(item: BackportCommitItem) {
  const rawLines = [
    ...evidenceLinesFromValue(item.conflict_check_error),
    ...evidenceLinesFromValue(item.merged_check_error),
    ...evidenceLinesFromValue(item.error),
  ]

  const evidenceLines = rawLines
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !isGitHintLine(line))

  const keyLinePattern =
    /(cmdline|stderr|stdout|CONFLICT|patch failed|patch does not apply|could not apply)/i
  const keyLogLines = evidenceLines.filter(line => keyLinePattern.test(line)).slice(0, 30)

  const commands = uniqueStrings(
    evidenceLines
      .filter(line => /cmdline/i.test(line))
      .map(line =>
        line
          .replace(/^["']?cmdline["']?\s*[:=]\s*/i, '')
          .replace(/^-\s*/, '')
          .trim()
      )
  )

  const failedHunks: { file: string; line: number | null }[] = []
  let lastPatchFailedFile = ''
  for (const line of evidenceLines) {
    const patchFailedMatch = line.match(/patch failed:\s*([^:\s]+):(\d+)/i)
    if (patchFailedMatch) {
      lastPatchFailedFile = normalizePatchPath(patchFailedMatch[1])
      failedHunks.push({
        file: lastPatchFailedFile,
        line: Number(patchFailedMatch[2]),
      })
      continue
    }

    const doesNotApplyMatch = line.match(/(?:error:\s*)?([^:\s]+):\s*patch does not apply/i)
    if (doesNotApplyMatch) {
      lastPatchFailedFile = normalizePatchPath(doesNotApplyMatch[1])
      failedHunks.push({
        file: lastPatchFailedFile,
        line: null,
      })
      continue
    }

    const hunkFailedMatch = line.match(/Hunk #\d+ FAILED at (\d+)/i)
    if (hunkFailedMatch && lastPatchFailedFile) {
      failedHunks.push({
        file: lastPatchFailedFile,
        line: Number(hunkFailedMatch[1]),
      })
    }
  }

  const conflictFiles = [
    ...extractStringList(item.conflict_files),
    ...evidenceLines.flatMap(line => {
      const conflictInMatch = line.match(/CONFLICT\s*\([^)]+\):.*\s+in\s+(.+)$/i)
      if (conflictInMatch) return [normalizePatchPath(conflictInMatch[1])]

      const patchFailedMatch = line.match(/patch failed:\s*([^:\s]+):\d+/i)
      if (patchFailedMatch) return [normalizePatchPath(patchFailedMatch[1])]

      const doesNotApplyMatch = line.match(/(?:error:\s*)?([^:\s]+):\s*patch does not apply/i)
      if (doesNotApplyMatch) return [normalizePatchPath(doesNotApplyMatch[1])]

      return []
    }),
  ]

  return {
    conflict_check_method: stringifyValue(item.conflict_check_method).trim(),
    merged_in_target: item.merged_in_target ?? null,
    empty_patch: Boolean(item.empty_patch),
    equivalent_exists: Boolean(item.equivalent_exists),
    applied_commit: stringifyValue(item.applied_commit).trim(),
    failed_hunks: failedHunks.filter(
      (hunk, index, all) =>
        all.findIndex(item => item.file === hunk.file && item.line === hunk.line) === index
    ),
    conflict_files: uniqueStrings(conflictFiles.map(normalizePatchPath)),
    commands,
    key_log_lines: keyLogLines,
  }
}

function extractTouchedFilesFromPatch(patchText: string): string[] {
  const touchedFiles: string[] = []
  for (const line of patchText.split(/\r?\n/)) {
    const diffMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/)
    if (diffMatch) {
      touchedFiles.push(normalizePatchPath(diffMatch[1]))
      touchedFiles.push(normalizePatchPath(diffMatch[2]))
      continue
    }

    const fileMarkerMatch = line.match(/^\+\+\+\s+(?:b\/)?(.+)$/)
    if (fileMarkerMatch && fileMarkerMatch[1] !== '/dev/null') {
      touchedFiles.push(normalizePatchPath(fileMarkerMatch[1]))
    }
  }
  return uniqueStrings(touchedFiles)
}

function extractRelevantPatchHunks(
  patchText: string,
  targetFiles: string[],
  maxChars = RELEVANT_PATCH_HUNK_CHAR_LIMIT
): { text: string; truncated: boolean } {
  const normalizedTargets = uniqueStrings(targetFiles.map(normalizePatchPath))
  const lines = patchText.split(/\r?\n/)
  const selectedHunks: string[] = []
  let currentFile = ''
  let currentHeader: string[] = []
  let currentHunk: string[] = []
  let currentHunkMatches = false

  const fileMatches = (file: string): boolean => {
    const normalizedFile = normalizePatchPath(file)
    return (
      normalizedTargets.length === 0 ||
      normalizedTargets.some(
        target =>
          normalizedFile === target ||
          normalizedFile.endsWith(`/${target}`) ||
          target.endsWith(`/${normalizedFile}`)
      )
    )
  }

  const flushHunk = () => {
    if (currentHunk.length > 0 && currentHunkMatches) {
      selectedHunks.push([...currentHeader, ...currentHunk].join('\n'))
    }
    currentHunk = []
    currentHunkMatches = false
  }

  for (const line of lines) {
    const diffMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/)
    if (diffMatch) {
      flushHunk()
      currentFile = normalizePatchPath(diffMatch[2])
      currentHeader = [line]
      continue
    }

    if (/^(---|\+\+\+)\s+/.test(line)) {
      const plusMatch = line.match(/^\+\+\+\s+(?:b\/)?(.+)$/)
      if (plusMatch && plusMatch[1] !== '/dev/null') {
        currentFile = normalizePatchPath(plusMatch[1])
      }
      currentHeader.push(line)
      continue
    }

    if (line.startsWith('@@')) {
      flushHunk()
      currentHunkMatches = fileMatches(currentFile)
      currentHunk = [line]
      continue
    }

    if (currentHunk.length > 0) {
      currentHunk.push(line)
    }
  }
  flushHunk()

  const relevantText = selectedHunks.join('\n\n')
  if (!relevantText) {
    return {
      text: '未在已加载 patch 中找到匹配 focus files 的 diff hunk。',
      truncated: false,
    }
  }

  if (relevantText.length <= maxChars) {
    return { text: relevantText, truncated: false }
  }

  return {
    text: `${relevantText.slice(0, maxChars)}\n[Relevant patch hunk truncated: original length ${relevantText.length} chars, kept ${maxChars} chars.]`,
    truncated: true,
  }
}

export function buildCompactBackportConflictAnalysisMessage({
  config,
  baseReportPath,
  workingReportPath,
  row,
  patches,
  t,
}: {
  config: BackportConfig
  baseReportPath: string
  workingReportPath: string
  row: BackportCommitRow
  patches: BackportConflictAnalysisPatch[]
  t?: TFunction
}): string {
  const translate = resolveBackportTranslator(t)
  const investigationContext = buildInvestigationContext({
    config,
    baseReportPath,
    workingReportPath,
    row,
  })
  const failureEvidence = extractFailureEvidence(row.data)
  const originalPatch = patches.find(patch => patch.resource.kind === 'original')
  const touchedFiles = uniqueStrings(
    patches.flatMap(patch =>
      patch.response ? extractTouchedFilesFromPatch(patch.response.patch_text || '') : []
    )
  )
  const focusFiles = uniqueStrings([
    ...failureEvidence.failed_hunks.map(hunk => hunk.file),
    ...failureEvidence.conflict_files,
    ...touchedFiles,
  ])
  const hunkSourcePatch = originalPatch?.response || patches.find(patch => patch.response)?.response
  const relevantPatchHunk = hunkSourcePatch
    ? extractRelevantPatchHunks(
        hunkSourcePatch.patch_text || '',
        focusFiles,
        RELEVANT_PATCH_HUNK_CHAR_LIMIT
      )
    : { text: translate('backport.analysis.noHunk'), truncated: false }

  return `请进入 patch investigation mode，分析这个 Backport / git apply patch 失败原因。

## 任务边界
- 只做失败原因调查。
- 不要重新执行完整 backport 流程。
- 不要创建 PR。
- 不要修改远端分支。
- 可以读取 LOCAL_PROCESS 本机路径。
- 不要伪造文件内容或命令结果。

## Case Summary
\`\`\`json
${JSON.stringify(investigationContext, null, 2)}
\`\`\`

## Failure Evidence
\`\`\`json
${JSON.stringify(failureEvidence, null, 2)}
\`\`\`

## Patch Focus
\`\`\`json
${JSON.stringify(
  {
    touched_files: touchedFiles,
    focus_files: focusFiles,
    failed_hunks: failureEvidence.failed_hunks,
    conflict_files: failureEvidence.conflict_files,
  },
  null,
  2
)}
\`\`\`

## Relevant Patch Hunk
- source_patch_file: ${hunkSourcePatch?.file_name || originalPatch?.resource.fileName || '--'}
- truncated: ${relevantPatchHunk.truncated ? 'true' : 'false'}

\`\`\`diff
${relevantPatchHunk.text}
\`\`\`

## Available Files
\`\`\`json
${JSON.stringify(
  {
    original_patch_file:
      originalPatch?.response?.file_name ||
      originalPatch?.resource.fileName ||
      stringifyValue(row.data.original_patch_path).trim(),
    target_repo_path: config.target_path,
    source_repo_path: config.project_dir,
    report_path: workingReportPath || baseReportPath,
  },
  null,
  2
)}
\`\`\`

## 输出要求
1. 冲突原因结论
2. 关键证据
3. 原始提交和目标分支上下文的关系
4. 是否可能已部分合入、缺少前置 commit 或目标文件结构变化
5. 建议动作：继续修复 / 重新生成 patch / 检查等价合入 / 补充信息`
}
