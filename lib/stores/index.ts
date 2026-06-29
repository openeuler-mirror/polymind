import { create } from 'zustand'

import { createChatSlice, type ChatSlice } from './chat-store'
import { createSettingsSlice, type SettingsSlice } from './settings-store'
import { createUISlice, type UISlice } from './ui-store'
import { createConnectionSlice, type ConnectionSlice } from './connection-store'

export type StoreState = ChatSlice & ConnectionSlice & SettingsSlice & UISlice

export const useChatStore = create<StoreState>()((...a) => ({
  ...createChatSlice(...a),
  ...createConnectionSlice(...a),
  ...createSettingsSlice(...a),
  ...createUISlice(...a),
}))
