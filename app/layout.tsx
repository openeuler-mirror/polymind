import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { LanguageProvider } from '@/components/language-provider'
import { Toaster } from '@/components/ui/toaster'
import './globals.css'

export const metadata: Metadata = {
  title: 'PolyMind - AI Assistant',
  description: 'PolyMind is an intelligent AI assistant with multi-modal capabilities, MCP tool integration, and file processing support.',
  generator: 'v0.app',
  icons: {
    icon: [
      { url: '/icon.ico', sizes: 'any' },
      { url: '/icon.png', type: 'image/png' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/icon.ico',
    apple: '/icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8f8f8' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1a1a' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // 服务端注入客户端配置
  const appConfig = {
    NEXT_PUBLIC_AGENTD_API_URL: process.env.NEXT_PUBLIC_AGENTD_API_URL,
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
    NEXT_PUBLIC_API_TIMEOUT: process.env.NEXT_PUBLIC_API_TIMEOUT,
    NEXT_PUBLIC_MAX_RECONNECT_ATTEMPTS: process.env.NEXT_PUBLIC_MAX_RECONNECT_ATTEMPTS,
    NEXT_PUBLIC_RECONNECT_INTERVAL: process.env.NEXT_PUBLIC_RECONNECT_INTERVAL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION,
    NEXT_PUBLIC_DEBUG: process.env.NEXT_PUBLIC_DEBUG,
  }

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__APP_CONFIG__ = ${JSON.stringify(appConfig)}`,
          }}
        />
      </head>
      <body>
        <LanguageProvider>
          {/* 配置主题：默认跟随系统，支持 light/dark/system */}
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
            <Toaster />
          </ThemeProvider>
          <Analytics />
        </LanguageProvider>
      </body>
    </html>
  )
}
