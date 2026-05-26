import type { Agent, Conversation } from './types'

const PREFIX = 'pm_cache_'

interface CacheEntry<T> {
  data: T
  ts: number
  ttl: number
}

function isBrowser() {
  return typeof window !== 'undefined' && window.sessionStorage
}

export function cacheGet<T>(key: string): T | null {
  if (!isBrowser()) return null
  try {
    const raw = sessionStorage.getItem(PREFIX + key)
    if (!raw) return null
    const entry: CacheEntry<T> = JSON.parse(raw)
    if (Date.now() - entry.ts > entry.ttl) {
      sessionStorage.removeItem(PREFIX + key)
      return null
    }
    return entry.data
  } catch {
    return null
  }
}

export function cacheSet<T>(key: string, data: T, ttlMs: number): void {
  if (!isBrowser()) return
  try {
    const entry: CacheEntry<T> = { data, ts: Date.now(), ttl: ttlMs }
    sessionStorage.setItem(PREFIX + key, JSON.stringify(entry))
  } catch {
    // sessionStorage full or unavailable — silent no-op
  }
}

export function cacheDelete(key: string): void {
  if (!isBrowser()) return
  try {
    sessionStorage.removeItem(PREFIX + key)
  } catch {
    // silent
  }
}

// Cache keys
export const CACHE_KEYS = {
  AGENTS: 'agents',
  CONVERSATIONS_WITH_NAMES: 'conv_names',
}

export interface CachedData {
  agents: Agent[]
  conversations: Conversation[]
  sessionAgentNames: [string, string][]
}

export function cacheGetAll(): CachedData | null {
  const agents = cacheGet<Agent[]>(CACHE_KEYS.AGENTS)
  const convData = cacheGet<{ conversations: Conversation[]; sessionAgentNames: [string, string][] }>(CACHE_KEYS.CONVERSATIONS_WITH_NAMES)
  if (!agents || !convData) return null
  return {
    agents,
    conversations: convData.conversations,
    sessionAgentNames: convData.sessionAgentNames,
  }
}

export function cacheSetAll(data: CachedData, ttlMs: number): void {
  cacheSet(CACHE_KEYS.AGENTS, data.agents, ttlMs)
  cacheSet(CACHE_KEYS.CONVERSATIONS_WITH_NAMES, {
    conversations: data.conversations,
    sessionAgentNames: data.sessionAgentNames,
  }, ttlMs)
}
