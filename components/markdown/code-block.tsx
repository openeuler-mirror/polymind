'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy } from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism'
import { cn } from '@/lib/utils'

interface CodeBlockProps {
  code: string
  language?: string
  showLineNumbers?: boolean
  /** 只读场景（如产物预览）可关掉右上角复制按钮 */
  showCopy?: boolean
  className?: string
}

/** 代码块统一渲染：深色主题 + 语言标签 + 可选复制按钮，对话正文与产物预览共用。 */
export function CodeBlock({
  code,
  language,
  showLineNumbers = false,
  showCopy = true,
  className,
}: CodeBlockProps) {
  const { t } = useTranslation('chat')
  const [copied, setCopied] = useState(false)
  const displayLanguage = language || 'text'

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy code:', err)
    }
  }

  return (
    <div className={cn('group relative overflow-hidden rounded-lg bg-[#282c34]', className)}>
      <div className="flex items-center justify-between border-b border-gray-700 bg-[#21252b] px-4 py-2">
        <span className="text-xs font-medium uppercase text-gray-400">{displayLanguage}</span>
        {showCopy && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" />
                <span>{t('message.codeBlock.copied')}</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>{t('message.codeBlock.copy')}</span>
              </>
            )}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <SyntaxHighlighter
          language={displayLanguage}
          style={oneDark}
          showLineNumbers={showLineNumbers}
          customStyle={{
            margin: 0,
            padding: '1rem',
            background: 'transparent',
            fontSize: '0.875rem',
            lineHeight: '1.5',
          }}
          codeTagProps={{
            style: { fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace' },
          }}
          wrapLines
          wrapLongLines
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  )
}
