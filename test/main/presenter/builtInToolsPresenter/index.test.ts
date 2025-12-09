import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BUILT_IN_TOOL_SERVER_NAME,
  BuiltInToolsPresenter
} from '../../../../src/main/presenter/builtInToolsPresenter'

const mocks = vi.hoisted(() => {
  const buildSuccessResponse = (toolCallId: string, content = 'mock-success') => ({
    toolCallId,
    content,
    success: true,
    metadata: { echoed: true },
    rawData: { toolCallId, content, isError: false, _meta: { echoed: true } }
  })

  const mockReadFileExecutor = vi.fn(async (args: any, toolCallId: string) =>
    buildSuccessResponse(toolCallId, `read:${args?.file_path ?? ''}`)
  )
  const mockWriteFileExecutor = vi.fn(async (_args: any, toolCallId: string) =>
    buildSuccessResponse(toolCallId, 'write')
  )
  const mockListFilesExecutor = vi.fn(async (_args: any, toolCallId: string) =>
    buildSuccessResponse(toolCallId, 'list')
  )
  const mockExecuteCommandExecutor = vi.fn(async (_args: any, toolCallId: string) =>
    buildSuccessResponse(toolCallId, 'exec')
  )
  const mockUseA2AExecutor = vi.fn(async (_args: any, toolCallId: string) =>
    buildSuccessResponse(toolCallId, 'a2a')
  )

  const mockUseA2AServerTool = {
    name: 'use_a2a_server',
    description: 'Mock a2a',
    parameters: {
      type: 'object',
      properties: {
        user_input_message: { type: 'string' }
      },
      required: ['user_input_message']
    }
  }

  return {
    buildSuccessResponse,
    mockReadFileExecutor,
    mockWriteFileExecutor,
    mockListFilesExecutor,
    mockExecuteCommandExecutor,
    mockUseA2AExecutor,
    mockUseA2AServerTool
  }
})

vi.mock('../../../../src/main/presenter/builtInToolsPresenter/readFileTool', () => ({
  readFileTool: {
    name: 'read_file',
    description: 'Mock read',
    parameters: {
      type: 'object',
      properties: { file_path: { type: 'string' } },
      required: ['file_path']
    }
  },
  executeReadFileTool: mocks.mockReadFileExecutor
}))

vi.mock('../../../../src/main/presenter/builtInToolsPresenter/writeFileTool', () => ({
  writeFileTool: {
    name: 'write_file',
    description: 'Mock write',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['file_path', 'content']
    }
  },
  executeWriteFileTool: mocks.mockWriteFileExecutor
}))

vi.mock('../../../../src/main/presenter/builtInToolsPresenter/listFilesTool', () => ({
  listFilesTool: {
    name: 'list_files',
    description: 'Mock list',
    parameters: {
      type: 'object',
      properties: { directory: { type: 'string' } },
      required: ['directory']
    }
  },
  executeListFilesTool: mocks.mockListFilesExecutor
}))

vi.mock('../../../../src/main/presenter/builtInToolsPresenter/executeCommandTool', () => ({
  executeCommandTool: {
    name: 'execute_command',
    description: 'Mock exec',
    parameters: {
      type: 'object',
      properties: { command: { type: 'string' } },
      required: ['command']
    }
  },
  executeCommandToolHandler: mocks.mockExecuteCommandExecutor
}))

vi.mock('../../../../src/main/presenter/builtInToolsPresenter/useA2AServerTool', () => ({
  useA2AServerTool: mocks.mockUseA2AServerTool,
  executeUseA2AServerToolHandler: mocks.mockUseA2AExecutor
}))

describe('BuiltInToolsPresenter', () => {
  let presenter: BuiltInToolsPresenter

  beforeEach(() => {
    vi.clearAllMocks()
    presenter = new BuiltInToolsPresenter()
  })

  it('returns built-in tool definitions when enabled and empty when disabled', async () => {
    const enabled = await presenter.getBuiltInToolDefinitions(true)
    const disabled = await presenter.getBuiltInToolDefinitions(false)

    expect(enabled).toHaveLength(4)
    expect(enabled.every((tool) => tool.server.name === BUILT_IN_TOOL_SERVER_NAME)).toBe(true)
    expect(disabled).toEqual([])
  })

  it('adds a2a tool and enriches description for A2A agent', async () => {
    const agent = {
      type: 'A2A',
      description: 'Remote helper',
      skills: [{ name: 'search', description: 'Search skill' }],
      a2aURL: 'https://example.com'
    }

    const tools = await presenter.getBuiltInTools(agent as any)
    const a2aTool = tools.find((tool) => tool.name === 'use_a2a_server')

    expect(tools).toHaveLength(5)
    expect(a2aTool?.description).toContain('Remote helper')
    expect(a2aTool?.description).toContain('search=>Search skill')
  })

  it('rejects invalid arguments during execution', async () => {
    const response = await presenter.executeBuiltInTool('read_file', {}, 'call-1')

    expect(response.success).toBe(false)
    expect(response.content).toContain('Parameter validation failed')
    expect(response.rawData.isError).toBe(true)
  })

  it('fails a2a execution when agent context is missing', async () => {
    const response = await presenter.executeBuiltInTool(
      'use_a2a_server',
      { user_input_message: 'ping' },
      'call-2'
    )

    expect(response.success).toBe(false)
    expect(response.content).toContain('requires an A2A agent')
    expect(mocks.mockUseA2AExecutor).not.toHaveBeenCalled()
  })

  it('routes callTool to executor when arguments are valid', async () => {
    const toolCall = {
      id: 'call-3',
      function: {
        name: 'read_file',
        arguments: '{"file_path":"./demo.txt"}'
      }
    }

    const result = await presenter.callTool(toolCall as any)

    expect(mocks.mockReadFileExecutor).toHaveBeenCalledWith({ file_path: './demo.txt' }, 'call-3')
    expect(result.content).toBe('read:./demo.txt')
    expect(result.rawData.isError).toBe(false)
  })

  it('propagates parsing errors from callTool with rawData', async () => {
    vi.spyOn(presenter as any, 'parseToolArguments').mockImplementation(() => {
      throw new Error('bad json')
    })

    const toolCall = { id: 'call-4', function: { name: 'read_file', arguments: '{' } }

    await expect(presenter.callTool(toolCall as any)).rejects.toMatchObject({
      name: 'BuiltInToolCallError',
      rawData: expect.objectContaining({ isError: true }),
      message: expect.stringContaining('Built-in tool arguments failed to parse')
    })
  })

  it('returns an error when tool is unknown', async () => {
    const response = await presenter.executeBuiltInTool('unknown_tool', {}, 'call-5')

    expect(response.success).toBe(false)
    expect(response.content).toContain('Unknown built-in tool')
    expect(response.rawData.isError).toBe(true)
  })
})
