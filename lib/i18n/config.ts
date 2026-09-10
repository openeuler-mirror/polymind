import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import {
  defaultNamespace,
  fallbackLanguage,
  languages,
  namespaces,
  type Language,
  type Namespace,
} from './settings'

/**
 * 静态导入所有语言资源。使用 `import.meta.glob` 之外的显式导入，
 * 让打包器能静态分析并在构建期产出对应的 chunk。
 */
import zhCNCommon from '@/locales/zh-CN/common.json'
import zhCNSettings from '@/locales/zh-CN/settings.json'
import zhCNChat from '@/locales/zh-CN/chat.json'
import zhCNToolPanel from '@/locales/zh-CN/tool-panel.json'
import zhCNArtifact from '@/locales/zh-CN/artifact.json'

import enUSCommon from '@/locales/en-US/common.json'
import enUSSettings from '@/locales/en-US/settings.json'
import enUSChat from '@/locales/en-US/chat.json'
import enUSToolPanel from '@/locales/en-US/tool-panel.json'
import enUSArtifact from '@/locales/en-US/artifact.json'

const resources = {
  'zh-CN': {
    common: zhCNCommon,
    settings: zhCNSettings,
    chat: zhCNChat,
    'tool-panel': zhCNToolPanel,
    artifact: zhCNArtifact,
  },
  'en-US': {
    common: enUSCommon,
    settings: enUSSettings,
    chat: enUSChat,
    'tool-panel': enUSToolPanel,
    artifact: enUSArtifact,
  },
} as const

// 防止 Next.js 热更新时重复初始化
if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: fallbackLanguage,
    fallbackLng: fallbackLanguage,
    supportedLngs: languages as unknown as string[],
    defaultNS: defaultNamespace,
    ns: namespaces as unknown as string[],
    interpolation: {
      // React 已负责转义，避免二次转义
      escapeValue: false,
    },
    returnNull: false,
    react: {
      useSuspense: false,
    },
  })
}

export default i18n

export type { Language, Namespace }
