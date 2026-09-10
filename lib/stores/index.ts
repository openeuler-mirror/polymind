import { create } from 'zustand'

import { createStoreShape, type StoreState } from './store-shape'

export type { StoreState }

export const useChatStore = create<StoreState>()(createStoreShape)
