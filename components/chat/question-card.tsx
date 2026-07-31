'use client'

import { useState, useEffect, useCallback } from 'react'
import { Check, MessageSquare, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { QuestionInfo } from '@/lib/types'

interface QuestionCardProps {
  question: QuestionInfo
  questionIndex: number
  disabled?: boolean
  onSelectionChange?: (index: number, selected: string[]) => void
}

export function QuestionCard({
  question,
  questionIndex,
  disabled = false,
  onSelectionChange,
}: QuestionCardProps) {
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set())
  const [customInput, setCustomInput] = useState('')
  const [expanded, setExpanded] = useState(true)

  const isMultiple = question.multiple ?? false
  const canCustom = question.custom ?? false

  const getSelectedArray = useCallback(() => {
    const selected = Array.from(selectedOptions)
    if (canCustom && customInput.trim()) {
      selected.push(customInput.trim())
    }
    return selected
  }, [selectedOptions, customInput, canCustom])

  // 通知父组件选择变化
  useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange(questionIndex, getSelectedArray())
    }
  }, [selectedOptions, customInput, questionIndex, onSelectionChange, getSelectedArray])

  const handleToggleOption = (label: string) => {
    if (disabled) return
    setSelectedOptions(prev => {
      const next = new Set(prev)
      if (next.has(label)) {
        next.delete(label)
      } else {
        if (!isMultiple) {
          next.clear()
        }
        next.add(label)
      }
      return next
    })
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border transition-all',
        disabled ? 'border-border/50 bg-card/50' : 'border-accent/30 bg-accent/[0.03]'
      )}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-accent/[0.03]"
      >
        <MessageSquare className="h-4 w-4 shrink-0 text-accent" />
        <span className="font-medium text-sm text-foreground/90">
          {question.header || '请选择'}
        </span>
        {disabled && <span className="ml-auto text-xs text-muted-foreground">已提交</span>}
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform',
            expanded && 'rotate-180'
          )}
        />
      </button>

      {/* Body */}
      {expanded && (
        <div className="border-t border-border/50 px-4 py-3 space-y-3">
          {/* Question text */}
          {question.question && (
            <p className="text-sm text-foreground/80 leading-relaxed">{question.question}</p>
          )}

          {/* Options list */}
          {question.options.length > 0 && (
            <div className="space-y-1.5">
              {question.options.map((option, idx) => {
                const isSelected = selectedOptions.has(option.label)
                return (
                  <button
                    key={`opt-${questionIndex}-${idx}`}
                    onClick={() => handleToggleOption(option.label)}
                    disabled={disabled}
                    className={cn(
                      'w-full rounded-xl border px-3.5 py-2.5 text-left transition-all text-sm',
                      'hover:border-accent/50 hover:bg-accent/[0.04]',
                      'disabled:cursor-not-allowed disabled:opacity-60',
                      isSelected
                        ? 'border-accent bg-accent/[0.06] ring-1 ring-accent/20'
                        : 'border-border/60 bg-card/80'
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className={cn(
                          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors',
                          isSelected ? 'border-accent bg-accent' : 'border-muted-foreground/40'
                        )}
                      >
                        {isSelected && (
                          <Check className="h-3 w-3 text-accent-foreground" strokeWidth={3} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div
                          className={cn(
                            'text-sm font-medium',
                            isSelected ? 'text-foreground' : 'text-foreground/80'
                          )}
                        >
                          {option.label}
                        </div>
                        {option.description && (
                          <div className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                            {option.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Custom input for custom questions */}
          {canCustom && (
            <div className="space-y-1.5">
              <input
                type="text"
                value={customInput}
                onChange={e => setCustomInput(e.target.value)}
                placeholder="输入自定义答案..."
                disabled={disabled}
                className={cn(
                  'w-full rounded-xl border border-border/60 bg-card/80 px-3.5 py-2 text-sm',
                  'placeholder:text-muted-foreground/50',
                  'focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/20',
                  'disabled:cursor-not-allowed disabled:opacity-60'
                )}
              />
            </div>
          )}

          {/* Selection count indicator */}
          {!disabled && selectedOptions.size > 0 && (
            <div className="text-xs text-muted-foreground">
              已选 {selectedOptions.size} 项
              {canCustom && customInput.trim() ? '（含自定义答案）' : ''}
            </div>
          )}

          {/* Disabled — show what was selected */}
          {disabled && selectedOptions.size > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
              <Check className="h-3.5 w-3.5 text-green-500" />
              <span>已选择：</span>
              <span className="font-medium text-foreground/80">
                {Array.from(selectedOptions).join(', ')}
                {canCustom && customInput.trim() ? `, ${customInput.trim()}` : ''}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
