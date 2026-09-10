import type { TFunction } from 'i18next'
import i18n from '@/lib/i18n/config'

export function getSkillNameOrNull(value?: string | null): string | null {
  const trimmed = value?.trim()
  if (!trimmed) {
    return null
  }

  return trimmed.split('/').pop() || trimmed
}

export function extractSkillName(value?: string | null, t?: TFunction): string {
  const translate = t ?? i18n.t.bind(i18n)
  return getSkillNameOrNull(value) || translate('settings:skill.name.unnamed')
}
