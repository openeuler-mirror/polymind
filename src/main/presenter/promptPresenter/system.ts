import { presenter } from '@/presenter'
import { formatLanguage } from '../../../shared/language'
import {
  getSystemInfoSection,
  getObjectiveSection,
  getSharedToolUseSection,
  addCustomInstructions,
  markdownFormattingSection
} from './sections'
import { Agent } from '@shared/presenter'


async function generatePrompt(
  cwd?: string,
  globalCustomInstructions?: string,
  language?: string,
  IgnoreInstructions?: string,
  useBuiltInToolsEnabled?: boolean,
  agent?: Agent
): Promise<string> {
  const promptSections: string[] = []
  if (agent) {
    let roleDefinition = ''
    if (agent) {
      roleDefinition += `Your name is ${agent.name},${agent.description}.`
      if (agent.skills.length > 0) {
        roleDefinition += `You have the following skills:\n`
        for (const skill of agent.skills || []) {
          roleDefinition += `- ${skill.name}=>${skill.description}\n`
        }
      }
    }
    promptSections.push(roleDefinition)
  }
  promptSections.push(markdownFormattingSection())

  if (useBuiltInToolsEnabled) {
    const toolsXML = await presenter.builtInToolsPresenter.convertToolsToXml(
      useBuiltInToolsEnabled,
      agent
    )
    promptSections.push(`${getSharedToolUseSection(toolsXML)}`)
  }

  promptSections.push(getSystemInfoSection(), getObjectiveSection())

  const customInstructions = await addCustomInstructions(
    '',
    globalCustomInstructions || '',
    cwd || '',
    '',
    {
      language: language ?? formatLanguage(presenter.configPresenter.getLanguage()),
      IgnoreInstructions
    }
  )

  promptSections.push(customInstructions)

  const basePrompt = `${promptSections.join(`\n`)}`

  return basePrompt
}

export const SYSTEM_PROMPT = async (
  cwd?: string,
  globalCustomInstructions?: string,
  language?: string,
  IgnoreInstructions?: string,
  useBuiltInToolsEnabled?: boolean,
  agent?: Agent
): Promise<string> => {
  return generatePrompt(
    cwd,
    globalCustomInstructions,
    language,
    IgnoreInstructions,
    useBuiltInToolsEnabled,
    agent
  )
}
