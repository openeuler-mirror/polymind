import { groupSidebarConversations, sortByUpdatedAtDesc } from '../sidebar-utils'
import type { Conversation } from '../types'

function makeConversation(id: string, overrides: Partial<Conversation> = {}): Conversation {
  return {
    id,
    title: '对话 ' + id,
    messages: [],
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  }
}

describe('sortByUpdatedAtDesc', () => {
  it('should sort items by updatedAt descending', () => {
    const items = [
      makeConversation('old', { updatedAt: new Date('2025-01-01') }),
      makeConversation('new', { updatedAt: new Date('2025-03-01') }),
      makeConversation('mid', { updatedAt: new Date('2025-02-01') }),
    ]

    expect(sortByUpdatedAtDesc(items).map(c => c.id)).toEqual(['new', 'mid', 'old'])
  })

  it('should not mutate the input array', () => {
    const items = [makeConversation('a'), makeConversation('b')]
    sortByUpdatedAtDesc(items)
    expect(items.map(c => c.id)).toEqual(['a', 'b'])
  })
})

describe('groupSidebarConversations', () => {
  it('should partition pinned and regular conversations', () => {
    const conversations = [
      makeConversation('pinned-1', { pinned: true }),
      makeConversation('pinned-2', { pinned: true }),
      makeConversation('regular-1'),
    ]

    const groups = groupSidebarConversations(conversations)

    expect(groups.pinned.map(c => c.id)).toEqual(['pinned-1', 'pinned-2'])
    expect(groups.regular.map(c => c.id)).toEqual(['regular-1'])
  })

  it('should exclude scheduled conversations from regular (they render in the scheduled area)', () => {
    const conversations = [
      makeConversation('scheduled-opened', { scheduledTaskId: 'task-1' }),
      makeConversation('regular-1'),
    ]

    const groups = groupSidebarConversations(conversations)

    expect(groups.regular.map(c => c.id)).toEqual(['regular-1'])
    expect(groups.pinned).toHaveLength(0)
  })

  it('should exclude pinned scheduled conversations from pinned', () => {
    const conversations = [
      makeConversation('pinned-scheduled', { pinned: true, scheduledTaskId: 'task-1' }),
    ]

    const groups = groupSidebarConversations(conversations)

    expect(groups.pinned).toHaveLength(0)
    expect(groups.regular).toHaveLength(0)
  })
})
