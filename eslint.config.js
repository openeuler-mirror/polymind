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
    // POLYMIND_BUILD_TARGET=static 的导出目录（desktop/build-renderer.mjs 的输入）。
    '.next-export/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'node_modules/**',
    'pnpm-lock.yaml',
    'packaging/**',
    'bin/**',
    '.agents/**',
    'components/ui/**',
    // desktop 下由脚本生成的产物 / 本地证据，不参与 lint
    'desktop/renderer/**',
    'desktop/dist/**',
    'desktop/poc-evidence/**',
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
  {
    // desktop/ 是 Electron 侧的独立小程序，**不是** Next 应用的一部分：
    //   · 主进程/预加载脚本是 Node CommonJS（require + module.exports），
    //     走 bundler 语境会刷一屏 @typescript-eslint/no-require-imports；
    //   · build-renderer.mjs / tools/*.mjs 是 ESM，按 module 解析。
    // 这里只声明"运行环境"，不额外加规则，避免 desktop 出现两套风格要求。
    files: ['desktop/**/*.js'],
    languageOptions: { sourceType: 'commonjs' },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['desktop/**/*.mjs'],
    languageOptions: { sourceType: 'module' },
  },
  prettierConfig,
])

export default eslintConfig
