'use client'

import {
  ThemeProvider as NextThemesProvider,
  type ThemeProviderProps,
  useTheme,
} from 'next-themes'
import * as React from 'react'
import { useChatStore } from '@/lib/store'

// 导出一个包装好的 ThemeProvider
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}

// 导出 useTheme 方便全局使用
export { useTheme } from 'next-themes'

// 用于在组件中使用主题并与store同步
export function useThemeWithStore() {
  const { theme: nextTheme, setTheme: setNextTheme } = useTheme()
  const { settings, updateSettings } = useChatStore()

  // 当next-themes的主题变化时，更新store中的主题
  React.useEffect(() => {
    if (nextTheme && nextTheme !== settings.theme) {
      updateSettings({ theme: nextTheme as 'light' | 'dark' | 'system' })
    }
  }, [nextTheme, settings.theme, updateSettings])

  // 提供一个安全的setTheme函数
  const setThemeWithStore = (theme: 'light' | 'dark' | 'system') => {
    setNextTheme(theme)
  }

  return { theme: nextTheme, setTheme: setThemeWithStore }
}

