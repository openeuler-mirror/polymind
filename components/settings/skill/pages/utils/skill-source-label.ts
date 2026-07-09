const REMOTE_SKILL_SOURCE_TYPES = new Set(['git', 'clawhub', 'wittyhub'])

type SkillSourceLabelOptions = {
  runtimeSource?: string | null
  sourceLabel?: string | null
  audience?: 'badge' | 'error'
  fallback?: string
}

type SkillSourceBadgeMeta = {
  label: string
  className: string
}

export function getSkillSourceBadgeMeta(sourceType?: string | null): SkillSourceBadgeMeta {
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
        label: '本地导入',
        className: 'border-slate-200 bg-slate-50 text-slate-700',
      }
    case 'builtin':
      return {
        label: '内置',
        className: 'border-violet-200 bg-violet-50 text-violet-700',
      }
    default:
      return {
        label: sourceType?.trim() || '未知来源',
        className: 'border-zinc-200 bg-zinc-50 text-zinc-700',
      }
  }
}

export function formatSkillSourceLabel(sourceType?: string | null): string {
  return getSkillSourceBadgeMeta(sourceType).label
}

export function isRemoteSkillSourceType(sourceType?: string | null): boolean {
  return Boolean(sourceType && REMOTE_SKILL_SOURCE_TYPES.has(sourceType))
}

export function getSkillSourceLabel(
  sourceType?: string | null,
  { runtimeSource, sourceLabel, audience = 'badge', fallback }: SkillSourceLabelOptions = {}
): string {
  if (sourceLabel?.trim()) {
    return sourceLabel.trim()
  }

  if (audience === 'error') {
    switch (runtimeSource) {
      case 'openclaw-bundled':
        return '运行时内置技能'
      case 'agents-skills-personal':
        return '全局个人技能'
      case 'openclaw-extra':
        return '当前 Agent 附加技能'
      case 'openclaw-workspace':
        return '工作区技能'
      default:
        break
    }

    switch (sourceType) {
      case 'wittyhub':
        return 'WittyHub 技能'
      case 'clawhub':
        return 'ClawHub 技能'
      case 'builtin':
        return '运行时技能'
      case 'git':
      case 'local':
        return '导入技能'
      default:
        return fallback || '技能'
    }
  }

  return formatSkillSourceLabel(sourceType) || fallback || '未知来源'
}
