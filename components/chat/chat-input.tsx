'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Send,
  Paperclip,
  Mic,
  Plus,
  Image as ImageIcon,
  X,
  FileText,
  StopCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'
import { useScheduledTaskStore } from '@/lib/stores/scheduled-task-store'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { AgentSkill } from '@/lib/types'
import { skillService } from '@/services/skill-service'
import { AgentSelector } from './agent-selector'
import { useToast } from '@/hooks/use-toast'

const models = [
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
  { id: 'claude-3-opus', name: 'Claude 3 Opus', provider: 'Anthropic' },
  { id: 'gemini-pro', name: 'Gemini Pro', provider: 'Google' },
  { id: 'llama-3', name: 'Llama 3 70B', provider: 'Meta' },
]

interface ChatInputProps {
  onSend: (content: string, attachments?: File[]) => void
}

export function ChatInput({ onSend }: ChatInputProps) {
  const { t } = useTranslation('chat')
  const { toast } = useToast()
  const [skills, setSkills] = useState<AgentSkill[]>([])
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isComposing, setIsComposing] = useState(false)
  const [showSkillSelector, setShowSkillSelector] = useState(false)
  const [selectedSkillIndex, setSelectedSkillIndex] = useState(0)

  const { currentConversationId, conversations, stopStreaming, currentAgentId } = useChatStore()
  const refreshScheduled = useScheduledTaskStore(s => s.refresh)

  const fetchSkills = useCallback(async () => {
    if (!currentAgentId) {
      setSkills([])
      return
    }
    try {
      const installedSkills = await skillService.listInstalledSkills(currentAgentId)
      const mappedSkills: AgentSkill[] = installedSkills.map(skill => ({
        name: skill.skill_name,
        description:
          typeof skill.metadata?.description === 'string' ? skill.metadata.description : '',
        filePath: skill.relative_path || '',
        source: skill.source_type || skill.skill_source || '',
      }))
      // 按 name 去重
      const uniqueSkills = Array.from(
        new Map(mappedSkills.map(skill => [skill.name, skill])).values()
      )
      setSkills(uniqueSkills)
    } catch (error) {
      console.error('Failed to fetch skills:', error)
      setSkills([])
    }
  }, [currentAgentId])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const skillListRef = useRef<HTMLDivElement>(null)
  const currentConversation = conversations.find(conv => conv.id === currentConversationId)
  const isStreaming = currentConversation?.isStreaming ?? false

  const slashCommandQuery = useMemo(() => {
    const match = input.match(/(?:^|\s)\/([a-zA-Z0-9-_]*)$/)
    if (!match) {
      return null
    }
    return match[1]
  }, [input])

  const filteredSkills = useMemo(() => {
    if (slashCommandQuery === null) {
      return []
    }
    const keyword = slashCommandQuery.trim().toLowerCase()
    if (!keyword) {
      return skills
    }
    return skills.filter(skill => skill.name.toLowerCase().startsWith(keyword))
  }, [skills, slashCommandQuery])

  // 监听输入内容变化，检测是否输入了 "/" 命令并按前缀筛选
  useEffect(() => {
    if (slashCommandQuery !== null) {
      // 输入 "/" 时即时刷新一次已安装技能，确保刚安装的技能能立刻显示。
      if (slashCommandQuery.length === 0) {
        void fetchSkills()
      }
      setShowSkillSelector(true)
      setSelectedSkillIndex(0) // 打开时默认选中第一个
    } else {
      setShowSkillSelector(false)
    }
  }, [fetchSkills, slashCommandQuery])

  // 键盘导航时自动将选中项滚动到可见区域
  useEffect(() => {
    if (skillListRef.current) {
      const item = skillListRef.current.querySelector(`[data-index="${selectedSkillIndex}"]`)
      item?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedSkillIndex])

  // 处理选择skill
  const handleSelectSkill = useCallback((skill: AgentSkill) => {
    setShowSkillSelector(false)
    // 将当前正在输入的 /xxx 片段替换为完整 skill 名，后面加空格方便继续输入
    setInput(prev => prev.replace(/(?:^|\s)\/[a-zA-Z0-9-_]*$/, ` /${skill.name} `).trimStart())
    // 聚焦输入框，方便用户继续输入
    setTimeout(() => {
      textareaRef.current?.focus()
    }, 50)
  }, [])

  // 渲染带高亮的内容，匹配/skill_name格式
  const renderHighlightedContent = useCallback(
    (content: string) => {
      // 匹配/开头，后面跟技能名，用非捕获分组避免分割后丢失内容
      const parts = content.split(/(\/[a-zA-Z0-9-_]+)/g)
      return parts.map((part, index) => {
        // 检查是否是存在的技能名
        if (part.startsWith('/') && skills.some(skill => `/${skill.name}` === part)) {
          return (
            <span key={index} className="bg-primary/15 rounded-xs inline px-0.5">
              {part}
            </span>
          )
        }
        return <span key={index}>{part}</span>
      })
    },
    [skills]
  )

  const handleSubmit = useCallback(() => {
    const trimmedInput = input.trim()
    if (!trimmedInput && attachments.length === 0) return
    if (isStreaming) return
    if (!currentAgentId) return

    onSend(trimmedInput, attachments.length > 0 ? attachments : undefined)
    setInput('')
    setAttachments([])
  }, [input, attachments, isStreaming, onSend, currentAgentId])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 当技能选择器显示时，手动处理键盘导航
    if (showSkillSelector) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (filteredSkills.length === 0) return
        setSelectedSkillIndex(prev => Math.min(prev + 1, filteredSkills.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (filteredSkills.length === 0) return
        setSelectedSkillIndex(prev => Math.max(prev - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const selectedSkill = filteredSkills[selectedSkillIndex]
        if (selectedSkill) {
          handleSelectSkill(selectedSkill)
        }
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
    setAttachments(prev => [...prev, ...newFiles])
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
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  // 普通聊天输入模式
  return (
    <div className="mx-auto w-full max-w-4xl">
      {/* Input Area */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          'relative rounded-2xl border bg-card shadow-sm transition-all',
          isDragging ? 'border-primary border-dashed bg-primary/5' : 'border-border',
          'focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20'
        )}
      >
        {/* Attachments Preview：显示在输入框内部（光标上方） */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {attachments.map((file, index) => (
              <AttachmentPreview
                key={`${file.name}-${index}`}
                file={file}
                onRemove={() => removeAttachment(index)}
              />
            ))}
          </div>
        )}

        {/* Skill选择器 - 绝对定位悬浮在上方，不占用高度，完全手动实现避免组件内置逻辑冲突 */}
        {showSkillSelector && (
          <div className="absolute bottom-full left-0 right-0 px-4 pb-2 z-50">
            <div className="rounded-lg border shadow-md bg-popover text-popover-foreground">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                {t('input.skills.available')}
              </div>
              <div ref={skillListRef} className="max-h-64 overflow-y-auto p-1 scrollbar-thin">
                {filteredSkills.map((skill, index) => (
                  <div
                    key={skill.name}
                    data-index={index}
                    onClick={() => handleSelectSkill(skill)}
                    onMouseEnter={() => setSelectedSkillIndex(index)}
                    className={`flex items-center py-2 px-2 rounded-sm cursor-default text-sm ${index === selectedSkillIndex ? 'bg-accent text-accent-foreground' : ''}`}
                  >
                    <span className="font-medium">/{skill.name}</span>
                  </div>
                ))}
                {filteredSkills.length === 0 && (
                  <div className="px-2 py-2 text-xs text-muted-foreground">
                    {t('input.skills.empty')}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {isDragging && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-primary/5">
            <div className="flex flex-col items-center gap-2 text-primary">
              <Paperclip className="h-8 w-8" />
              <span className="font-medium">{t('input.dropToAttach')}</span>
            </div>
          </div>
        )}

        <div className="relative min-h-[80px]">
          {/* 高亮显示层，和输入内容完全同步 */}
          {/* 高亮层必须与下方 Textarea 的 px-5 py-4 完全一致，否则技能高亮会相对正文错位 */}
          <div className="absolute inset-0 px-5 py-4 whitespace-pre-wrap break-words pointer-events-none z-10 text-transparent font-sans text-base leading-normal tracking-normal md:text-sm">
            {renderHighlightedContent(input)}
          </div>
          {/* 实际输入层，透明显示 */}
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            placeholder={t('input.placeholder')}
            className="min-h-[80px] max-h-[200px] resize-none border-0 bg-transparent px-5 py-4 focus-visible:ring-0 shadow-none relative z-20"
            disabled={isStreaming}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between px-3 py-1.5">
          {/* 左下角：仅保留一个 + 号按钮，用于上传图片或附件 */}
          <div className="flex items-center gap-1">
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    aria-label={t('input.uploadImageOrAttachment')}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isStreaming || attachments.length >= 5}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('input.uploadImageOrAttachment')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* 右下角：选择 Agent + 语音 + 发送（流式时切换为停止生成） */}
          <div className="flex items-center gap-2">
            {isStreaming ? (
              <Button
                variant="destructive"
                size="sm"
                className="gap-2"
                onClick={() => {
                  stopStreaming()
                  // 定时任务会话停止后立即刷新 run 状态，让卡片/侧栏的
                  // “执行中”标识马上消失，不用等 10s 轮询。
                  if (currentConversation?.scheduledTaskId) {
                    void refreshScheduled(true)
                  }
                }}
              >
                <StopCircle className="h-4 w-4" />
                {t('input.stopGenerating')}
              </Button>
            ) : (
              <TooltipProvider delayDuration={0}>
                <div className="flex items-center gap-2">
                  {/* 右下角选择 Agent */}
                  <AgentSelector compact />

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full"
                        aria-label={t('input.voiceInput')}
                        disabled={isStreaming}
                      >
                        <Mic className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('input.voiceInput')}</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Button
                          size="icon"
                          className="h-8 w-8"
                          onClick={handleSubmit}
                          disabled={!currentAgentId || (!input.trim() && attachments.length === 0)}
                        >
                          <Send className="h-4 w-4" />
                          <span className="sr-only">{t('input.send')}</span>
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {currentAgentId ? t('input.send') : t('input.selectAgentFirst')}
                    </TooltipContent>
                  </Tooltip>
                </div>
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
        onChange={e => handleFileSelect(e.target.files)}
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
  const { t } = useTranslation('chat')
  const isImage = file.type.startsWith('image/')
  const Icon = isImage ? ImageIcon : FileText

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // 生成文件类型标签：取扩展名并转大写（html -> HTML），无扩展名时退回 FILE
  const getTypeLabel = (name: string) => {
    const ext = name.split('.').pop()
    return ext && ext !== name ? ext.toUpperCase() : 'FILE'
  }

  return (
    <div className="group flex items-center gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex flex-col">
        <span className="max-w-[140px] truncate text-sm font-medium leading-tight">
          {file.name}
        </span>
        <span className="text-xs text-muted-foreground">
          {getTypeLabel(file.name)} · {formatSize(file.size)}
        </span>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('input.removeAttachment')}
        className="ml-1 rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground group-hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
