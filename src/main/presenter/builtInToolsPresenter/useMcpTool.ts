import { BuiltInToolDefinition, BuiltInToolResponse, buildRawData } from './base'
import { MCPToolCall, MCPToolDefinition, MCPToolResponse } from '@shared/presenter'

export const useMcpTool: BuiltInToolDefinition = {
  name: 'use_mcp_tool',
  description:
    'Request to use a tool provided by a connected MCP server. Each MCP server can provide multiple tools with different capabilities. Tools have defined input schemas that specify required and optional parameters.',
  parameters: {
    type: 'object',
    properties: {
      server_name: {
        type: 'string',
        description: 'The name of the MCP server providing the tool.'
      },
      tool_name: {
        type: 'string',
        description: 'The name of the tool to execute.'
      },
      arguments: {
        type: 'object',
        description:
          "A JSON object containing the tool's input parameters, following the tool's input schema."
      }
    },
    required: ['server_name', 'tool_name', 'arguments']
  }
}

function validateArgs(args: any): {
  serverName: string
  toolName: string
  toolArguments: Record<string, unknown>
} {
  const { server_name, tool_name, arguments: toolArguments } = args ?? {}

  if (typeof server_name !== 'string' || server_name.trim().length === 0) {
    throw new Error('server_name is required and must be a non-empty string')
  }
  if (typeof tool_name !== 'string' || tool_name.trim().length === 0) {
    throw new Error('tool_name is required and must be a non-empty string')
  }
  if (
    toolArguments === null ||
    toolArguments === undefined ||
    typeof toolArguments !== 'object' ||
    Array.isArray(toolArguments)
  ) {
    throw new Error('arguments is required and must be a JSON object')
  }

  return {
    serverName: server_name.trim(),
    toolName: tool_name.trim(),
    toolArguments
  }
}

async function resolveToolName(
  mcpToolDefinitions: MCPToolDefinition[],
  serverName: string,
  requestedToolName: string
): Promise<{ resolvedToolName: string; definition?: MCPToolDefinition }> {
  if (!Array.isArray(mcpToolDefinitions)) {
    return { resolvedToolName: requestedToolName }
  }

  const directMatch = mcpToolDefinitions.find(
    (def) => def.server?.name === serverName && def.function.name === requestedToolName
  )
  if (directMatch) {
    return { resolvedToolName: directMatch.function.name, definition: directMatch }
  }

  const prefixedName = `${serverName}_${requestedToolName}`
  const prefixedMatch = mcpToolDefinitions.find(
    (def) => def.server?.name === serverName && def.function.name === prefixedName
  )
  if (prefixedMatch) {
    return { resolvedToolName: prefixedMatch.function.name, definition: prefixedMatch }
  }

  const suffixMatch = mcpToolDefinitions.find(
    (def) =>
      def.server?.name === serverName &&
      typeof def.function.name === 'string' &&
      def.function.name.endsWith(`_${requestedToolName}`)
  )
  if (suffixMatch) {
    return { resolvedToolName: suffixMatch.function.name, definition: suffixMatch }
  }

  return { resolvedToolName: requestedToolName }
}

export async function executeUseMcpTool(
  args: any,
  toolCallId: string
): Promise<BuiltInToolResponse> {
  try {
    const { serverName, toolName, toolArguments } = validateArgs(args)

    // Import presenter lazily to avoid circular dependencies at module load time
    const { presenter } = await import('@/presenter')
    const mcpPresenter = presenter?.mcpPresenter

    if (!mcpPresenter || typeof mcpPresenter.callTool !== 'function') {
      throw new Error('MCP presenter is not available')
    }

    const toolDefinitions = await mcpPresenter.getAllToolDefinitions()
    const { resolvedToolName, definition } = await resolveToolName(
      toolDefinitions,
      serverName,
      toolName
    )

    const toolCall: MCPToolCall = {
      id: toolCallId,
      type: 'function',
      function: {
        name: resolvedToolName,
        arguments: JSON.stringify(toolArguments)
      },
      server: definition?.server ?? {
        name: serverName,
        icons: '',
        description: ''
      }
    }

    const result = await mcpPresenter.callTool(toolCall)
    const rawData: MCPToolResponse = {
      ...result.rawData,
      toolCallId,
      _meta: {
        ...(result.rawData?._meta ?? {}),
        serverName,
        toolName: resolvedToolName,
        arguments: toolArguments
      }
    }

    if (rawData.requiresPermission) {
      const permission = rawData.permissionRequest
      const content = `Permission required to execute MCP tool.\nServer: ${serverName}\nTool: ${resolvedToolName}\nPermission: ${permission?.permissionType ?? 'unknown'}`
      const metadata = {
        serverName,
        toolName: resolvedToolName,
        permissionRequest: permission
      }
      return {
        toolCallId,
        content,
        success: false,
        metadata,
        rawData
      }
    }

    const success = !rawData.isError
    const contentPrefix = success ? 'MCP tool executed successfully.' : 'MCP tool execution failed.'
    const content = `${contentPrefix}\nServer: ${serverName}\nTool: ${resolvedToolName}\n\n${result.content}`

    const metadata = {
      serverName,
      toolName: resolvedToolName,
      arguments: toolArguments
    }

    return {
      toolCallId,
      content,
      success,
      metadata,
      rawData
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const failureMessage = `Failed to execute MCP tool: ${errorMessage}`
    const metadata = { error: errorMessage }
    return {
      toolCallId,
      content: failureMessage,
      success: false,
      metadata,
      rawData: buildRawData(toolCallId, failureMessage, true, metadata)
    }
  }
}
