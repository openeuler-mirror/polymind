import { defineStore } from 'pinia'
import { onMounted, ref } from 'vue'
import type { ShortcutKeySetting } from '@shared/presenter'
import { usePresenter } from '@/composables/usePresenter'

export const useShortcutKeyStore = defineStore('shortcutKey', () => {
  const configP = usePresenter('configPresenter')
  const shortcutKeyP = usePresenter('shortcutPresenter')
  const shortcutKeys = ref<ShortcutKeySetting>()

  const loadShortcutKeys = async () => {
    const customShortcutKeys = await configP.getShortcutKey()
    shortcutKeys.value = customShortcutKeys
  }

  const saveShortcutKeys = async () => {
    await configP.setShortcutKey(shortcutKeys.value)
  }

  const resetShortcutKeys = async () => {
    await configP.resetShortcutKeys()
    await loadShortcutKeys()
  }

  const enableShortcutKey = async () => {
    shortcutKeyP.registerShortcuts()
  }

  const disableShortcutKey = async () => {
    shortcutKeyP.destroy()
  }

  onMounted(async () => {
    await loadShortcutKeys()
  })

  return {
    shortcutKeys,
    loadShortcutKeys,
    saveShortcutKeys,
    resetShortcutKeys,
    enableShortcutKey,
    disableShortcutKey
  }
})
