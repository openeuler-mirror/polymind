'use client'

import type { ComponentProps } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import 'katex/dist/katex.min.css'
import { markdownSanitizeSchema } from '@/lib/markdown-sanitize'

type MarkdownComponents = NonNullable<ComponentProps<typeof ReactMarkdown>['components']>

/**
 * 对话正文 / 产物预览共用的 Markdown 渲染器（统一插件管线与排版标度）。
 *
 * 排版标度是单一来源：正文/标题/间距/表格/引用等都在此定义，产物预览展开
 * baseComponents 后只覆盖差异项，避免两处漂移。行高由最外层容器统一 1.75。
 */
export const baseComponents: MarkdownComponents = {
  h1: ({ children }) => (
    <h1 className="mt-6 mb-3 text-2xl font-bold tracking-tight first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-6 mb-2.5 text-xl font-semibold tracking-tight first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-5 mb-2 text-lg font-semibold tracking-tight first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-4 mb-1.5 text-base font-semibold first:mt-0">{children}</h4>
  ),
  p: ({ children }) => <p className="my-3 text-[15px] first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="my-3 list-disc space-y-1.5 pl-5 marker:text-muted-foreground/70">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 list-decimal space-y-1.5 pl-5 marker:text-muted-foreground/70">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="text-[15px]">{children}</li>,
  code: ({ className, children, ...props }) => {
    const isInline = !className
    if (isInline) {
      return (
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]" {...props}>
          {children}
        </code>
      )
    }
    return null
  },
  blockquote: ({ children }) => (
    <blockquote className="my-3.5 border-l-2 border-border pl-4 text-muted-foreground [&>p]:my-0">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-primary underline underline-offset-2 hover:text-primary/80"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-border">
      <table className="min-w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
  th: ({ children }) => <th className="px-3 py-2 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-t border-border/60 px-3 py-2">{children}</td>,
  hr: () => <hr className="my-6 border-border" />,
  img: ({ src, alt }) => (
    <img src={src} alt={alt} className="my-3 max-w-full rounded-lg" loading="lazy" />
  ),
}

export interface MarkdownContentProps {
  content: string
  components?: MarkdownComponents
}

export function MarkdownContent({ content, components }: MarkdownContentProps) {
  return (
    <div className="leading-[1.75]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, markdownSanitizeSchema], rehypeKatex]}
        components={{ ...baseComponents, ...components }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
