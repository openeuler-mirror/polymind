'use client'

import * as React from 'react'
import { useChatStore } from '@/lib/store'

interface LanguageProviderProps {
  children: React.ReactNode
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const { settings } = useChatStore()

  React.useEffect(() => {
    // 在客户端更新语言设置
    if (typeof document !== 'undefined') {
      document.documentElement.lang = settings.language.split('-')[0]
    }
  }, [settings.language])

  return (
    <>
      {children}
    </>
  )
}
