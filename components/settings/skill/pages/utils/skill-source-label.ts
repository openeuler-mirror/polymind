import type { TFunction } from 'i18next'
import i18n from '@/lib/i18n/config'

const REMOTE_SKILL_SOURCE_TYPES = new Set(['git', 'clawhub', 'wittyhub'])

type SkillSourceLabelOptions = {
  runtimeSource?: string | null
  sourceLabel?: string | null
  audience?: 'badge' | 'error'
  fallback?: string
  t?: TFunction
}

type SkillSourceBadgeMeta = {
  label: string
  className: string
}

export function getSkillSourceBadgeMeta(
  sourceType?: string | null,
  t?: TFunction
): SkillSourceBadgeMeta {
  const translate = t ?? i18n.t.bind(i18n)
  switch (sourceType) {
    case 'wittyhub':
      return {
        label: 'WittyHub',
        className: 'border-sky-200 bg-sky-50 text-sky-700',
      }
    case 'clawhub':
      return {
        label: 'ClawHub',
        className: 'border-amber-200 bg-amber-50 text-amber-700',
      }
    case 'git':
      return {
        label: 'Git',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      }
    case 'local':
      return {
        label: translate('settings:skill.source.localImport'),
        className: 'border-slate-200 bg-slate-50 text-slate-700',
      }
    case 'builtin':
      return {
        label: translate('settings:skill.source.builtin'),
        className: 'border-violet-200 bg-violet-50 text-violet-700',
      }
    default:
      return {
        label: sourceType?.trim() || translate('settings:skill.source.unknown'),
        className: 'border-zinc-200 bg-zinc-50 text-zinc-700',
      }
  }
}

export function formatSkillSourceLabel(sourceType?: string | null, t?: TFunction): string {
  return getSkillSourceBadgeMeta(sourceType, t).label
}

export function isRemoteSkillSourceType(sourceType?: string | null): boolean {
  return Boolean(sourceType && REMOTE_SKILL_SOURCE_TYPES.has(sourceType))
}

export function getSkillSourceLabel(
  sourceType?: string | null,
  { runtimeSource, sourceLabel, audience = 'badge', fallback, t }: SkillSourceLabelOptions = {}
): string {
  const translate = t ?? i18n.t.bind(i18n)

  if (sourceLabel?.trim()) {
    return sourceLabel.trim()
  }

  if (audience === 'error') {
    switch (runtimeSource) {
      case 'openclaw-bundled':
        return translate('settings:skill.source.runtimeBundled')
      case 'agents-skills-personal':
        return translate('settings:skill.source.globalPersonal')
      case 'openclaw-extra':
        return translate('settings:skill.source.agentExtra')
      case 'openclaw-workspace':
        return translate('settings:skill.source.workspace')
      default:
        break
    }

    switch (sourceType) {
      case 'wittyhub':
        return translate('settings:skill.source.wittyhub')
      case 'clawhub':
        return translate('settings:skill.source.clawhub')
      case 'builtin':
        return translate('settings:skill.source.runtimeSkill')
      case 'git':
      case 'local':
        return translate('settings:skill.source.imported')
      default:
        return fallback || translate('settings:skill.source.skill')
    }
  }

  return (
    formatSkillSourceLabel(sourceType, translate) ||
    fallback ||
    translate('settings:skill.source.unknown')
  )
}
