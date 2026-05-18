import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Message } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Generates a UUID v4 string with fallback for environments where crypto.randomUUID is not available
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback UUID v4 implementation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}


const INTERRUPTION_PREFIX =
  '[System note: Your previous response was interrupted and incomplete. Ignore it entirely. Answer ONLY the user\'s latest question below. Do not continue, complete, or reference the interrupted response.]\n\n'
export function withInterruptionPrefix(
  content: string,
  messages: Message[]
): string {
  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
  if (lastAssistant?.stopped === true) {
    return INTERRUPTION_PREFIX + content
  }
  return content
}