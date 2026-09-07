import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettierConfig from 'eslint-config-prettier'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'node_modules/**',
    'pnpm-lock.yaml',
    'packaging/**',
    'bin/**',
    '.agents/**',
    'components/ui/**',
    '**/*.md',
    '**/*.yml',
    '**/*.yaml',
  ]),
  {
    // 显式注册插件：flat config 中规则与插件需在同一配置对象（或可合并解析），
    // 且 pnpm 非提升布局下必须作为直接依赖导入。
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    rules: {
      // 存量项目策略：先 warn 不阻断，历史问题分批治理后逐步转 error
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      '@next/next/no-img-element': 'warn',
      'react/no-unescaped-entities': 'warn',
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
    },
  },
  prettierConfig,
])

export default eslintConfig
