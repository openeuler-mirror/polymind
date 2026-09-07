'use client'

import type { ReactElement, ReactNode } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism'
import type { Artifact } from '@/lib/types'
import { resolveCodeLanguage } from '@/lib/artifacts'
import { MarkdownContent } from '@/components/markdown/markdown-content'
import { useArtifactTextContent, PreviewLoading } from './artifact-common'

export function MarkdownPreview({ artifact, agentId }: { artifact: Artifact; agentId?: string }) {
  const { text, loading } = useArtifactTextContent(artifact, agentId)
  if (loading) return <PreviewLoading />
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none p-4">
      <MarkdownContent
        content={text}
        components={{
          pre: ({ children }) => {
            // 产物的 markdown 代码块走统一高亮：语言取自 code 子节点的 className。
            const child = children as ReactElement<{ className?: string; children?: ReactNode }>
            const codeElement = child?.props?.children
            const className = child?.props?.className || ''
            const language = resolveCodeLanguage(className)
            const code =
              typeof codeElement === 'string' ? codeElement : String(codeElement || '').trim()
            return (
              <div className="group relative mb-2 overflow-hidden rounded-lg bg-[#282c34]">
                <div className="flex items-center justify-between bg-[#21252b] px-4 py-2">
                  <span className="text-xs font-medium uppercase text-gray-400">
                    {language || 'text'}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <SyntaxHighlighter
                    language={language || 'text'}
                    style={oneDark}
                    showLineNumbers={false}
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
          },
        }}
      />
    </div>
  )
}
