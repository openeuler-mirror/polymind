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


const INTERRUPTION_PREFIX = `[CRITICAL SYSTEM INSTRUCTION - OVERRIDE ALL PREVIOUS CONTEXT]

The assistant's previous response in the conversation history was INTERRUPTED and INCOMPLETE before being sent to you. 

You MUST follow these rules with HIGHEST PRIORITY:

1. IGNORE the ENTIRE interrupted assistant message completely - treat it as if it never existed
2. DO NOT continue, complete, reference, or acknowledge that interrupted response in ANY way  
3. DO NOT use phrases like "continuing from", "as I was saying", "to complete my previous thought"
4. Answer ONLY and DIRECTLY the user's message below, starting from a fresh response

The user's current message (ignore everything before this):

`;
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