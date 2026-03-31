import { RequestConfig } from './types'
import { ApiErrorCode } from './error-handler'

// API错误类 - 仅在此文件中使用
class ApiError extends Error {
  public statusCode: number

  constructor(message: string, code: ApiErrorCode, statusCode: number) {
    super(message)
    this.statusCode = statusCode
    this.name = 'ApiError'
  }
}


/**
 * HTTP客户端类 - 负责处理所有HTTP请求
 * 使用单例模式确保全局只有一个实例
 */
class HttpClient {
  private static instance: HttpClient
  private baseUrl: string
  private defaultHeaders: HeadersInit
  private interceptors: {
    request: Array<(req: RequestConfig) => RequestConfig>
    response: Array<(res: Response) => Response>
  }

  private constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_AGENTD_API_URL || 'http://localhost:18080'
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
    this.interceptors = {
      request: [],
      response: []
    }
  }

  public static getInstance(): HttpClient {
    if (!HttpClient.instance) {
      HttpClient.instance = new HttpClient()
    }
    return HttpClient.instance
  }

  /**
   * 添加请求拦截器
   */
  public addRequestInterceptor(interceptor: (req: RequestConfig) => RequestConfig) {
    this.interceptors.request.push(interceptor)
  }

  /**
   * 添加响应拦截器
   */
  public addResponseInterceptor(interceptor: (res: Response) => Response) {
    this.interceptors.response.push(interceptor)
  }

  /**
   * 发起HTTP请求
   */
  public async request<T>(config: RequestConfig): Promise<T> {
    // 应用请求拦截器
    let processedConfig = { ...config }
    for (const interceptor of this.interceptors.request) {
      processedConfig = interceptor(processedConfig)
    }

    // 构建URL
    const url = `${this.baseUrl}${config.url}`
    
    // 构建请求选项
    const options: RequestInit = {
      method: config.method || 'GET',
      headers: {
        ...this.defaultHeaders,
        ...config.headers
      },
      body: config.data ? JSON.stringify(config.data) : undefined
    }

    // 发起请求
    let response = await fetch(url, options)

    // 应用响应拦截器
    for (const interceptor of this.interceptors.response) {
      response = interceptor(response)
    }

    // 检查响应状态
    if (!response.ok) {
      throw new ApiError(
        `HTTP Error: ${response.status} ${response.statusText}`,
        ApiErrorCode.SERVER_ERROR,
        response.status
      )
    }

    // 解析响应数据
    const contentType = response.headers.get('content-type')
    if (contentType && contentType.includes('application/json')) {
      return await response.json()
    } else {
      return await response.text() as unknown as T
    }
  }

  /**
   * GET请求
   */
  public async get<T>(url: string, config?: Omit<RequestConfig, 'url' | 'method'>): Promise<T> {
    return this.request<T>({ ...config, url, method: 'GET' })
  }

  /**
   * POST请求
   */
  public async post<T>(url: string, data?: any, config?: Omit<RequestConfig, 'url' | 'method'>): Promise<T> {
    return this.request<T>({ ...config, url, method: 'POST', data })
  }

  /**
   * PUT请求
   */
  public async put<T>(url: string, data?: any, config?: Omit<RequestConfig, 'url' | 'method'>): Promise<T> {
    return this.request<T>({ ...config, url, method: 'PUT', data })
  }

  /**
   * DELETE请求
   */
  public async delete<T>(url: string, config?: Omit<RequestConfig, 'url' | 'method'>): Promise<T> {
    return this.request<T>({ ...config, url, method: 'DELETE' })
  }

  /**
   * PATCH请求
   */
  public async patch<T>(url: string, data?: any, config?: Omit<RequestConfig, 'url' | 'method'>): Promise<T> {
    return this.request<T>({ ...config, url, method: 'PATCH', data })
  }
}

// 导出单例实例
export const httpClient = HttpClient.getInstance()