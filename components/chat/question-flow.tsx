'use client'

import { useEffect, useReducer, useCallback, useRef } from 'react'
import { Check, MessageSquare, ChevronLeft, ChevronRight, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { QuestionInfo } from '@/lib/types'

// Constants

const OTHER_LABEL = '其他'
const MAX_OTHER_CHARS = 500

// Reducer

interface QuestionFlowState {
  questionStep: number
  answersMap: Map<number, string[]>
  otherTextMap: Map<number, string>
  completed: boolean
  currentSelected: Set<string>
  currentOtherText: string
}

type QuestionFlowAction =
  | { type: 'TOGGLE_OPTION'; label: string; isMultiple: boolean }
  | { type: 'RECORD_AND_ADVANCE'; totalQuestions: number }
  | { type: 'SKIP_AND_ADVANCE'; totalQuestions: number }
  | { type: 'GO_TO_PREV'; totalQuestions: number }
  | { type: 'GO_TO_NEXT'; totalQuestions: number }
  | { type: 'SET_OTHER_TEXT'; value: string }
  | { type: 'RESET' }

function buildAnswer(selected: Set<string>, otherText: string): string[] {
  const items: string[] = []
  for (const item of selected) {
    if (item === OTHER_LABEL) {
      if (otherText.trim()) {
        items.push(otherText.trim())
      }
    } else {
      items.push(item)
    }
  }
  return items
}

function restoreForStep(
  answersMap: Map<number, string[]>,
  otherTextMap: Map<number, string>,
  step: number
): { currentSelected: Set<string>; currentOtherText: string } {
  const saved = answersMap.get(step) ?? []
  const otherText = otherTextMap.get(step) ?? ''
  const selected = new Set(saved)
  if (otherText) {
    selected.add(OTHER_LABEL)
  }
  return { currentSelected: selected, currentOtherText: otherText }
}

function recordCurrent(state: QuestionFlowState): {
  nextAnswers: Map<number, string[]>
  nextOtherTexts: Map<number, string>
} {
  const answer = buildAnswer(state.currentSelected, state.currentOtherText)
  const nextAnswers = new Map(state.answersMap)
  const nextOtherTexts = new Map(state.otherTextMap)

  if (state.currentOtherText.trim()) {
    nextOtherTexts.set(state.questionStep, state.currentOtherText.trim())
  } else {
    nextOtherTexts.delete(state.questionStep)
  }

  if (answer.length > 0) {
    nextAnswers.set(state.questionStep, answer)
  } else {
    nextAnswers.delete(state.questionStep)
  }

  return { nextAnswers, nextOtherTexts }
}

function questionFlowReducer(
  state: QuestionFlowState,
  action: QuestionFlowAction
): QuestionFlowState {
  switch (action.type) {
    case 'TOGGLE_OPTION': {
      const nextSelected = new Set(state.currentSelected)

      if (nextSelected.has(action.label)) {
        nextSelected.delete(action.label)
        if (action.label === OTHER_LABEL) {
          return { ...state, currentSelected: nextSelected, currentOtherText: '' }
        }
      } else {
        if (!action.isMultiple) {
          nextSelected.clear()
        }
        nextSelected.add(action.label)
      }
      return { ...state, currentSelected: nextSelected }
    }

    case 'RECORD_AND_ADVANCE': {
      const { nextAnswers, nextOtherTexts } = recordCurrent(state)
      const isLast = state.questionStep >= action.totalQuestions - 1
      if (isLast) {
        return {
          ...state,
          answersMap: nextAnswers,
          otherTextMap: nextOtherTexts,
          completed: true,
          currentSelected: new Set(),
          currentOtherText: '',
        }
      }
      const newStep = state.questionStep + 1
      return {
        ...state,
        answersMap: nextAnswers,
        otherTextMap: nextOtherTexts,
        questionStep: newStep,
        ...restoreForStep(nextAnswers, nextOtherTexts, newStep),
      }
    }

    case 'SKIP_AND_ADVANCE': {
      const nextAnswers = new Map(state.answersMap)
      const nextOtherTexts = new Map(state.otherTextMap)
      nextAnswers.delete(state.questionStep)
      nextOtherTexts.delete(state.questionStep)
      const isLast = state.questionStep >= action.totalQuestions - 1
      if (isLast) {
        return {
          ...state,
          answersMap: nextAnswers,
          otherTextMap: nextOtherTexts,
          completed: true,
          currentSelected: new Set(),
          currentOtherText: '',
        }
      }
      const newStep = state.questionStep + 1
      return {
        ...state,
        answersMap: nextAnswers,
        otherTextMap: nextOtherTexts,
        questionStep: newStep,
        ...restoreForStep(nextAnswers, nextOtherTexts, newStep),
      }
    }

    case 'GO_TO_PREV': {
      if (state.questionStep <= 0) return state
      const { nextAnswers, nextOtherTexts } = recordCurrent(state)
      const newStep = state.questionStep - 1
      return {
        ...state,
        answersMap: nextAnswers,
        otherTextMap: nextOtherTexts,
        completed: false,
        questionStep: newStep,
        ...restoreForStep(nextAnswers, nextOtherTexts, newStep),
      }
    }

    case 'GO_TO_NEXT': {
      const { nextAnswers, nextOtherTexts } = recordCurrent(state)
      if (state.questionStep >= action.totalQuestions - 1) {
        return { ...state, answersMap: nextAnswers, otherTextMap: nextOtherTexts, completed: true }
      }
      const newStep = state.questionStep + 1
      return {
        ...state,
        answersMap: nextAnswers,
        otherTextMap: nextOtherTexts,
        questionStep: newStep,
        ...restoreForStep(nextAnswers, nextOtherTexts, newStep),
      }
    }

    case 'SET_OTHER_TEXT': {
      const trimmed = action.value.slice(0, MAX_OTHER_CHARS)
      return { ...state, currentOtherText: trimmed }
    }

    case 'RESET':
      return {
        questionStep: 0,
        answersMap: new Map(),
        otherTextMap: new Map(),
        completed: false,
        currentSelected: new Set(),
        currentOtherText: '',
      }

    default:
      return state
  }
}

export interface QuestionFlowProps {
  questions: QuestionInfo[]
  questionId: string
  submitting: boolean
  submitError: string | null
  onSubmit: (answers: string[][]) => void
  onSkip: () => void
}

export function QuestionFlow({
  questions,
  questionId,
  submitting,
  submitError,
  onSubmit,
  onSkip,
}: QuestionFlowProps) {
  const [state, dispatch] = useReducer(questionFlowReducer, {
    questionStep: 0,
    answersMap: new Map(),
    otherTextMap: new Map(),
    completed: false,
    currentSelected: new Set<string>(),
    currentOtherText: '',
  })

  const totalQuestions = questions.length

  // 当 questionId 变化时重置
  const prevQuestionIdRef = useRef(questionId)
  const submittedRef = useRef(false)
  useEffect(() => {
    if (prevQuestionIdRef.current !== questionId) {
      prevQuestionIdRef.current = questionId
      submittedRef.current = false
      dispatch({ type: 'RESET' })
    }
  }, [questionId])

  // 组装最终答案并提交（幂等）
  const submitOnce = useCallback(() => {
    if (submittedRef.current) return
    submittedRef.current = true
    const answers: string[][] = []
    for (let i = 0; i < totalQuestions; i++) {
      answers.push(state.answersMap.get(i) ?? [])
    }
    onSubmit(answers)
  }, [state.answersMap, totalQuestions, onSubmit])

  // 全部题目处理完毕后自动提交
  useEffect(() => {
    if (state.completed) {
      submitOnce()
    }
  }, [state.completed, submitOnce])

  // 提交失败后允许重试
  useEffect(() => {
    if (submitError) {
      submittedRef.current = false
    }
  }, [submitError])

  const currentQuestion = questions[state.questionStep] ?? null
  const isMultiple = currentQuestion?.multiple ?? false
  const isLastStep = state.questionStep >= totalQuestions - 1
  const isFirstStep = state.questionStep === 0

  const hasCurrentAnswer =
    [...state.currentSelected].filter(s => s !== OTHER_LABEL).length > 0 ||
    (state.currentSelected.has(OTHER_LABEL) && state.currentOtherText.trim().length > 0)

  // 跟踪是否由用户点击选项触发（而非导航还原），避免返回上一题时自动跳回。
  // 此 effect 必须声明在自动前进 effect 之前，确保导航时 ref 先被置 true。
  const justNavigatedRef = useRef(false)
  const prevQuestionStepRef = useRef(state.questionStep)
  useEffect(() => {
    if (prevQuestionStepRef.current !== state.questionStep) {
      justNavigatedRef.current = true
      prevQuestionStepRef.current = state.questionStep
    }
  }, [state.questionStep])

  // 单选题自动前进（排除"其他"选项，因为需要先填写文本）
  useEffect(() => {
    if (!currentQuestion) return
    if (isMultiple) return

    const singleSelected = [...state.currentSelected].filter(s => s !== OTHER_LABEL)
    if (singleSelected.length === 0) return

    // 导航回已有答案的题目时不应自动跳转
    if (justNavigatedRef.current) {
      justNavigatedRef.current = false
      return
    }

    const timer = setTimeout(() => {
      // 二次检查：避免 setTimeout 回调执行时 tracking effect 已设置 ref
      if (justNavigatedRef.current) {
        justNavigatedRef.current = false
        return
      }
      dispatch({ type: 'RECORD_AND_ADVANCE', totalQuestions })
    }, 150)

    return () => clearTimeout(timer)
  }, [state.currentSelected, state.questionStep, isMultiple, totalQuestions, currentQuestion])

  const isMultipleRef = useRef(isMultiple)
  isMultipleRef.current = isMultiple

  const handleToggleOptionWithFlag = useCallback((label: string) => {
    justNavigatedRef.current = false
    dispatch({ type: 'TOGGLE_OPTION', label, isMultiple: isMultipleRef.current })
  }, [])

  if (!currentQuestion) return null

  const otherSelected = state.currentSelected.has(OTHER_LABEL)

  // 全部答完：自动提交中
  if (state.completed) {
    return (
      <div className="mx-auto max-w-4xl">
        {submitError && (
          <div className="mb-3 flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-600">
            <span>{submitError}</span>
            <Button size="sm" variant="ghost" onClick={submitOnce} className="h-7 text-xs">
              重试
            </Button>
          </div>
        )}
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-accent/30 bg-accent/[0.03] px-4 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          <span>已回答完毕，正在提交...</span>
        </div>
      </div>
    )
  }

  // 逐题回答视图
  return (
    <div className="mx-auto max-w-4xl">
      {submitError && (
        <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-600">
          {submitError}
        </div>
      )}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.06]">
        {/* 问题导航头部 */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100">
          <MessageSquare className="h-4 w-4 shrink-0 text-accent" />
          <span className="font-medium text-sm text-foreground/90 truncate min-w-0">
            {currentQuestion.header || currentQuestion.question || '请选择'}
          </span>

          <div className="ml-auto flex items-center gap-1 shrink-0">
            <button
              onClick={() => dispatch({ type: 'GO_TO_PREV', totalQuestions })}
              disabled={isFirstStep}
              className={cn(
                'p-1 rounded-md transition-colors',
                isFirstStep
                  ? 'text-muted-foreground/30 cursor-default'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/10'
              )}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium text-foreground/80 tabular-nums min-w-[3ch] text-center">
              {state.questionStep + 1}
            </span>
            <span className="text-sm text-muted-foreground">/</span>
            <span className="text-sm text-muted-foreground tabular-nums">{totalQuestions}</span>
            <button
              onClick={() => dispatch({ type: 'GO_TO_NEXT', totalQuestions })}
              disabled={isLastStep}
              className={cn(
                'p-1 rounded-md transition-colors',
                isLastStep
                  ? 'text-muted-foreground/30 cursor-default'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/10'
              )}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={onSkip}
              disabled={submitting}
              title="跳过全部"
              className="ml-1 p-1 rounded-md text-muted-foreground transition-colors hover:text-foreground hover:bg-accent/10 disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 问题选项区域 */}
        <div className="px-4 py-4 space-y-3">
          {currentQuestion.question && (
            <p className="text-sm text-foreground/85 leading-relaxed font-medium">
              {currentQuestion.question}
            </p>
          )}

          {currentQuestion.options.length > 0 && (
            <div className="space-y-1">
              {currentQuestion.options.map((option, idx) => {
                const isSelected = state.currentSelected.has(option.label)
                return (
                  <button
                    key={`opt-${state.questionStep}-${idx}`}
                    onClick={() => handleToggleOptionWithFlag(option.label)}
                    className={cn(
                      'w-full rounded-lg px-3.5 py-2.5 text-left transition-all duration-150 text-sm group',
                      'hover:bg-gray-50 active:bg-gray-100',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-1',
                      isSelected && 'bg-accent/[0.06]'
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={cn(
                          'flex shrink-0 items-center justify-center border-2 transition-all duration-150',
                          isMultiple ? 'h-4 w-4 rounded' : 'h-4 w-4 rounded-full',
                          isSelected
                            ? 'border-accent bg-accent text-white scale-100'
                            : 'border-gray-300 group-hover:border-gray-400'
                        )}
                      >
                        {isSelected &&
                          (isMultiple ? (
                            <Check className="h-3 w-3" strokeWidth={3} />
                          ) : (
                            <div className="h-2 w-2 rounded-full bg-current" />
                          ))}
                      </div>
                      <div className="min-w-0 flex items-baseline gap-2 flex-1">
                        <span
                          className={cn(
                            'text-sm font-medium whitespace-nowrap',
                            isSelected ? 'text-foreground' : 'text-foreground/80'
                          )}
                        >
                          {option.label}
                        </span>
                        {option.description && (
                          <span className="text-xs text-[#777] leading-relaxed truncate">
                            {option.description}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}

              {/* "其他" 选项 */}
              <button
                key={`opt-${state.questionStep}-other`}
                onClick={() => handleToggleOptionWithFlag(OTHER_LABEL)}
                className={cn(
                  'w-full rounded-lg px-3.5 py-2.5 text-left transition-all duration-150 text-sm group',
                  'hover:bg-gray-50 active:bg-gray-100',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-1',
                  otherSelected && 'bg-accent/[0.06]'
                )}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      'flex shrink-0 items-center justify-center border-2 transition-all duration-150',
                      isMultiple ? 'h-4 w-4 rounded' : 'h-4 w-4 rounded-full',
                      otherSelected
                        ? 'border-accent bg-accent text-white scale-100'
                        : 'border-gray-300 group-hover:border-gray-400'
                    )}
                  >
                    {otherSelected &&
                      (isMultiple ? (
                        <Check className="h-3 w-3" strokeWidth={3} />
                      ) : (
                        <div className="h-2 w-2 rounded-full bg-current" />
                      ))}
                  </div>
                  <div className="min-w-0 flex items-center gap-2 flex-1">
                    <span
                      className={cn(
                        'text-sm font-medium whitespace-nowrap',
                        otherSelected ? 'text-foreground' : 'text-foreground/80'
                      )}
                    >
                      {OTHER_LABEL}
                    </span>
                    {otherSelected && (
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={state.currentOtherText}
                          onChange={e =>
                            dispatch({ type: 'SET_OTHER_TEXT', value: e.target.value })
                          }
                          placeholder="请输入..."
                          maxLength={MAX_OTHER_CHARS}
                          autoFocus
                          className={cn(
                            'w-full bg-transparent border-b border-gray-300 px-1 py-0.5 text-sm',
                            'placeholder:text-muted-foreground/40',
                            'focus:outline-none focus:border-accent',
                            'transition-colors duration-150'
                          )}
                          onClick={e => e.stopPropagation()}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100">
          <div className="text-xs text-muted-foreground">
            {isMultiple
              ? state.currentSelected.size > 0
                ? `已选 ${state.currentSelected.size} 项`
                : ''
              : ''}
          </div>

          <div className="flex items-center gap-2">
            {(isMultiple || currentQuestion.options.length > 0) && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => dispatch({ type: 'SKIP_AND_ADVANCE', totalQuestions })}
                  disabled={submitting}
                  className="h-8 text-xs text-muted-foreground"
                >
                  跳过
                </Button>
                <Button
                  size="sm"
                  onClick={() => dispatch({ type: 'RECORD_AND_ADVANCE', totalQuestions })}
                  disabled={!hasCurrentAnswer || submitting}
                  className="h-8 text-xs"
                >
                  {isLastStep ? '完成' : '下一题'}
                </Button>
              </>
            )}

            {currentQuestion.options.length === 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => dispatch({ type: 'SKIP_AND_ADVANCE', totalQuestions })}
                disabled={submitting}
                className="h-8 text-xs text-muted-foreground"
              >
                跳过
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
