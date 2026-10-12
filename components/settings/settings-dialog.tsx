'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings, Cpu, Sun, Moon, Monitor } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'
import type { SettingsSectionId } from '@/lib/stores/ui-store'
import { useThemeWithStore } from '@/components/theme-provider'
import { ModelPage } from './model/model-page'

const SECTIONS = [
  { id: 'general', i18nKey: 'nav.general', icon: Settings },
  { id: 'model', i18nKey: 'nav.model', icon: Cpu },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

const THEME_OPTIONS = [
  { value: 'light', i18nKey: 'general.theme.light', icon: Sun },
  { value: 'dark', i18nKey: 'general.theme.dark', icon: Moon },
  { value: 'system', i18nKey: 'general.theme.system', icon: Monitor },
] as const

/**
 * 设置弹窗（替代原右侧面板内的设置页）。
 * 只保留 通用 / 模型 两个 section；account / agent / about 占位、skills / mcp
 * 已分别删除或迁为右侧面板一等 tab。
 * 入口：侧边栏 footer、chat-header 下拉、业务页「去配置模型」（openSettingsDialog('model')）。
 */
export function SettingsDialog() {
  const { t } = useTranslation('settings')
  const {
    settings,
    updateSettings,
    isSettingsDialogOpen,
    closeSettingsDialog,
    settingsActiveSection,
    setSettingsActiveSection,
  } = useChatStore()
  const { setTheme } = useThemeWithStore()

  const [localActiveSection, setLocalActiveSection] = useState<SectionId>('general')

  // settingsActiveSection 是一次性定位信号：渲染期把它消费到本地 state（React 推荐模式，
  // 避免 effect 里 setState 触发级联渲染），effect 仅负责清空 store 信号。
  const [prevSection, setPrevSection] = useState<SettingsSectionId | null>(settingsActiveSection)
  if (settingsActiveSection !== prevSection) {
    setPrevSection(settingsActiveSection)
    if (settingsActiveSection) setLocalActiveSection(settingsActiveSection)
  }
  useEffect(() => {
    if (settingsActiveSection) setSettingsActiveSection(null)
  }, [settingsActiveSection, setSettingsActiveSection])

  const activeSection = localActiveSection

  return (
    <Dialog
      open={isSettingsDialogOpen}
      onOpenChange={open => {
        if (!open) closeSettingsDialog()
      }}
    >
      <DialogContent className="flex h-[min(760px,92vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[680px]">
        {/* Header：只留标题 + 关闭（无「打开配置文件」概念），不用分割线 */}
        <div className="flex h-14 shrink-0 items-center px-6">
          <DialogTitle>{t('dialog.title')}</DialogTitle>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Section Nav */}
          <div className="w-44 shrink-0 px-3 pb-4">
            <nav className="space-y-1">
              {SECTIONS.map(section => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setLocalActiveSection(section.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    activeSection === section.id
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'hover:bg-sidebar-accent/50'
                  )}
                >
                  <section.icon className="h-4 w-4" />
                  <span>{t(section.i18nKey)}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <ScrollArea className="min-h-0 flex-1">
            <div className="px-2 pb-8 pr-6 pt-1">
              {activeSection === 'general' && (
                <div className="space-y-7">
                  {/* 语言 */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{t('general.language.label')}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('general.language.description')}
                      </p>
                    </div>
                    <Select
                      value={settings.language}
                      onValueChange={value =>
                        updateSettings({ language: value as 'zh-CN' | 'en-US' })
                      }
                    >
                      <SelectTrigger id="language" className="w-36 shrink-0">
                        <SelectValue placeholder={t('general.language.placeholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="zh-CN">{t('common:language.zhCN')}</SelectItem>
                        <SelectItem value="en-US">{t('common:language.enUS')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 外观：三选一卡片（浅色 / 深色 / 跟随系统） */}
                  <div>
                    <p className="text-sm font-medium">{t('general.appearance')}</p>
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      {THEME_OPTIONS.map(option => {
                        const active = settings.theme === option.value
                        return (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setTheme(option.value)}
                            className={cn(
                              'flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-xs transition-colors',
                              active
                                ? 'border-primary bg-primary/5 text-primary'
                                : 'border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                            )}
                          >
                            <option.icon className="h-5 w-5" />
                            <span>{t(option.i18nKey)}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {activeSection === 'model' && <ModelPage />}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
}
