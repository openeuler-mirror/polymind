'use client'

import { useTheme } from '@/components/theme-provider'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/cjs/styles/prism'
import { cn } from '@/lib/utils'
import type { Artifact } from '@/lib/types'
import { resolveCodeLanguage } from '@/lib/artifacts'
import { useArtifactTextContent, PreviewLoading } from './artifact-common'

export function CodePreview({ artifact, agentId }: { artifact: Artifact; agentId?: string }) {
  const { resolvedTheme } = useTheme()
  const { text: code, loading } = useArtifactTextContent(artifact, agentId)
  const language = resolveCodeLanguage('', artifact.name)

  const isDark = resolvedTheme === 'dark'
  const containerBg = isDark ? 'bg-[#282c34]' : 'bg-white'

  if (loading) return <PreviewLoading />

  return (
    <div className={cn('group relative h-full overflow-hidden', containerBg)}>
      <div className="h-full overflow-auto">
        <SyntaxHighlighter
          language={language}
          style={isDark ? oneDark : oneLight}
          showLineNumbers
          lineNumberStyle={{
            minWidth: '3.25em',
            paddingRight: '1.25em',
            paddingLeft: '1em',
            textAlign: 'right',
            color: isDark ? '#6b7280' : '#94a3b8',
            userSelect: 'none',
          }}
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
