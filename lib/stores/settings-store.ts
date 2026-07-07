import type { StateCreator } from 'zustand'
import type { Settings } from './utils'

export interface SettingsSlice {
  settings: Settings
  updateSettings: (settings: Partial<Settings>) => void
}

export const createSettingsSlice: StateCreator<SettingsSlice, [], [], SettingsSlice> = set => ({
  settings: {
    theme: 'system',
    language: 'zh-CN',
  },
  updateSettings: settings => {
    set(state => ({
      settings: { ...state.settings, ...settings },
    }))
  },
})
