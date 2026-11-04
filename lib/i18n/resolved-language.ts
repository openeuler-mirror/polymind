import { useTranslation } from 'react-i18next'

import i18n from './config'
import { fallbackLanguage } from './settings'

/** 当前解析后的界面语言；i18n 初始化完成前回退到默认语言。 */
export function getResolvedLanguage(): string {
  return i18n.resolvedLanguage ?? fallbackLanguage
}

export function useResolvedLanguage(): string {
  const { i18n: instance } = useTranslation()
  return instance.resolvedLanguage ?? fallbackLanguage
}
