'use client'

import type { ComponentProps, ReactElement, ReactNode } from 'react'
import type { Artifact } from '@/lib/types'
import { resolveCodeLanguage } from '@/lib/artifacts'
import { MarkdownContent, baseComponents } from '@/components/markdown/markdown-content'
import { CodeBlock } from '@/components/markdown/code-block'
import { useArtifactTextContent, PreviewLoading } from './artifact-common'

type MarkdownComponents = NonNullable<ComponentProps<typeof MarkdownContent>['components']>

/** 产物预览：在共享排版之上只覆盖标题与引用块，其余复用 baseComponents。 */
const previewComponents: MarkdownComponents = {
  ...baseComponents,
  h1: ({ children }) => (
    <h1 className="mt-8 mb-4 text-3xl font-bold tracking-tight first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-7 mb-3 border-b border-border/60 pb-1.5 text-2xl font-semibold tracking-tight first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-6 mb-2 text-xl font-semibold tracking-tight first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => <h4 className="mt-5 mb-2 text-lg font-semibold first:mt-0">{children}</h4>,
  blockquote: ({ children }) => (
    <blockquote className="my-4 rounded-r-lg border-l-[3px] border-primary/40 bg-muted/40 py-2.5 pr-4 pl-4 text-[15px] text-muted-foreground [&>p]:my-0">
      {children}
    </blockquote>
  ),
  pre: ({ children }) => {
    // 语言取自 code 子节点 className；只读预览不展示复制按钮
    const child = children as ReactElement<{ className?: string; children?: ReactNode }>
    const codeElement = child?.props?.children
    const className = child?.props?.className || ''
    const language = resolveCodeLanguage(className)
    const code = typeof codeElement === 'string' ? codeElement : String(codeElement || '').trim()
    return <CodeBlock code={code} language={language} showCopy={false} className="my-4" />
  },
}

export function MarkdownPreview({ artifact, agentId }: { artifact: Artifact; agentId?: string }) {
  const { text, loading } = useArtifactTextContent(artifact, agentId)
  if (loading) return <PreviewLoading />
  return (
    <div className="px-5 py-4">
      <MarkdownContent content={text} components={previewComponents} />
    </div>
  )
}
