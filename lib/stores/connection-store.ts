import type { StateCreator } from 'zustand'
import type { Session, EventItem } from '../types'
import { SessionStatus } from '../types'
import { messageService } from '@/services/message-service'
import { sessionService } from '@/services/session-service'
import { generateUUID } from '../utils'
import { appConfig } from '@/app/config'
import type { StoreState } from './index'

export interface ConnectionSlice {
  _stoppingInProgress: boolean
  sendMessageToAgent: (
    agentId: string,
    sessionId: string,
    content: string,
    onEvent?: (event: EventItem) => void
  ) => Promise<EventItem[]>
  createNewSession: (agentId: string) => Promise<Session>
  replyQuestion: (
    agentId: string,
    sessionId: string,
    requestId: string,
    answers: string[][]
  ) => Promise<void>
  rejectQuestion: (agentId: string, sessionId: string, requestId: string) => Promise<void>
}

export const createConnectionSlice: StateCreator<StoreState, [], [], ConnectionSlice> = (
  _set,
  _get
) => ({
  _stoppingInProgress: false,

  createNewSession: async (agentId: string) => {
    let session: Session

    if (appConfig.app.useMockData) {
      const now = new Date().toISOString()
      session = {
        id: generateUUID(),
        agentId,
        status: SessionStatus.ACTIVE,
        contextInitialized: true,
        runtimeType: 'openclaw',
        createdAt: now,
        updatedAt: now,
      }
    } else {
      session = await sessionService.createSession(agentId)
    }

    return session
  },

  sendMessageToAgent: async (
    agentId: string,
    sessionId: string,
    content: string,
    onEvent?: (event: EventItem) => void
  ) => {
    if (!sessionId) {
      throw new Error('No active session for agent')
    }

    try {
      const events = await messageService.sendMessage(agentId, sessionId, content, onEvent)
      return events
    } catch (error) {
      console.error('Error sending message:', error)
      throw error
    }
  },

  replyQuestion: (agentId: string, sessionId: string, requestId: string, answers: string[][]) => {
    return messageService.replyQuestion(agentId, sessionId, requestId, answers)
  },

  rejectQuestion: (agentId: string, sessionId: string, requestId: string) => {
    return messageService.rejectQuestion(agentId, sessionId, requestId)
  },
})
