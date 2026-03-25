---
name: zustand
description: Manages Zustand stores and state management patterns - creating stores, implementing slices, handling async actions, persisting state, and optimizing performance. Provides best practices for state management in React applications.
user-invocable: false
allowed-tools: Bash(pnpm add zustand), Bash(npx zustand *)
---

# Zustand State Management

A small, fast, and scalable bearbones state management solution for React applications with no boilerplate and middlewares.

## Current Project Context

```json
{
  "version": "5.0.0",
  "framework": "react",
  "typescript": true,
  "packageManager": "pnpm",
  "features": ["slices", "middleware", "persist", "selectors", "actions"]
}
```

## Principles

1. **Use functional approach.** Create stores with the functional `create` method.
2. **Slice state appropriately.** Organize related state into logical slices.
3. **Separate concerns.** Keep state, getters, and actions in distinct sections.
4. **Use selectors efficiently.** Memoize selectors to prevent unnecessary re-renders.

## Critical Rules

These rules are **always enforced**:

### Store Creation
- **Use functional `create` method.** `create(() => ({ ... }))` for basic stores.
- **Define state and actions together.** Group related state and its actions in one place.
- **Use TypeScript interfaces.** Define clear interfaces for store state shape.
- **Avoid nested state mutations.** Use spread operator or immer for immutability.

### State Updates
- **Batch synchronous updates.** Multiple state changes in a single tick.
- **Use functional updates when needed.** `(state) => ({ count: state.count + 1 })` when relying on previous state.
- **Don't mutate state directly.** Always return new state objects.

### Selectors
- **Create memoized selectors.** Use `useCallback` for complex selectors.
- **Extract selectors to constants.** Share selectors across components.
- **Avoid inline selector functions.** Prevent unnecessary re-renders.

### Middleware
- **Use `persist` middleware for storage.** Persist state across sessions.
- **Apply middleware correctly.** Order matters when combining multiple middlewares.
- **Handle hydration carefully.** Account for server/client differences.

### Async Actions
- **Handle promises properly.** Manage loading/error states separately.
- **Cancel operations when needed.** Clean up async operations in effects.
- **Use optimistic updates.** Update UI immediately, revert on error.

## Key Patterns

```tsx
// Basic store with TypeScript
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

interface BearState {
  bears: number
  increase: (by: number) => void
  reset: () => void
}

const useBearStore = create<BearState>()(
  devtools(
    persist(
      (set) => ({
        bears: 0,
        increase: (by) => set((state) => ({ bears: state.bears + by })),
        reset: () => set({ bears: 0 }),
      }),
      { name: 'bear-storage' }
    )
  )
)

// Store with slice pattern
interface UIState {
  sidebarOpen: boolean
  theme: 'light' | 'dark'
  toggleSidebar: () => void
  setTheme: (theme: 'light' | 'dark') => void
}

const useUIStore = create<UIState>()((set) => ({
  sidebarOpen: true,
  theme: 'light',
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setTheme: (theme) => set({ theme }),
}))

// Store with async actions
interface UserState {
  users: User[]
  loading: boolean
  error: string | null
  fetchUsers: () => Promise<void>
  addUser: (user: User) => void
}

const useUserStore = create<UserState>()((set) => ({
  users: [],
  loading: false,
  error: null,
  fetchUsers: async () => {
    set({ loading: true, error: null })
    try {
      const response = await fetch('/api/users')
      const users = await response.json()
      set({ users, loading: false })
    } catch (error) {
      set({ error: 'Failed to fetch users', loading: false })
    }
  },
  addUser: (user) => set((state) => ({ users: [...state.users, user] })),
}))

// Component using store
import { useBearStore } from '@/store/bear-store'

function BearCounter() {
  const bears = useBearStore((state) => state.bears)
  const increase = useBearStore((state) => state.increase)

  return (
    <div>
      <p>Bears: {bears}</p>
      <button onClick={() => increase(1)}>One Up</button>
    </div>
  )
}

// Selector pattern
const bearCountSelector = (state: BearState) => state.bears
const bearActionsSelector = (state: BearState) => ({
  increase: state.increase,
  reset: state.reset,
})

function BearCounterWithSelectors() {
  const bears = useBearStore(bearCountSelector)
  const { increase, reset } = useBearStore(bearActionsSelector)

  return (
    <div>
      <p>Bears: {bears}</p>
      <button onClick={() => increase(1)}>One Up</button>
      <button onClick={reset}>Reset</button>
    </div>
  )
}
```

## Middleware Patterns

```tsx
// Persist middleware with custom options
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

const useStore = create<State>()(
  persist(
    (set, get) => ({
      // ... state and actions
    }),
    {
      name: 'store-name',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ bears: state.bears }), // only persist specific fields
      onRehydrateStorage: () => {
        console.log('hydration starts')
        return (state, error) => {
          if (error) {
            console.log('an error happened during hydration', error)
          } else {
            console.log('hydration finished', state)
          }
        }
      }
    }
  )
)

// Immer middleware for mutable updates
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

interface State {
  obj: { a: number; b: number }
  incrementA: () => void
}

const useStore = create<State>()(
  immer((set) => ({
    obj: { a: 0, b: 0 },
    incrementA: () =>
      set((state) => {
        state.obj.a += 1 // This is safe with immer
      }),
  }))
)
```

## Performance Optimization

- **Use shallow equality.** Zustand uses strict equality by default.
- **Memoize selectors.** Prevent unnecessary re-renders with useCallback.
- **Batch updates.** Multiple state changes in a single tick.
- **Consider partial state updates.** Subscribe to only needed state parts.

## Testing Patterns

```tsx
// Test helper
const createStoreForTest = () => create<TestState>()(set => ({
  // initial state for testing
}))

// Reset store between tests
beforeEach(() => {
  const store = useStore.getState()
  useStore.setState(initialState, true) // true to replace state completely
})