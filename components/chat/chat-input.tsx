'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Send,
  Paperclip,
  Mic,
  Image as ImageIcon,
  X,
  FileText,
  StopCircle,
  Check,
  ChevronsUpDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import type { AgentSkill } from '@/lib/types'
import { agentService } from '@/services/agent-service'

const models = [
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
  { id: 'claude-3-opus', name: 'Claude 3 Opus', provider: 'Anthropic' },
  { id: 'gemini-pro', name: 'Gemini Pro', provider: 'Google' },
  { id: 'llama-3', name: 'Llama 3 70B', provider: 'Meta' },
]



// 预设提示词接口
export interface PromptSuggestion {
  id: string
  icon?: React.ElementType
  title: string
  description?: string
  prompt: string
}

interface ChatInputProps {
  onSend: (content: string, attachments?: File[]) => void
  presetPrompts?: PromptSuggestion[]
  onRemovePresetPrompt?: (promptId: string) => void
  onClearPresetPrompts?: () => void
}

export function ChatInput({ onSend, presetPrompts = [], onRemovePresetPrompt, onClearPresetPrompts }: ChatInputProps) {
  const [skills, setSkills] = useState<AgentSkill[]>([])
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isComposing, setIsComposing] = useState(false)  // 检测中文输入法状态
  const [showSkillSelector, setShowSkillSelector] = useState(false)
  const [selectedSkillIndex, setSelectedSkillIndex] = useState(0) // 手动记录选中的技能索引

  // 从接口获取skill列表数据
  useEffect(() => {
    const fetchSkills = async () => {
      try {
        const agents = await agentService.getAgents()
        // 合并所有Agent的skills并去重
        const allSkills = agents.flatMap(agent => agent.skills || [])
        // 按name去重
        const uniqueSkills = Array.from(new Map(allSkills.map(skill => [skill.name, skill])).values())
        setSkills(uniqueSkills)
      } catch (error) {
        console.error('Failed to fetch skills:', error)
      }
    }
    fetchSkills()
  }, [])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { currentConversationId, conversations, stopStreaming } = useChatStore()
  const currentConversation = conversations.find(conv => conv.id === currentConversationId)
  const isStreaming = currentConversation?.isStreaming ?? false

  // 监听输入内容变化，检测是否输入了/
  useEffect(() => {
    if (input.trim() === '/') {
      setShowSkillSelector(true)
      setSelectedSkillIndex(0) // 打开时默认选中第一个
    } else if (!input.endsWith('/')) {
      setShowSkillSelector(false)
    }
  }, [input])

  // 处理选择skill
  const handleSelectSkill = useCallback((skill: AgentSkill) => {
    setShowSkillSelector(false)
    // 将/skill_name 填入输入框，后面加空格方便用户继续输入
    setInput(`/${skill.name} `)
    // 聚焦输入框，方便用户继续输入
    setTimeout(() => {
      textareaRef.current?.focus()
    }, 50)
  }, [])

  // 渲染带高亮的内容，匹配/skill_name格式
  const renderHighlightedContent = useCallback((content: string) => {
    // 匹配/开头，后面跟技能名，用非捕获分组避免分割后丢失内容
    const parts = content.split(/(\/[a-zA-Z0-9-_]+)/g)
    return parts.map((part, index) => {
      // 检查是否是存在的技能名
      if (part.startsWith('/') && skills.some(skill => `/${skill.name}` === part)) {
        return <span key={index} className="bg-primary/15 rounded-xs inline px-0.5">{part}</span>
      }
      return <span key={index}>{part}</span>
    })
  }, [skills])

  const handleSubmit = useCallback(() => {
    const trimmedInput = input.trim()
    if (!trimmedInput && attachments.length === 0 && presetPrompts.length === 0) return
    if (isStreaming) return

    // 将预设提示词的内容添加到消息中
    let finalContent = trimmedInput
    if (presetPrompts.length > 0) {
      const presetContent = presetPrompts.map((p) => p.prompt).join('\n\n')
      finalContent = trimmedInput 
        ? `${presetContent}\n\n${trimmedInput}`
        : presetContent
    }

    onSend(finalContent, attachments.length > 0 ? attachments : undefined)
    setInput('')
    setAttachments([])
    onClearPresetPrompts?.()
  }, [input, attachments, presetPrompts, isStreaming, onSend, onClearPresetPrompts])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 当技能选择器显示时，手动处理键盘导航
    if (showSkillSelector) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedSkillIndex(prev => Math.min(prev + 1, skills.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedSkillIndex(prev => Math.max(prev - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        handleSelectSkill(skills[selectedSkillIndex])
        return
      }
    }

    // 退格键一键删除整个技能名
    if (e.key === 'Backspace' && !isComposing && textareaRef.current) {
      const { selectionStart, selectionEnd, value } = textareaRef.current
      // 只有没有选中文本时才处理
      if (selectionStart === selectionEnd) {
        const pos = selectionStart
        // 向前查找/的位置
        let i = pos
        while (i > 0 && value[i - 1] !== '/') {
          i--
        }
        if (i > 0) {
          // 截取技能部分，去掉末尾空格
          const skillStr = value.slice(i - 1, pos).trimEnd()
          // 检查是否是有效的技能名
          if (skills.some(skill => `/${skill.name}` === skillStr)) {
            e.preventDefault()
            // 删除整个技能部分，包括后面的空格
            const newValue = value.slice(0, i - 1) + value.slice(pos)
            setInput(newValue)
            // 光标定位到删除后的位置
            setTimeout(() => {
              textareaRef.current?.setSelectionRange(i - 1, i - 1)
            }, 0)
            return
          }
        }
      }
    }
    
    // 只有当输入法未激活时才响应 Enter 发送消息
    if (e.key === 'Enter' && !e.shiftKey && !isComposing && !showSkillSelector) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // 处理输入法组合开始（开始输入中文）
  const handleCompositionStart = (e: React.CompositionEvent) => {
    setIsComposing(true)
  }

  // 处理输入法组合结束（完成输入中文或切换到英文）
  const handleCompositionEnd = (e: React.CompositionEvent) => {
    setIsComposing(false)
  }

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return
    const newFiles = Array.from(files).slice(0, 5 - attachments.length)
    setAttachments((prev) => [...prev, ...newFiles])
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFileSelect(e.dataTransfer.files)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <div className="mx-auto max-w-4xl">
      {/* Attachments Preview */}
      {attachments.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {attachments.map((file, index) => (
            <AttachmentPreview
              key={`${file.name}-${index}`}
              file={file}
              onRemove={() => removeAttachment(index)}
            />
          ))}
        </div>
      )}

      {/* Input Area */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            'relative rounded-2xl border bg-card transition-all',
            isDragging
              ? 'border-primary border-dashed bg-primary/5'
              : 'border-border',
            'focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20'
          )}
        >
          {/* Skill选择器 - 绝对定位悬浮在上方，不占用高度，完全手动实现避免组件内置逻辑冲突 */}
            {showSkillSelector && (
              <div className="absolute bottom-full left-0 right-0 px-4 pb-2 z-50">
                <div className="rounded-lg border shadow-md bg-popover text-popover-foreground">
                  <div className="p-1">
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">可用技能</div>
                    {skills.map((skill, index) => (
                      <div
                        key={skill.name}
                        onClick={() => handleSelectSkill(skill)}
                        className={`flex items-center py-2 px-2 rounded-sm cursor-default text-sm ${index === selectedSkillIndex ? 'bg-accent text-accent-foreground' : ''}`}
                      >
                        <span className="font-medium">/{skill.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
        {isDragging && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-primary/5">
            <div className="flex flex-col items-center gap-2 text-primary">
              <Paperclip className="h-8 w-8" />
              <span className="font-medium">放开以添加文件</span>
            </div>
          </div>
        )}

        {/* 预设提示词标签 */}
        {presetPrompts.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {presetPrompts.map((prompt) => (
              <div
                key={prompt.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-sm text-primary"
              >
                <span className="font-medium">{prompt.title}</span>
                <button
                  onClick={() => onRemovePresetPrompt?.(prompt.id)}
                  className="ml-1 rounded-full p-0.5 hover:bg-primary/20"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}



        <div className="relative min-h-[60px]">
          {/* 高亮显示层，和输入内容完全同步 */}
          <div className="absolute inset-0 px-4 py-3 whitespace-pre-wrap break-words pointer-events-none z-10 text-transparent font-sans text-base leading-normal tracking-normal md:text-sm">
            {renderHighlightedContent(input)}
          </div>
          {/* 实际输入层，透明显示 */}
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            placeholder='输入消息，按 Enter 发送，输入"/"获得更多技能'
            className="min-h-[60px] max-h-[200px] resize-none border-0 bg-transparent px-4 py-3 focus-visible:ring-0 relative z-20"
            disabled={isStreaming}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <div className="flex items-center gap-1">
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isStreaming || attachments.length >= 5}
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>添加附件</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={isStreaming}
                  >
                    <ImageIcon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>添加图片</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={isStreaming}
                  >
                    <Mic className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>语音输入</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="flex items-center gap-2">

            <span className="text-xs text-muted-foreground">
              {input.length > 0 && `${input.length} 字符`}
            </span>

            {isStreaming ? (
              <Button variant="destructive" size="sm" className="gap-2" onClick={stopStreaming}>
                <StopCircle className="h-4 w-4" />
                停止生成
              </Button>
            ) : (
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      className="h-8 w-8"
                      onClick={handleSubmit}
                      disabled={!input.trim() && attachments.length === 0}
                    >
                      <Send className="h-4 w-4" />
                      <span className="sr-only">发送</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>发送</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files)}
        accept="*/*"
      />

    </div>
  )
}

interface AttachmentPreviewProps {
  file: File
  onRemove: () => void
}

function AttachmentPreview({ file, onRemove }: AttachmentPreviewProps) {
  const isImage = file.type.startsWith('image/')
  const Icon = isImage ? ImageIcon : FileText

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="group relative flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <div className="flex flex-col">
        <span className="max-w-[120px] truncate text-sm font-medium">
          {file.name}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatSize(file.size)}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="absolute -right-2 -top-2 h-5 w-5 rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
        onClick={onRemove}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  )
}
