import type { StateCreator } from 'zustand'
import type { Settings } from './utils'
import { fallbackLanguage, languages, type Language } from '../i18n/settings'

export interface SettingsSlice {
  settings: Settings
  updateSettings: (settings: Partial<Settings>) => void
}

const SETTINGS_STORAGE_KEY = 'pm_settings'

const defaultSettings: Settings = {
  theme: 'system',
  language: fallbackLanguage,
}

/**
 * 读取持久化设置（客户端）。
 *
 * 与 ui-store 的 hydrateSidebarUI 不同，这里在 slice 创建期就读取 localStorage：
 * settings 只被 effect（LanguageProvider 同步 i18n）和设置页交互读取，不参与 SSR 渲染，
 * 因此不会造成水合不一致。判定规则见 ui-store hydrateSidebarUI 的注释：只有会被首帧
 * （含 SSR 输出）读取的值才必须延迟到挂载后 hydrate。
 */
function loadSettings(): Settings {
  if (typeof window === 'undefined') return { ...defaultSettings }
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return { ...defaultSettings }
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      theme: parsed.theme ?? defaultSettings.theme,
      language:
        parsed.language && (languages as readonly string[]).includes(parsed.language)
          ? (parsed.language as Language)
          : defaultSettings.language,
    }
  } catch {
    return { ...defaultSettings }
  }
}

function saveSettings(value: Settings): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(value))
  } catch {
    // localStorage 不可用（隐私模式/配额）时静默降级为不持久化。
  }
}

export const createSettingsSlice: StateCreator<SettingsSlice, [], [], SettingsSlice> = set => ({
  settings: loadSettings(),
  updateSettings: settings => {
    set(state => {
      const next = { ...state.settings, ...settings }
      saveSettings(next)
      return { settings: next }
    })
  },
})
