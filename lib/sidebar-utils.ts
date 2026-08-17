import type { Conversation } from '@/lib/types'

export interface SidebarGroups {
  pinned: Conversation[]
  regular: Conversation[]
}

export function sortByUpdatedAtDesc<T extends { updatedAt: Date }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
}

/**
 * 侧边栏分区分组：
 * - 置顶：pinned === true
 * - 普通：未置顶
 *
 * 定时任务会话（scheduledTaskId 有值）不属于置顶/普通分组，
 * 它们由“定时任务”区按所属任务直接渲染，避免同一会话在普通任务区重复出现。
 */
export function groupSidebarConversations(conversations: Conversation[]): SidebarGroups {
  const pinned: Conversation[] = []
  const regular: Conversation[] = []

  for (const conversation of conversations) {
    if (conversation.scheduledTaskId) {
      continue
    }
    if (conversation.pinned) {
      pinned.push(conversation)
    } else {
      regular.push(conversation)
    }
  }

  return {
    pinned: sortByUpdatedAtDesc(pinned),
    regular: sortByUpdatedAtDesc(regular),
  }
}
