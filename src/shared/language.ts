import { z } from 'zod'
/**
 * Language name mapping from ISO codes to full language names.
 */

export const LANGUAGES: Record<Language, string> = {
  'zh-CN': '简体中文',
  'en-US': 'English (US)',
  'zh-TW': '繁體中文（中国台灣）',
  'zh-HK': '繁體中文（中国香港）',
  'ko-KR': '한국어',
  'ru-RU': 'Русский',
  'ja-JP': '日本語',
  'fr-FR': 'Français',
  'fa-IR': 'فارسی (ایران)'
}

/**
 * Formats a VSCode locale string to ensure the region code is uppercase.
 * For example, transforms "en-us" to "en-US" or "fr-ca" to "fr-CA".
 *
 * @param vscodeLocale - The VSCode locale string to format (e.g., "en-us", "fr-ca")
 * @returns The formatted locale string with uppercase region code
 */

export function formatLanguage(vscodeLocale: string): Language {
  if (!vscodeLocale) {
    return 'en-US'
  }

  const formattedLocale = vscodeLocale.replace(/-(\w+)$/, (_, region) => `-${region.toUpperCase()}`)
  return isLanguage(formattedLocale) ? formattedLocale : 'en-US'
}

/**
 * Language
 */

export const languages = [
  'zh-CN',
  'en-US',
  'zh-TW',
  'zh-HK',
  'ko-KR',
  'ru-RU',
  'ja-JP',
  'fr-FR',
  'fa-IR'
] as const

export const languagesSchema = z.enum(languages)

export type Language = z.infer<typeof languagesSchema>

export const isLanguage = (value: string): value is Language =>
  languages.includes(value as Language)
