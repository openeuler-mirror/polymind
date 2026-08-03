'use client'

import { useState, useCallback, useMemo } from 'react'
import { useChatStore } from '@/lib/store'
import { resolveQuestion } from '@/lib/stream-event-handler'
import type { Message, QuestionInfo } from '@/lib/types'

export interface QuestionFlowResult {
  hasActiveQuestions: boolean
  activeQuestions: QuestionInfo[] | null
  activeQuestionId: string | null
  activeQuestionMessage: Message | null
  handleSubmitAnswers: (answers: string[][]) => Promise<void>
  handleSkipQuestions: () => Promise<void>
  submitting: boolean
  submitError: string | null
}

export function useQuestionFlow(): QuestionFlowResult {
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { conversations, currentConversationId } = useChatStore()
  const currentConversation = conversations.find(c => c.id === currentConversationId)
  const messages = currentConversation?.messages || []

  // 从消息中提取活跃的提问（questionStatus 为 pending 的助手消息）
  const activeQuestionMessage = useMemo(
    () =>
      messages.find(
        m =>
          m.role === 'assistant' &&
          !!m.question?.length &&
          !!m.questionId &&
          m.questionStatus === 'pending'
      ) ?? null,
    [messages]
  )

  const hasActiveQuestions = !!activeQuestionMessage
  const activeQuestions = activeQuestionMessage?.question ?? null
  const activeQuestionId = activeQuestionMessage?.questionId ?? null

  const handleSubmitAnswers = useCallback(
    async (answers: string[][]) => {
      if (!activeQuestionMessage?.questionId || !currentConversation) return
      const questionId = activeQuestionMessage.questionId
      const messageId = activeQuestionMessage.id
      setSubmitting(true)
      setSubmitError(null)
      try {
        const store = useChatStore.getState()
        const agentId = currentConversation.agentId || store.currentAgentId || ''
        const sessionId = currentConversation.sessionId || ''
        await store.replyQuestion(agentId, sessionId, questionId, answers)
        // 乐观更新：消息标记为已回答并留痕（与流上的 question.replied 事件幂等）
        store.updateMessage(currentConversation.id, messageId, m =>
          resolveQuestion(m, 'replied', answers)
        )
      } catch (err: any) {
        console.error('Failed to submit answers:', err)
        const msg = err?.message || '提交失败，请重试'
        setSubmitError(msg)
      } finally {
        setSubmitting(false)
      }
    },
    [activeQuestionMessage, currentConversation]
  )

  const handleSkipQuestions = useCallback(async () => {
    if (!activeQuestionMessage?.questionId || !currentConversation) return
    const questionId = activeQuestionMessage.questionId
    const messageId = activeQuestionMessage.id
    setSubmitting(true)
    setSubmitError(null)
    try {
      const store = useChatStore.getState()
      const agentId = currentConversation.agentId || store.currentAgentId || ''
      const sessionId = currentConversation.sessionId || ''
      await store.rejectQuestion(agentId, sessionId, questionId)
      // 乐观更新：消息标记为已跳过并留痕（与流上的 question.rejected 事件幂等）
      store.updateMessage(currentConversation.id, messageId, m => resolveQuestion(m, 'rejected'))
    } catch (err: any) {
      console.error('Failed to skip questions:', err)
      const msg = err?.message || '操作失败，请重试'
      setSubmitError(msg)
    } finally {
      setSubmitting(false)
    }
  }, [activeQuestionMessage, currentConversation])

  return {
    hasActiveQuestions,
    activeQuestions,
    activeQuestionId,
    activeQuestionMessage,
    handleSubmitAnswers,
    handleSkipQuestions,
    submitting,
    submitError,
  }
}
