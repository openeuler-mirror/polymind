import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { LanguageProvider } from '@/components/language-provider'
import { Toaster } from '@/components/ui/toaster'
import { PUBLIC_ENV_KEYS } from '@/app/config'
import './globals.css'

export const metadata: Metadata = {
  title: 'PolyMind - AI Assistant',
  description:
    'PolyMind is an intelligent AI assistant with multi-modal capabilities, MCP tool integration, and file processing support.',
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
  // 服务端注入客户端配置 —— 从 PUBLIC_ENV_KEYS 动态构建，
  // 新增 NEXT_PUBLIC_* 变量时只需修改 app/config/index.ts，此处无需再手动同步。
  const appConfig: Record<string, string | undefined> = {}
  for (const key of PUBLIC_ENV_KEYS) {
    appConfig[key] = process.env[key]
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
