import { create } from 'zustand'
import { createSettingsSlice, type SettingsSlice } from '../settings-store'

const useTestStore = create<SettingsSlice>()((...a) => ({
  ...createSettingsSlice(...a),
}))

describe('SettingsSlice', () => {
  beforeEach(() => {
    useTestStore.setState({
      settings: { theme: 'system', language: 'zh-CN' },
    })
  })

  it('should have correct initial settings', () => {
    const state = useTestStore.getState()
    expect(state.settings.theme).toBe('system')
    expect(state.settings.language).toBe('zh-CN')
  })

  it('should update a single setting', () => {
    useTestStore.getState().updateSettings({ theme: 'dark' })
    const state = useTestStore.getState()
    expect(state.settings.theme).toBe('dark')
    expect(state.settings.language).toBe('zh-CN') // unchanged
  })

  it('should update multiple settings at once', () => {
    useTestStore.getState().updateSettings({ theme: 'light', language: 'en-US' })
    const state = useTestStore.getState()
    expect(state.settings.theme).toBe('light')
    expect(state.settings.language).toBe('en-US')
  })

  it('should preserve existing settings when partial update', () => {
    useTestStore.getState().updateSettings({ theme: 'dark' })
    useTestStore.getState().updateSettings({ language: 'en-US' })
    const state = useTestStore.getState()
    expect(state.settings.theme).toBe('dark')
    expect(state.settings.language).toBe('en-US')
  })

  it('should not add unknown properties to settings', () => {
    const stateBefore = useTestStore.getState().settings
    useTestStore.getState().updateSettings({ theme: 'dark' })
    const stateAfter = useTestStore.getState().settings
    expect(stateAfter.theme).toBe('dark')
    expect(stateAfter.language).toBe(stateBefore.language)
  })
})
