#!/usr/bin/env tsx

import * as fs from 'fs'
import * as path from 'path'

interface ModelsDevProvider {
  id: string
  env: string[]
  npm: string
  api: string
  name: string
  doc: string
  models: Record<string, ModelsDevModel>
}

interface ModelsDevModel {
  id: string
  name: string
  family: string
  attachment: boolean
  reasoning: boolean
  tool_call: boolean
  temperature: boolean
  structured_output?: boolean
  knowledge?: string
  release_date?: string
  last_updated?: string
  modalities: {
    input: string[]
    output: string[]
  }
  open_weights: boolean
  limit: {
    context: number
    output: number
  }
  cost: {
    input: number
    output: number
    cache_read?: number
    cache_write?: number
  }
}

interface ConfigProvider {
  id: string
  name: string
  website: string
  apiKeyUrl: string
  apiBaseUrl: string
  logoUrl: string
  supportsToolCalls: boolean
  supportsReasoning: boolean
  supportsStreaming: boolean
  models: ConfigModel[]
}

interface ConfigModel {
  id: string
  name: string
  contextWindow: number
  maxTokens: number
  maxOutputTokens?: number
  price: {
    input: number
    output: number
    currency: string
    per: string
  }
  capabilities: {
    imageInput: boolean
    imageOutput: boolean
    audioInput: boolean
    audioOutput: boolean
    toolCalls: boolean
    reasoning: boolean
    structuredOutputs: boolean
    functionCalling: boolean
  }
  isDefault: boolean
  isDeprecated: boolean
}

interface Config {
  version: string
  lastUpdated: string
  providers: ConfigProvider[]
}

const PROVIDER_ID_MAP: Record<string, string> = {
  openai: 'openai',
  anthropic: 'anthropic',
  alibaba: 'alibaba',
  deepseek: 'deepseek',
  zhipuai: 'zhipuai',
  minimax: 'minimax',
  moonshotai: 'moonshotai',
  google: 'google',
  xai: 'xai',
  siliconflow: 'siliconflow'
}

const PROVIDER_URLS: Record<string, { website: string; apiKeyUrl: string }> = {
  openai: {
    website: 'https://openai.com',
    apiKeyUrl: 'https://platform.openai.com/api-keys'
  },
  anthropic: {
    website: 'https://anthropic.com',
    apiKeyUrl: 'https://console.anthropic.com'
  },
  alibaba: {
    website: 'https://www.alibabacloud.com',
    apiKeyUrl: 'https://dashscope.aliyun.com'
  },
  deepseek: {
    website: 'https://deepseek.com',
    apiKeyUrl: 'https://platform.deepseek.com'
  },
  zhipuai: {
    website: 'https://zhipu.ai',
    apiKeyUrl: 'https://zhipu.ai/manage-apikey/apikey-list'
  },
  minimax: {
    website: 'https://platform.minimax.io',
    apiKeyUrl: 'https://platform.minimax.io/docs/guides/quickstart'
  },
  moonshotai: {
    website: 'https://moonshot.ai',
    apiKeyUrl: 'https://platform.moonshot.ai'
  },
  google: {
    website: 'https://ai.google.com',
    apiKeyUrl: 'https://makersuite.google.com/app/apikey'
  },
  xai: {
    website: 'https://x.ai',
    apiKeyUrl: 'https://console.x.ai'
  },
  siliconflow: {
    website: 'https://siliconflow.cn',
    apiKeyUrl: 'https://cloud.siliconflow.cn/api-key'
  }
}

const PROVIDER_LOGOS: Record<string, string> = {
  openai: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/ChatGPT_logo.svg/2048px-ChatGPT_logo.svg.png',
  anthropic: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Anthropic-logo.svg/1200px-Anthropic-logo.svg.png',
  alibaba: 'https://www.aliyun.com/favicon.ico',
  deepseek: 'https://deepseek.com/favicon.ico',
  zhipuai: 'https://zhipu.ai/favicon.ico',
  minimax: 'https://platform.minimax.io/favicon.ico',
  moonshotai: 'https://moonshot.ai/favicon.ico',
  google: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Google_2015_logo.svg/2560px-Google_2015_logo.svg.png',
  xai: 'https://x.ai/favicon.ico',
  siliconflow: 'https://siliconflow.cn/favicon.ico'
}

async function fetchModelsDevData(): Promise<Record<string, ModelsDevProvider>> {
  const response = await fetch('https://models.dev/api.json')
  if (!response.ok) {
    throw new Error(`Failed to fetch models.dev data: ${response.status} ${response.statusText}`)
  }
  return await response.json()
}

function loadTempModels(): Record<string, ModelsDevProvider> {
  const tempPath = path.join(process.cwd(), 'temp/models.json')
  if (!fs.existsSync(tempPath)) {
    return {}
  }
  const content = fs.readFileSync(tempPath, 'utf-8').trim()
  if (!content) {
    return {}
  }
  try {
    return JSON.parse(content)
  } catch {
    return {}
  }
}

function loadCurrentConfig(): Config {
  const configPath = path.join(process.cwd(), 'lib/ai-providers-config.json')
  
  if (!fs.existsSync(configPath)) {
    return createDefaultConfig()
  }
  
  const content = fs.readFileSync(configPath, 'utf-8').trim()
  
  if (!content) {
    return createDefaultConfig()
  }
  
  try {
    return JSON.parse(content)
  } catch {
    return createDefaultConfig()
  }
}

function createDefaultConfig(): Config {
  return {
    version: '1.0.0',
    lastUpdated: new Date().toISOString().split('T')[0],
    providers: []
  }
}

function saveConfig(config: Config): void {
  const configPath = path.join(process.cwd(), 'lib/ai-providers-config.json')
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
}

function transformModelFromDev(
  modelId: string,
  modelData: ModelsDevModel,
  isDefault: boolean = false
): ConfigModel {
  const modalitiesInput = modelData.modalities?.input || []
  const modalitiesOutput = modelData.modalities?.output || []
  
  return {
    id: modelData.id,
    name: modelData.name,
    contextWindow: modelData.limit?.context || 0,
    maxTokens: modelData.limit?.output || 4096,
    maxOutputTokens: modelData.limit?.output || 4096,
    price: {
      input: modelData.cost?.input || 0,
      output: modelData.cost?.output || 0,
      currency: 'USD',
      per: '1M tokens'
    },
    capabilities: {
      imageInput: modalitiesInput.includes('image'),
      imageOutput: modalitiesOutput.includes('image'),
      audioInput: modalitiesInput.includes('audio'),
      audioOutput: modalitiesOutput.includes('audio'),
      toolCalls: modelData.tool_call || false,
      reasoning: modelData.reasoning || false,
      structuredOutputs: modelData.structured_output || true,
      functionCalling: modelData.tool_call || false
    },
    isDefault,
    isDeprecated: false
  }
}

function updateProviderFromDev(
  existingProvider: ConfigProvider,
  devProvider: ModelsDevProvider
): ConfigProvider {
  const providerId = PROVIDER_ID_MAP[existingProvider.id] || existingProvider.id
  const providerUrls = PROVIDER_URLS[providerId] || {
    website: '',
    apiKeyUrl: ''
  }
  
  const models: ConfigModel[] = []
  const devModelIds = Object.keys(devProvider.models)
  
  const existingModelIds = existingProvider.models.map(m => m.id)
  const allModelIds = new Set([...existingModelIds, ...devModelIds])
  
  for (const modelId of allModelIds) {
    const devModel = devProvider.models[modelId]
    const existingModel = existingProvider.models.find(m => m.id === modelId)
    
    const isDefault = existingModel?.isDefault || false
    
    if (devModel) {
      models.push(transformModelFromDev(modelId, devModel, isDefault))
    } else if (existingModel) {
      models.push({ ...existingModel })
    }
  }
  
  if (models.length > 0 && !models.find(m => m.isDefault)) {
    models[0].isDefault = true
  }
  
  return {
    ...existingProvider,
    id: existingProvider.id,
    name: devProvider.name || existingProvider.name,
    website: providerUrls.website || existingProvider.website,
    apiKeyUrl: providerUrls.apiKeyUrl || existingProvider.apiKeyUrl,
    apiBaseUrl: devProvider.api || existingProvider.apiBaseUrl,
    logoUrl: PROVIDER_LOGOS[providerId] || existingProvider.logoUrl,
    supportsToolCalls: models.some(m => m.capabilities.toolCalls),
    supportsReasoning: models.some(m => m.capabilities.reasoning),
    supportsStreaming: true,
    models
  }
}

function createProviderFromDev(
  providerId: string,
  devProvider: ModelsDevProvider
): ConfigProvider {
  const providerUrls = PROVIDER_URLS[providerId] || {
    website: '',
    apiKeyUrl: ''
  }
  
  const models: ConfigModel[] = []
  const devModelIds = Object.keys(devProvider.models)
  
  for (const modelId of devModelIds) {
    const devModel = devProvider.models[modelId]
    
    if (devModel) {
      const isDefault = models.length === 0
      models.push(transformModelFromDev(modelId, devModel, isDefault))
    }
  }
  
  return {
    id: providerId,
    name: devProvider.name || providerId,
    website: providerUrls.website || '',
    apiKeyUrl: providerUrls.apiKeyUrl || '',
    apiBaseUrl: devProvider.api || '',
    logoUrl: PROVIDER_LOGOS[providerId] || '',
    supportsToolCalls: models.some(m => m.capabilities.toolCalls),
    supportsReasoning: models.some(m => m.capabilities.reasoning),
    supportsStreaming: true,
    models
  }
}

async function main(): Promise<void> {
  console.log('📦 Loading temp/models.json...')
  const tempModels = loadTempModels()
  
  console.log('📦 Loading current config...')
  const currentConfig = loadCurrentConfig()
  
  console.log('🌐 Fetching latest data from models.dev...')
  const devData = await fetchModelsDevData()
  
  console.log('🔄 Updating providers...')
  const updatedProviders: ConfigProvider[] = []
  
  if (currentConfig.providers.length === 0) {
    console.log('  - Creating new providers from temp models and dev data...')
    
    for (const [providerId, tempProvider] of Object.entries(tempModels)) {
      if (PROVIDER_ID_MAP[providerId]) {
        console.log(`    - Creating ${tempProvider.name} from temp...`)
        const newProvider = createProviderFromDev(providerId, tempProvider)
        updatedProviders.push(newProvider)
      }
    }
    
    for (const [providerId, devProvider] of Object.entries(devData)) {
      if (PROVIDER_ID_MAP[providerId] && !updatedProviders.find(p => p.id === providerId)) {
        console.log(`    - Creating ${devProvider.name} from dev...`)
        const newProvider = createProviderFromDev(providerId, devProvider)
        updatedProviders.push(newProvider)
      }
    }
  } else {
    for (const existingProvider of currentConfig.providers) {
      const providerId = PROVIDER_ID_MAP[existingProvider.id] || existingProvider.id
      
      const tempProvider = tempModels[providerId]
      const devProvider = devData[providerId]
      
      if (tempProvider) {
        console.log(`  - Updating ${existingProvider.name} from temp...`)
        const updatedProvider = updateProviderFromDev(existingProvider, tempProvider)
        updatedProviders.push(updatedProvider)
      } else if (devProvider) {
        console.log(`  - Updating ${existingProvider.name} from dev...`)
        const updatedProvider = updateProviderFromDev(existingProvider, devProvider)
        updatedProviders.push(updatedProvider)
      } else {
        console.log(`  - ${existingProvider.name} (no new data)`)
        updatedProviders.push(existingProvider)
      }
    }
    
    for (const providerId of Object.keys(PROVIDER_ID_MAP)) {
      if (!updatedProviders.find(p => p.id === providerId)) {
        const tempProvider = tempModels[providerId]
        const devProvider = devData[providerId]
        
        if (tempProvider) {
          console.log(`  - Adding ${providerId} from temp...`)
          const newProvider = createProviderFromDev(providerId, tempProvider)
          updatedProviders.push(newProvider)
        } else if (devProvider) {
          console.log(`  - Adding ${providerId} from dev...`)
          const newProvider = createProviderFromDev(providerId, devProvider)
          updatedProviders.push(newProvider)
        }
      }
    }
  }
  
  const updatedConfig: Config = {
    version: currentConfig.version || '1.0.0',
    lastUpdated: new Date().toISOString().split('T')[0],
    providers: updatedProviders
  }
  
  console.log('💾 Saving updated config...')
  saveConfig(updatedConfig)
  
  console.log('✅ Done! Config has been updated.')
}

main().catch(err => {
  console.error('❌ Error:', err)
  process.exit(1)
})
