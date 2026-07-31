export function getSkillNameOrNull(value?: string | null): string | null {
  const trimmed = value?.trim()
  if (!trimmed) {
    return null
  }

  return trimmed.split('/').pop() || trimmed
}

export function extractSkillName(value?: string | null): string {
  return getSkillNameOrNull(value) || '未命名技能'
}
