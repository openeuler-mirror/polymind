import { ApiError, extractApiErrorMessage } from '@/lib/error-handler'
import { getSkillNameOrNull } from './skill-name'
import { getSkillSourceLabel } from './skill-source-label'

type SkillOperationKind = 'install' | 'uninstall'

type SkillOperationErrorContext = {
  operation: SkillOperationKind
  skillName?: string | null
  sourceType?: string | null
  runtimeSource?: string | null
  sourceLabel?: string | null
  fallback?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getStringProperty(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const prop = value[key]
  return typeof prop === 'string' ? prop : undefined
}

function getRecordProperty(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const prop = value[key]
  return isRecord(prop) ? prop : undefined
}

function getNormalizedApiErrorPayload(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null
  }

  const nestedError = getRecordProperty(value, 'error')
  return nestedError ?? value
}

function getSkillOperationLabel(operation: SkillOperationKind): string {
  return operation === 'install' ? '安装' : '卸载'
}

function formatSkillSubject(context: SkillOperationErrorContext): string {
  const sourceLabel = getSkillSourceLabel(context.sourceType, {
    runtimeSource: context.runtimeSource,
    sourceLabel: context.sourceLabel,
    audience: 'error',
    fallback: '技能',
  })
  const displayName = getSkillNameOrNull(context.skillName)
  return displayName ? `${sourceLabel}“${displayName}”` : sourceLabel
}

function extractSkillErrorInfo(error: ApiError): {
  code?: string
  upstreamCode?: string
  upstreamMessage?: string
  reason?: string
} | null {
  const payload = getNormalizedApiErrorPayload(error.details)
  if (!payload) {
    return null
  }

  const details = getRecordProperty(payload, 'details')
  const upstreamDetails = getRecordProperty(details, 'upstream_error_details')
  const reason =
    getStringProperty(details, 'error') ||
    getStringProperty(upstreamDetails, 'reason') ||
    getStringProperty(details, 'reason')

  return {
    code: getStringProperty(payload, 'code'),
    upstreamCode: getStringProperty(details, 'upstream_error_code'),
    upstreamMessage: getStringProperty(details, 'upstream_error_message'),
    reason,
  }
}

function translateSkillOperationReason(
  reason: string,
  context: SkillOperationErrorContext
): string | null {
  const normalized = reason.trim().toLowerCase()
  const actionLabel = getSkillOperationLabel(context.operation)

  if (!normalized) {
    return null
  }

  if (normalized.includes('bundled skill cannot be uninstalled')) {
    return '它由 Agent 运行时自带，当前不支持卸载。'
  }

  if (normalized.includes('source_path is required for runtime-discovered skill uninstall')) {
    return '缺少技能安装路径，暂时无法卸载，请先刷新已安装列表后重试。'
  }

  if (normalized.includes('skill_source is required for wittyhub install')) {
    return '缺少来源地址，暂时无法安装。'
  }

  if (normalized.includes('npx command not found')) {
    return `当前环境缺少 npx 命令，无法执行${actionLabel}。`
  }

  if (normalized.includes('openclaw command not found')) {
    return `当前环境缺少 openclaw 命令，无法执行${actionLabel}。`
  }

  if (normalized.includes('clawhub command not found')) {
    return `当前环境缺少 clawhub 命令，无法执行${actionLabel}。`
  }

  if (normalized.includes('enoent')) {
    return '技能文件或目录不存在，可能已经被手动删除，请刷新列表后重试。'
  }

  if (normalized.includes('not installed')) {
    return '当前 Agent 中没有安装这个技能。'
  }

  return reason.trim()
}

export function extractSkillOperationErrorMessage(
  error: unknown,
  context: SkillOperationErrorContext
): string {
  const actionLabel = getSkillOperationLabel(context.operation)
  const skillSubject = formatSkillSubject(context)
  const defaultFallback = context.fallback || `${actionLabel}${skillSubject}失败，请稍后重试。`

  if (!(error instanceof ApiError)) {
    return extractApiErrorMessage(error, defaultFallback)
  }

  const errorInfo = extractSkillErrorInfo(error)
  if (!errorInfo) {
    return extractApiErrorMessage(error, defaultFallback)
  }

  const effectiveCode = errorInfo.upstreamCode || errorInfo.code
  switch (effectiveCode) {
    case 'OPENCLAW_SKILL_NOT_REMOVABLE':
      return `${skillSubject}由 Agent 运行时自带，当前不支持卸载。`
    case 'AGENT_NOT_RUNNING':
      return `当前 Agent 未运行，无法${actionLabel}${skillSubject}。`
    case 'SKILL_NOT_FOUND':
      return `${skillSubject}不存在，可能已经被移除，请刷新列表后重试。`
    case 'SKILL_INSTALL_RECORD_FAILED':
      return `${skillSubject}可能已经安装成功，但平台记录保存失败，请刷新已安装列表确认。`
    case 'SKILL_UNINSTALL_RECORD_FAILED':
      return `${skillSubject}可能已经卸载成功，但平台记录清理失败，请刷新已安装列表确认。`
    default:
      break
  }

  const translatedReason =
    (errorInfo.reason && translateSkillOperationReason(errorInfo.reason, context)) ||
    (errorInfo.upstreamMessage && translateSkillOperationReason(errorInfo.upstreamMessage, context))

  if (translatedReason) {
    if (translatedReason.endsWith('。') || translatedReason.endsWith('！')) {
      return `${actionLabel}${skillSubject}失败：${translatedReason.slice(0, -1)}。`
    }
    return `${actionLabel}${skillSubject}失败：${translatedReason}`
  }

  return extractApiErrorMessage(error, defaultFallback)
}
