'use client'

import { useState, useRef, useCallback } from 'react'
import {
  Send,
  Paperclip,
  Mic,
  Image as ImageIcon,
  X,
  FileText,
  StopCircle,
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
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isComposing, setIsComposing] = useState(false)  // 检测中文输入法状态
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { isStreaming } = useChatStore()

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
    // 只有当输入法未激活时才响应 Enter 发送消息
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
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

        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder="输入消息，按 Enter 发送..."
          className="min-h-[60px] max-h-[200px] resize-none border-0 bg-transparent px-4 py-3 focus-visible:ring-0"
          disabled={isStreaming}
        />

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
            <Select defaultValue="gpt-4o">
              <SelectTrigger className="h-7 w-[120px] border-0 bg-transparent shadow-none hover:bg-accent dark:bg-transparent dark:hover:bg-accent/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {models.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    <div className="flex flex-col">
                      <span>{model.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {model.provider}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              {input.length > 0 && `${input.length} 字符`}
            </span>

            {isStreaming ? (
              <Button variant="destructive" size="sm" className="gap-2">
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
