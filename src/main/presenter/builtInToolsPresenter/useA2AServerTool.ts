import { randomUUID } from 'crypto'
import { type A2AMessageSendParams, type A2APart, type A2AServerResponse } from '@shared/presenter'
import { BuiltInToolDefinition, BuiltInToolResponse, buildRawData } from './base'
import { presenter } from '..'

export let useA2AServerTool: BuiltInToolDefinition = {
  name: 'use_a2a_server',
  description: '', // 动态传进来
  parameters: {
    type: 'object',
    properties: {
      user_input_message: {
        type: 'string',
        description: "The complete input of the user's latest conversation message."
      }
    },
    required: ['user_input_message']
  }
}

export async function executeUseA2AServerToolHandler(
  args: any,
  toolCallId: string
): Promise<BuiltInToolResponse> {
  const { user_input_message, currentAgent } = args ?? {}
  try {
    if (!currentAgent || !currentAgent.a2aURL) {
      throw new Error('Current agent with a valid a2aURL is required for use_a2a_server.')
    }
    if (typeof user_input_message !== 'string' || !user_input_message.trim()) {
      throw new Error('The query argument cannot be empty.')
    }

    const parts: A2APart[] = [{ type: 'text', text: user_input_message.trim() }]

    const params: A2AMessageSendParams = {
      messageId: randomUUID(),
      kind: 'message',
      role: 'user',
      parts
    }
    const result = await presenter.a2aPresenter.sendMessage(currentAgent.a2aURL, params)
    const responses = await collectResponses(result)
    const successContent = formatResponses(responses)

    const metadata = {
      name: currentAgent.name,
      description: currentAgent.description,
      serverUrl: currentAgent.a2aURL,
      query: user_input_message.trim(),
      responses
    }

    return {
      toolCallId,
      content: successContent,
      success: true,
      metadata,
      rawData: buildRawData(toolCallId, successContent, false, metadata)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const failureMessage = `Failed to execute use_a2a_server: ${message}`
    const metadata = { error: message }
    return {
      toolCallId,
      content: failureMessage,
      success: false,
      metadata,
      rawData: buildRawData(toolCallId, failureMessage, true, metadata)
    }
  }
}

async function collectResponses(
  result: A2AServerResponse | AsyncGenerator<A2AServerResponse>
): Promise<A2AServerResponse[]> {
  const responses: A2AServerResponse[] = []
  if (typeof result[Symbol.asyncIterator] === 'function') {
    for await (const chunk of result as AsyncGenerator<A2AServerResponse>) {
      if (chunk.kind === 'error') {
        throw new Error(
          `A2A server error ${chunk.error?.code ?? ''}: ${chunk.error?.message || 'Unknown error'}`
        )
      }
      responses.push(chunk)
    }
  } else {
    result = result as A2AServerResponse
    if (result.kind === 'error') {
      throw new Error(
        `A2A server error ${result.error?.code ?? ''}: ${result.error?.message || 'Unknown error'}`
      )
    }
    responses.push(result)
  }
  return responses
}

function formatResponses(responses: A2AServerResponse[]): string {
  if (responses.length === 0) {
    throw new Error('no response chunk')
  }
  for (const response of [...responses].reverse()) {
    switch (response.kind) {
      case 'message':
        return `${formatParts(response.message?.parts)}`
      case 'task': {
        const status = response.task?.status
        const statusText = status ? `${formatParts(status.parts)}\n` : ''
        const artifactsText =
          response.task?.artifacts && response.task.artifacts.length > 0
            ? `${formatArtifacts(response.task.artifacts)}`
            : ''
        return `${statusText}${artifactsText}`
      }
    }
  }
  throw new Error('no response chunk')
}

function formatParts(parts?: A2APart[] | null): string {
  if (!parts || parts.length === 0) {
    return ''
  }

  const rendered = parts
    .map((part) => {
      if (part.text) {
        return part.text
      }
      return ''
    })
    .join('\n')

  return rendered || ''
}

function formatArtifacts(artifacts?: { name?: string | null; parts: A2APart[] }[] | null): string {
  if (!artifacts || artifacts.length === 0) {
    return ''
  }
  return artifacts
    .map((artifact) => {
      return `${formatParts(artifact.parts)}`
    })
    .join('\n')
}
