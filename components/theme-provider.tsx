'use client'

import * as React from 'react'
import {
  ThemeProvider as NextThemesProvider,
  type ThemeProviderProps,
  useTheme,
} from 'next-themes'
import { useChatStore } from '@/lib/store'

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}

// 用于在组件中使用主题并与store同步
export function useThemeWithStore() {
  const { theme: nextTheme, setTheme: setNextTheme } = useTheme()
  const { settings, updateSettings } = useChatStore()

  // 当store中的主题变化时，更新next-themes的主题
  React.useEffect(() => {
    if (nextTheme !== settings.theme) {
      setNextTheme(settings.theme)
    }
  }, [settings.theme]) // 移除nextTheme和setNextTheme依赖，避免无限循环

  // 当next-themes的主题变化时，更新store中的主题
  React.useEffect(() => {
    if (nextTheme && nextTheme !== settings.theme) {
      updateSettings({ theme: nextTheme as 'light' | 'dark' | 'system' })
    }
  }, [nextTheme]) // 移除settings.theme和updateSettings依赖，避免无限循环

  return { theme: nextTheme, setTheme: (theme: 'light' | 'dark' | 'system') => {
    setNextTheme(theme)
    updateSettings({ theme })
  } }
}

