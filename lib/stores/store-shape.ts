import type { StateCreator } from 'zustand'

import { createChatSlice, type ChatSlice } from './chat-store'
import { createAgentSlice, type AgentSlice } from './agent-store'
import { createSettingsSlice, type SettingsSlice } from './settings-store'
import { createUISlice, type UISlice } from './ui-store'
import { createConnectionSlice, type ConnectionSlice } from './connection-store'
import { createOnboardingSlice, type OnboardingSlice } from './onboarding-store'

export type StoreState = ChatSlice &
  AgentSlice &
  ConnectionSlice &
  SettingsSlice &
  UISlice &
  OnboardingSlice

export const createStoreShape: StateCreator<StoreState, [], []> = (...a) => ({
  ...createChatSlice(...a),
  ...createAgentSlice(...a),
  ...createConnectionSlice(...a),
  ...createSettingsSlice(...a),
  ...createUISlice(...a),
  ...createOnboardingSlice(...a),
})
