import { RequestConfig } from './types'
import { ApiErrorCode, ApiError, ErrorHandler } from './error-handler'
import { appConfig } from '@/app/config/index'


/**
 * HTTP客户端类 - 负责处理所有HTTP请求
 * 使用单例模式确保全局只有一个实例
 */
class HttpClient {
  private static instance: HttpClient
  private defaultHeaders: HeadersInit
  private interceptors: {
    request: Array<(req: RequestConfig) => RequestConfig>
    response: Array<(res: Response) => Response>
  }

  private constructor() {
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
    this.interceptors = {
      request: [
        // 添加 bearer 认证拦截器
        (req) => {
          const authToken = process.env.NEXT_PUBLIC_AUTH_TOKEN
          console.log('Auth Token:', authToken ? '存在' : '不存在', authToken)
          if (authToken) {
            return {
              ...req,
              headers: {
                ...req.headers,
                'Authorization': `Bearer ${authToken}`
              }
            }
          }
          return req
        }
      ],
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
  public async request<T>(requestConfig: RequestConfig): Promise<T> {
    // 应用请求拦截器
    let processedConfig = { ...requestConfig }
    for (const interceptor of this.interceptors.request) {
      processedConfig = interceptor(processedConfig)
    }

    // 构建URL
    const url = `${appConfig.api.baseUrl}${processedConfig.url}`
    
    // 构建请求选项
    const isFormData = processedConfig.data instanceof FormData
    const baseHeaders: Record<string, string> = { ...this.defaultHeaders } as Record<string, string>
    if (isFormData) {
      delete baseHeaders['Content-Type']
    }
    const options: RequestInit = {
      method: processedConfig.method || 'GET',
      headers: {
        ...baseHeaders,
        ...processedConfig.headers
      },
      body: isFormData ? processedConfig.data : processedConfig.data ? JSON.stringify(processedConfig.data) : undefined
    }
    
    console.log('Final Request Options:', {
      method: options.method,
      url: url,
      headers: options.headers,
      body: options.body
    })

    // 发起请求（带超时处理）
    const timeout = processedConfig.timeout || appConfig.api.timeout // 默认超时
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const fetchPromise = fetch(url, {
        ...options,
        signal: controller.signal
      })

      // 等待请求完成或超时
      let response = await fetchPromise

      // 清除超时定时器
      clearTimeout(timeoutId)

      // 应用响应拦截器
      for (const interceptor of this.interceptors.response) {
        response = interceptor(response)
      }

      // 检查响应状态
      console.log('HTTP Response:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      })
      
      if (!response.ok) {
        // 即使请求失败，也尝试解析响应数据并记录
        const contentType = response.headers.get('content-type')
        let errorData: any
        if (contentType && contentType.includes('application/json')) {
          errorData = await response.json()
        } else {
          errorData = await response.text()
        }
        console.error('Error Response:', errorData)
        throw new ApiError(
          `HTTP Error: ${response.status} ${response.statusText}`,
          response.status === 401 ? ApiErrorCode.AUTH_ERROR : ApiErrorCode.SERVER_ERROR,
          response.status,
          errorData
        )
      }
      
      // 解析并记录响应数据
      const contentType = response.headers.get('content-type')
      let responseData: any
      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json()
        console.log('Response Data:', responseData)
        return responseData as T
      } else {
        responseData = await response.text()
        console.log('Response Text:', responseData)
        return responseData as unknown as T
      }
    } catch (error: unknown) {
      // 清除超时定时器
      clearTimeout(timeoutId)
      
      // 打印原始错误信息
      console.error('原始错误:', error)
      console.error('错误类型:', error instanceof Error ? error.constructor.name : 'unknown')
      console.error('错误消息:', error instanceof Error ? error.message : 'unknown')

      // 使用 ErrorHandler 处理错误
      const handledError = ErrorHandler.handle(error as Error, `HTTP request to ${processedConfig.url}`)
      throw handledError
    }
  }

  /**
   * GET请求
   */
  public async get<T>(url: string, requestConfig?: Omit<RequestConfig, 'url' | 'method'>): Promise<T> {
    return this.request<T>({ ...requestConfig, url, method: 'GET' })
  }

  /**
   * POST请求
   */
  public async post<T>(url: string, data?: any, requestConfig?: Omit<RequestConfig, 'url' | 'method'>): Promise<T> {
    return this.request<T>({ ...requestConfig, url, method: 'POST', data })
  }

  /**
   * PUT请求
   */
  public async put<T>(url: string, data?: any, requestConfig?: Omit<RequestConfig, 'url' | 'method'>): Promise<T> {
    return this.request<T>({ ...requestConfig, url, method: 'PUT', data })
  }

  /**
   * DELETE请求
   */
  public async delete<T>(url: string, requestConfig?: Omit<RequestConfig, 'url' | 'method'>): Promise<T> {
    return this.request<T>({ ...requestConfig, url, method: 'DELETE' })
  }

  /**
   * PATCH请求
   */
  public async patch<T>(url: string, data?: any, requestConfig?: Omit<RequestConfig, 'url' | 'method'>): Promise<T> {
    return this.request<T>({ ...requestConfig, url, method: 'PATCH', data })
  }
}

// 导出单例实例
export const httpClient = HttpClient.getInstance()
