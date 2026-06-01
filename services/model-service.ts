import { httpClient } from '@/lib/http-client'
import { ModelConfig, CreateModelRequest, UpdateModelRequest } from '@/lib/types'

class ModelService {
  public async getModels(): Promise<ModelConfig[]> {
    const response = await httpClient.get<ModelConfig[]>('/models')
    if (!response) {
      throw new Error('Invalid API response: no response received')
    }
    const modelsData = Array.isArray(response) ? response : []
    return modelsData.map(model => this.transformModel(model))
  }

  public async getModel(modelId: string): Promise<ModelConfig> {
    const response = await httpClient.get<ModelConfig>(`/models/${modelId}`)
    if (!response) {
      throw new Error('Invalid API response: no response received')
    }
    return this.transformModel(response)
  }

  public async createModel(request: CreateModelRequest): Promise<ModelConfig> {
    const backendRequest = {
      name: request.name,
      provider: request.provider,
      api_key: request.apiKey,
      api_base_url: request.apiBaseUrl,
      enabled: request.enabled ?? true,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.7,
      is_default: request.isDefault ?? false
    }

    const response = await httpClient.post<ModelConfig>('/models', backendRequest)
    if (!response) {
      throw new Error('Invalid API response: no response received')
    }
    return this.transformModel(response)
  }

  public async updateModel(modelId: string, request: UpdateModelRequest): Promise<ModelConfig> {
    const backendRequest: Record<string, any> = {}
    
    if (request.name !== undefined) backendRequest.name = request.name
    if (request.provider !== undefined) backendRequest.provider = request.provider
    if (request.apiKey !== undefined) backendRequest.api_key = request.apiKey
    if (request.apiBaseUrl !== undefined) backendRequest.api_base_url = request.apiBaseUrl
    if (request.enabled !== undefined) backendRequest.enabled = request.enabled
    if (request.maxTokens !== undefined) backendRequest.max_tokens = request.maxTokens
    if (request.temperature !== undefined) backendRequest.temperature = request.temperature
    if (request.isDefault !== undefined) backendRequest.is_default = request.isDefault

    const response = await httpClient.put<ModelConfig>(`/models/${modelId}`, backendRequest)
    if (!response) {
      throw new Error('Invalid API response: no response received')
    }
    return this.transformModel(response)
  }

  public async deleteModel(modelId: string): Promise<void> {
    await httpClient.delete(`/models/${modelId}`)
  }

  private transformModel(model: any): ModelConfig {
    if (!model || typeof model !== 'object') {
      throw new Error('Model data is invalid')
    }

    return {
      id: model.id,
      name: model.name,
      provider: model.provider,
      apiBaseUrl: model.api_base_url || model.apiBaseUrl,
      enabled: model.enabled ?? true,
      maxTokens: model.max_tokens ?? model.maxTokens ?? 4096,
      temperature: model.temperature ?? model.temperature ?? 0.7,
      isDefault: model.is_default ?? model.isDefault ?? false,
      createdAt: model.created_at || model.createdAt,
      updatedAt: model.updated_at || model.updatedAt
    }
  }
}

export const modelService = new ModelService()
