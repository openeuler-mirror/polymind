import { jsonrepair } from 'jsonrepair'
import {
  Tool,
  MCPToolDefinition,
  MCPToolCall,
  MCPToolResponse,
  Agent,
  IBuiltInToolsPresenter
} from '@shared/presenter'
import { BuiltInToolDefinition, BuiltInToolResponse, validateToolArgs, buildRawData } from './base'
import { readFileTool, executeReadFileTool } from './readFileTool'
import { writeFileTool, executeWriteFileTool } from './writeFileTool'
import { listFilesTool, executeListFilesTool } from './listFilesTool'
import { executeCommandTool, executeCommandToolHandler } from './executeCommandTool'
import { useA2AServerTool, executeUseA2AServerToolHandler } from './useA2AServerTool'

export const BUILT_IN_TOOL_SERVER_NAME = 'polymind-builtin'
export const BUILT_IN_TOOL_SERVER_DESCRIPTION = 'PolyMind built-in tools'

export const builtInTools: Record<string, BuiltInToolDefinition> = {
  [readFileTool.name]: readFileTool,
  [writeFileTool.name]: writeFileTool,
  [listFilesTool.name]: listFilesTool,
  [executeCommandTool.name]: executeCommandTool
}

type BuiltInExecutor = (args: any, toolCallId: string) => Promise<BuiltInToolResponse>
const builtInToolExecutors: Record<string, BuiltInExecutor> = {
  [readFileTool.name]: executeReadFileTool,
  [writeFileTool.name]: executeWriteFileTool,
  [listFilesTool.name]: executeListFilesTool,
  [executeCommandTool.name]: executeCommandToolHandler
}

const a2aBuiltInTools: Record<string, BuiltInToolDefinition> = {
  [useA2AServerTool.name]: useA2AServerTool
}

const a2aBuiltInToolExecutors: Record<string, BuiltInExecutor> = {
  [useA2AServerTool.name]: executeUseA2AServerToolHandler
}

class BuiltInToolCallError extends Error {
  rawData: MCPToolResponse

  constructor(message: string, rawData: MCPToolResponse) {
    super(message)
    this.name = 'BuiltInToolCallError'
    this.rawData = rawData
  }
}

export class BuiltInToolsPresenter implements IBuiltInToolsPresenter {
  private getToolRegistry(currentAgent?: Agent): {
    tools: Record<string, BuiltInToolDefinition>
    executors: Record<string, BuiltInExecutor>
  } {
    const tools = { ...builtInTools }
    const executors = { ...builtInToolExecutors }
    if (currentAgent?.type === 'A2A') {
      useA2AServerTool.description = currentAgent.description
      if (currentAgent.skills.length > 0) {
        useA2AServerTool.description += ` Proficient in the following skills: \n${currentAgent.skills
          .map((skill) => {
            return `${skill.name}=>${skill.description}`
          })
          .join('\n')}.`
      }
      Object.assign(tools, a2aBuiltInTools)
      Object.assign(executors, a2aBuiltInToolExecutors)
    }
    return { tools, executors }
  }

  async executeBuiltInTool(
    toolName: string,
    args: any,
    toolCallId: string,
    currentAgent?: Agent
  ): Promise<BuiltInToolResponse> {
    const { tools, executors } = this.getToolRegistry(currentAgent)
    const def = tools[toolName]
    let resolvedArgs = args
    if (def) {
      const check = validateToolArgs(def, args)
      if (!check.ok) {
        const failureMessage = `Parameter validation failed: ${check.message}`
        const meta = { error: check.message, tool: toolName, args }
        return {
          toolCallId,
          content: failureMessage,
          success: false,
          metadata: meta,
          rawData: buildRawData(toolCallId, failureMessage, true, meta)
        }
      }
      resolvedArgs = check.normalizedArgs
    }

    const executor = executors[toolName]
    if (executor) {
      if (executor === executeUseA2AServerToolHandler) {
        if (!currentAgent || !currentAgent.a2aURL) {
          const failureMessage = 'use_a2a_server requires an A2A agent with a valid a2aURL'
          const meta = { error: failureMessage, tool: toolName }
          return {
            toolCallId,
            content: failureMessage,
            success: false,
            metadata: meta,
            rawData: buildRawData(toolCallId, failureMessage, true, meta)
          }
        }
        resolvedArgs = { ...resolvedArgs, currentAgent }
      }
      return await executor(resolvedArgs, toolCallId)
    }
    const msg = `Unknown built-in tool: ${toolName}`
    const metadata = { error: `Unknown built-in tool: ${toolName}` }
    return {
      toolCallId,
      content: msg,
      success: false,
      metadata,
      rawData: buildRawData(toolCallId, msg, true, metadata)
    }
  }

  async getBuiltInTools(currentAgent?: Agent): Promise<Tool[]> {
    const { tools } = this.getToolRegistry(currentAgent)
    const definitions = Object.values(tools)
    return definitions.map((def) => ({
      name: def.name,
      description: def.description,
      inputSchema: def.parameters,
      annotations: {
        title: def.name,
        readOnlyHint: false,
        destructiveHint: ['write_file', 'execute_command'].includes(def.name),
        idempotentHint: false,
        openWorldHint: true
      }
    }))
  }

  async getToolDescription(toolName: string): Promise<string | null> {
    const definition = builtInTools[toolName]
    return definition?.description || null
  }

  isBuiltInTool(toolName: string): boolean {
    return toolName in builtInTools
  }

  async callTool(
    toolCall: MCPToolCall,
    currentAgent?: Agent
  ): Promise<{ content: string; rawData: MCPToolResponse }> {
    let parsedArguments: Record<string, unknown>

    try {
      parsedArguments = this.parseToolArguments(toolCall.function.arguments ?? '{}')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const failureContent = `Built-in tool arguments failed to parse : ${errorMessage}`
      const rawData = buildRawData(toolCall.id, failureContent, true, {
        tool: toolCall.function.name,
        error: errorMessage
      })
      throw new BuiltInToolCallError(failureContent, rawData)
    }

    try {
      const response = await this.executeBuiltInTool(
        toolCall.function.name,
        parsedArguments,
        toolCall.id,
        currentAgent
      )
      if (!response.success || response.rawData.isError) {
        throw new BuiltInToolCallError(response.content, response.rawData)
      }
      return { content: response.content, rawData: response.rawData }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const failureContent = `Built-in tool execution failed: ${errorMessage}`
      const rawData = buildRawData(toolCall.id, failureContent, true, {
        tool: toolCall.function.name,
        error: errorMessage
      })
      throw new BuiltInToolCallError(failureContent, rawData)
    }
  }

  async getBuiltInToolDefinitions(
    enabled: boolean = true,
    currentAgent?: Agent
  ): Promise<MCPToolDefinition[]> {
    if (!enabled) {
      return []
    }

    try {
      const tools = await this.getBuiltInTools(currentAgent)
      return tools.map((tool) => this.mapToolToDefinition(tool))
    } catch (error) {
      console.error('[BuiltInToolsPresenter] Failed to load built-in tools:', error)
      return []
    }
  }

  /**
   * 将 MCPToolDefinition 转换为 XML 格式
   * @returns XML 格式的工具定义字符串
   */
  async convertToolsToXml(enabled: boolean = true, currentAgent?: Agent): Promise<string> {
    const tools = await this.getBuiltInToolDefinitions(enabled, currentAgent)
    const xmlTools = tools
      .map((tool) => {
        const { name, description, parameters } = tool.function
        const { properties, required = [] } = parameters

        const paramsXml = Object.entries(properties)
          .map(([paramName, paramDef]) => {
            const requiredAttr = required.includes(paramName) ? ' required="true"' : ''
            const descriptionAttr = paramDef.description
              ? ` description="${paramDef.description}"`
              : ''
            const typeAttr = paramDef.type ? ` type="${paramDef.type}"` : ''

            return `<parameter name="${paramName}"${requiredAttr}${descriptionAttr}${typeAttr}></parameter>`
          })
          .join('\n    ')

        return `<tool name="${name}" description="${description}">
    ${paramsXml}
</tool>`
      })
      .join('\n\n')

    return xmlTools
  }

  private mapToolToDefinition(tool: Tool): MCPToolDefinition {
    const schema = (tool.inputSchema || {}) as {
      type?: string
      properties?: Record<string, unknown>
      required?: string[]
    }

    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: typeof schema.type === 'string' ? (schema.type as string) : 'object',
          properties: (schema.properties as Record<string, unknown>) || {},
          required: schema.required || []
        }
      },
      server: {
        name: BUILT_IN_TOOL_SERVER_NAME,
        icons: '',
        description: BUILT_IN_TOOL_SERVER_DESCRIPTION
      }
    }
  }

  private parseToolArguments(argumentsText: string): Record<string, unknown> {
    const tryParse = (input: string): Record<string, unknown> => JSON.parse(input)

    try {
      return tryParse(argumentsText)
    } catch (parseError) {
      try {
        return tryParse(jsonrepair(argumentsText))
      } catch (repairError) {
        const escaped = this.escapeInvalidBackslashes(argumentsText)
        if (escaped === argumentsText) {
          throw repairError instanceof Error ? repairError : new Error(String(repairError))
        }
        return tryParse(escaped)
      }
    }
  }

  private escapeInvalidBackslashes(input: string): string {
    return input.replace(/\\(?!["\\/bfnrtu])/g, '\\\\')
  }
}
