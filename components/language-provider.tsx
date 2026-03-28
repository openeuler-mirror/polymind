'use client'

import * as React from 'react'
import { useChatStore } from '@/lib/store'

interface LanguageProviderProps {
  children: React.ReactNode
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const { settings } = useChatStore()

  return (
    <html lang={settings.language.split('-')[0]} suppressHydrationWarning>
      <body>
        {children}
      </body>
    </html>
  )
}
