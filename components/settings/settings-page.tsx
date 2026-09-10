'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { User, Settings, Bot, Wrench, Sparkles, Cpu, Info } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'
import { useThemeWithStore } from '@/components/theme-provider'
import { SkillsPage } from './skill'
import { ModelPage } from './model/model-page'
import { McpPage } from './mcp/mcp-page'

export function SettingsPage() {
  const { t } = useTranslation('settings')
  const { settings, updateSettings, settingsActiveSection, setSettingsActiveSection } =
    useChatStore()
  const { setTheme } = useThemeWithStore()

  const [localActiveSection, setLocalActiveSection] = useState(settingsActiveSection || 'general')

  useEffect(() => {
    if (settingsActiveSection) {
      setLocalActiveSection(settingsActiveSection)
      setSettingsActiveSection(null)
    }
  }, [settingsActiveSection, setSettingsActiveSection])

  const activeSection = localActiveSection

  const sections = [
    { id: 'account', name: t('nav.account'), icon: User },
    { id: 'general', name: t('nav.general'), icon: Settings },
    { id: 'model', name: t('nav.model'), icon: Cpu },
    { id: 'agent', name: t('nav.agent'), icon: Bot },
    { id: 'rules', name: t('nav.skill'), icon: Sparkles },
    { id: 'mcp', name: t('nav.mcp'), icon: Wrench },
    { id: 'about', name: t('nav.about'), icon: Info },
  ]

  return (
    <div className="flex h-full min-h-0 bg-background">
      {/* Sidebar */}
      <div className="w-48 border-r border-border bg-background p-4">
        <nav className="space-y-1">
          {sections.map(section => (
            <button
              key={section.id}
              onClick={() => setLocalActiveSection(section.id)}
              className={cn(
                'flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md transition-colors',
                activeSection === section.id
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'hover:bg-sidebar-accent/50'
              )}
            >
              <section.icon className="h-4 w-4" />
              <span>{section.name}</span>
              {activeSection === section.id && (
                <div className="ml-auto w-1.5 h-5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0 flex-col">
        {/* Header */}

        {/* Content */}
        <ScrollArea className="min-h-0 flex-1 p-6">
          {activeSection === 'general' && (
            <div className="space-y-8">
              <div>
                <h2 className="text-sm font-medium mb-4">{t('general.title')}</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="theme">{t('general.theme.label')}</Label>
                      <p className="text-xs text-muted-foreground">{t('general.theme.description')}</p>
                    </div>
                    <Select
                      value={settings.theme}
                      onValueChange={value => setTheme(value as 'light' | 'dark' | 'system')}
                    >
                      <SelectTrigger id="theme" className="w-40">
                        <SelectValue placeholder={t('general.theme.placeholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">{t('general.theme.light')}</SelectItem>
                        <SelectItem value="dark">{t('general.theme.dark')}</SelectItem>
                        <SelectItem value="system">{t('general.theme.system')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="language">{t('general.language.label')}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t('general.language.description')}
                      </p>
                    </div>
                    <Select
                      value={settings.language}
                      onValueChange={value =>
                        updateSettings({ language: value as 'zh-CN' | 'en-US' })
                      }
                    >
                      <SelectTrigger id="language" className="w-40">
                        <SelectValue placeholder={t('general.language.placeholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="zh-CN">{t('common:language.zhCN')}</SelectItem>
                        <SelectItem value="en-US">{t('common:language.enUS')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'model' && <ModelPage />}

          {activeSection === 'rules' && <SkillsPage />}

          {activeSection === 'mcp' && <McpPage />}

          {activeSection !== 'general' &&
            activeSection !== 'model' &&
            activeSection !== 'rules' &&
            activeSection !== 'mcp' && (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">
                  {sections.find(s => s.id === activeSection)?.name} {t('common:pageContent')}
                </p>
              </div>
            )}
        </ScrollArea>
      </div>
    </div>
  )
}
