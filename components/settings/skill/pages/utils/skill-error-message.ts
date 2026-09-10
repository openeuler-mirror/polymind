import type { TFunction } from 'i18next'
import i18n from '@/lib/i18n/config'
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
  t?: TFunction
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

function getSkillOperationLabel(operation: SkillOperationKind, t: TFunction): string {
  return operation === 'install'
    ? t('settings:skill.error.actionInstall')
    : t('settings:skill.error.actionUninstall')
}

function formatSkillSubject(context: SkillOperationErrorContext, t: TFunction): string {
  const sourceLabel = getSkillSourceLabel(context.sourceType, {
    runtimeSource: context.runtimeSource,
    sourceLabel: context.sourceLabel,
    audience: 'error',
    fallback: t('settings:skill.source.skill'),
    t,
  })
  const displayName = getSkillNameOrNull(context.skillName)
  return displayName
    ? t('settings:skill.error.subject', { source: sourceLabel, name: displayName })
    : sourceLabel
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
  context: SkillOperationErrorContext,
  t: TFunction
): string | null {
  const normalized = reason.trim().toLowerCase()
  const actionLabel = getSkillOperationLabel(context.operation, t)

  if (!normalized) {
    return null
  }

  if (normalized.includes('bundled skill cannot be uninstalled')) {
    return t('settings:skill.error.reasonBundledSkill')
  }

  if (normalized.includes('source_path is required for runtime-discovered skill uninstall')) {
    return t('settings:skill.error.reasonSourcePathRequired')
  }

  if (normalized.includes('skill_source is required for wittyhub install')) {
    return t('settings:skill.error.reasonSkillSourceRequired')
  }

  if (normalized.includes('npx command not found')) {
    return t('settings:skill.error.reasonCommandNotFound', { command: 'npx', action: actionLabel })
  }

  if (normalized.includes('openclaw command not found')) {
    return t('settings:skill.error.reasonCommandNotFound', {
      command: 'openclaw',
      action: actionLabel,
    })
  }

  if (normalized.includes('clawhub command not found')) {
    return t('settings:skill.error.reasonCommandNotFound', {
      command: 'clawhub',
      action: actionLabel,
    })
  }

  if (normalized.includes('enoent')) {
    return t('settings:skill.error.reasonEnoent')
  }

  if (normalized.includes('not installed')) {
    return t('settings:skill.error.reasonNotInstalled')
  }

  return reason.trim()
}

export function extractSkillOperationErrorMessage(
  error: unknown,
  context: SkillOperationErrorContext
): string {
  const t = context.t ?? i18n.t.bind(i18n)
  const actionLabel = getSkillOperationLabel(context.operation, t)
  const skillSubject = formatSkillSubject(context, t)
  const defaultFallback =
    context.fallback ||
    t('settings:skill.error.genericFailure', { action: actionLabel, subject: skillSubject })

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
      return t('settings:skill.error.notRemovable', { subject: skillSubject })
    case 'AGENT_NOT_RUNNING':
      return t('settings:skill.error.agentNotRunning', {
        action: actionLabel,
        subject: skillSubject,
      })
    case 'SKILL_NOT_FOUND':
      return t('settings:skill.error.notFound', { subject: skillSubject })
    case 'SKILL_INSTALL_RECORD_FAILED':
      return t('settings:skill.error.installRecordFailed', { subject: skillSubject })
    case 'SKILL_UNINSTALL_RECORD_FAILED':
      return t('settings:skill.error.uninstallRecordFailed', { subject: skillSubject })
    default:
      break
  }

  const translatedReason =
    (errorInfo.reason && translateSkillOperationReason(errorInfo.reason, context, t)) ||
    (errorInfo.upstreamMessage &&
      translateSkillOperationReason(errorInfo.upstreamMessage, context, t))

  if (translatedReason) {
    if (translatedReason.endsWith('。') || translatedReason.endsWith('！')) {
      return t('settings:skill.error.reasonSuffix', {
        action: actionLabel,
        subject: skillSubject,
        reason: translatedReason.slice(0, -1),
      })
    }
    return t('settings:skill.error.reasonSuffixNoPeriod', {
      action: actionLabel,
      subject: skillSubject,
      reason: translatedReason,
    })
  }

  return extractApiErrorMessage(error, defaultFallback)
}
