'use client'

import * as React from 'react'
import { useChatStore } from '@/lib/store'
import i18n from '@/lib/i18n/config'

interface LanguageProviderProps {
  children: React.ReactNode
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const { settings } = useChatStore()
  const language = settings.language

  React.useEffect(() => {
    // 同步 i18next 语言与 <html lang>，useTranslation 订阅的组件会自动重渲染
    if (i18n.language !== language) {
      void i18n.changeLanguage(language)
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language
    }
  }, [language])

  return <>{children}</>
}
