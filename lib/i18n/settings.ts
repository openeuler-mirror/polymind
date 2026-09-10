export const languages = ['zh-CN', 'en-US'] as const

export type Language = (typeof languages)[number]

export const fallbackLanguage: Language = 'zh-CN'

export const defaultNamespace = 'common'

/**
 * 按功能模块划分的命名空间。新增模块时在此注册，
 * 并同步在 locales/<lang>/ 下添加同名 JSON 文件。
 */
export const namespaces = [
  'common',
  'settings',
  'chat',
  'tool-panel',
  'artifact',
] as const

export type Namespace = (typeof namespaces)[number]
