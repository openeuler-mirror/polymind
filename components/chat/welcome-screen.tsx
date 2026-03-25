'use client'

import {
  Code2,
  FileSearch,
  Lightbulb,
  MessageSquare,
  Sparkles,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

interface WelcomeScreenProps {
  onSendMessage: (content: string) => void
}

const suggestions = [
  {
    icon: Code2,
    title: '编写代码',
    description: '帮我写一个 React 组件',
    prompt: '帮我写一个带有动画效果的 React 卡片组件，支持悬停交互',
  },
  {
    icon: FileSearch,
    title: '分析文件',
    description: '解读文档或代码',
    prompt: '请帮我分析一下代码的性能瓶颈和优化建议',
  },
  {
    icon: Lightbulb,
    title: '头脑风暴',
    description: '激发创意想法',
    prompt: '帮我想一些关于 AI 产品的创新想法',
  },
  {
    icon: Zap,
    title: '快速问答',
    description: '获取即时解答',
    prompt: 'TypeScript 中 interface 和 type 有什么区别？',
  },
]

export function WelcomeScreen({ onSendMessage }: WelcomeScreenProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4">
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Sparkles className="h-8 w-8 text-primary" />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-balance">欢迎使用 PolyMind</h1>
        <p className="max-w-md text-muted-foreground text-balance">
          我是您的 AI 助手，可以帮助您编写代码、分析文件、回答问题等。
          选择下方建议或直接输入您的问题开始对话。
        </p>
      </div>

      <div className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
        {suggestions.map((suggestion) => (
          <Button
            key={suggestion.title}
            variant="outline"
            className="h-auto flex-col items-start gap-2 p-4 text-left hover:bg-accent/50"
            onClick={() => onSendMessage(suggestion.prompt)}
          >
            <div className="flex items-center gap-2">
              <suggestion.icon className="h-4 w-4 text-primary" />
              <span className="font-medium">{suggestion.title}</span>
            </div>
            <span className="text-sm text-muted-foreground">
              {suggestion.description}
            </span>
          </Button>
        ))}
      </div>

      <div className="mt-8 flex items-center gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <MessageSquare className="h-4 w-4" />
          <span>支持多轮对话</span>
        </div>
        <div className="h-1 w-1 rounded-full bg-muted-foreground/50" />
        <div className="flex items-center gap-1.5">
          <Code2 className="h-4 w-4" />
          <span>代码高亮</span>
        </div>
        <div className="h-1 w-1 rounded-full bg-muted-foreground/50" />
        <div className="flex items-center gap-1.5">
          <FileSearch className="h-4 w-4" />
          <span>文件处理</span>
        </div>
      </div>
    </div>
  )
}
