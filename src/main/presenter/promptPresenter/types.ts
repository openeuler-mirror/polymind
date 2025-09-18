import { z } from 'zod'
/**
 * Settings passed to system prompt generation functions
 */
export interface SystemPromptSettings {
  maxConcurrentFileReads: number
  todoListEnabled: boolean
  useAgentRules: boolean
  newTaskRequireTodos: boolean
}

/**
 * PromptComponent
 */

export const promptComponentSchema = z.object({
  roleDefinition: z.string().optional(),
  whenToUse: z.string().optional(),
  description: z.string().optional(),
  customInstructions: z.string().optional()
})

export type PromptComponent = z.infer<typeof promptComponentSchema>

/**
 * CustomModePrompts
 */

export const customModePromptsSchema = z.record(z.string(), promptComponentSchema.optional())

export type CustomModePrompts = z.infer<typeof customModePromptsSchema>

/**
 * TodoStatus
 */
export const todoStatusSchema = z.enum(['pending', 'in_progress', 'completed'] as const)

export type TodoStatus = z.infer<typeof todoStatusSchema>

/**
 * TodoItem
 */
export const todoItemSchema = z.object({
  id: z.string(),
  content: z.string(),
  status: todoStatusSchema
})

export type TodoItem = z.infer<typeof todoItemSchema>
