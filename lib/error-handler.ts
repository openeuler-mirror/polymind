/**
 * API错误处理工具
 */

import { toast } from 'sonner'

// API错误类型
export enum ApiErrorCode {
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  SERVER_ERROR = 'SERVER_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

// API错误类
export class ApiError extends Error {
  public statusCode?: number
  public code: ApiErrorCode
  public details?: any

  constructor(
    message: string,
    code: ApiErrorCode = ApiErrorCode.UNKNOWN_ERROR,
    statusCode?: number,
    details?: any
  ) {
    super(message)
    this.code = code
    this.statusCode = statusCode
    this.details = details
    this.name = 'ApiError'
  }
}

// 网络错误类
export class NetworkError extends ApiError {
  constructor(message: string = 'Network error occurred') {
    super(message, ApiErrorCode.NETWORK_ERROR)
    this.name = 'NetworkError'
  }
}

// 超时错误类
export class TimeoutError extends ApiError {
  constructor(message: string = 'Request timed out') {
    super(message, ApiErrorCode.TIMEOUT_ERROR)
    this.name = 'TimeoutError'
  }
}

// 认证错误类
export class AuthError extends ApiError {
  constructor(message: string = 'Authentication failed') {
    super(message, ApiErrorCode.AUTH_ERROR)
    this.name = 'AuthError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function extractMessageFromPayload(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null
  }

  const nestedDetails = payload.details
  if (isRecord(nestedDetails)) {
    const nestedDetailsMessage = extractMessageFromPayload(nestedDetails)
    if (nestedDetailsMessage) {
      return nestedDetailsMessage
    }
  }

  const directKeys = ['error', 'reason', 'upstream_error_message', 'message'] as const
  for (const key of directKeys) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  const nestedError = payload.error
  if (isRecord(nestedError)) {
    const nestedErrorMessage = extractMessageFromPayload(nestedError)
    if (nestedErrorMessage) {
      return nestedErrorMessage
    }
  }

  const nestedUpstreamDetails = payload.upstream_error_details
  if (isRecord(nestedUpstreamDetails)) {
    return extractMessageFromPayload(nestedUpstreamDetails)
  }

  return null
}

export function extractApiErrorMessage(
  error: unknown,
  fallback: string = '发生未知错误，请稍后重试。'
): string {
  if (error instanceof ApiError) {
    const payloadMessage = extractMessageFromPayload(error.details)
    if (payloadMessage) {
      return payloadMessage
    }
    return ErrorHandler.getErrorMessage(error)
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }

  return fallback
}

// 错误处理工具类
class ErrorHandler {
  /**
   * 处理API错误
   */
  public static handle(error: any, context?: string): ApiError {
    // 如果已经是ApiError，直接返回
    if (error instanceof ApiError) {
      return error
    }

    // 网络错误
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return new NetworkError('Network connection failed')
    }

    // 超时错误（包括AbortError）
    if (error instanceof TimeoutError || error.name === 'AbortError') {
      return new TimeoutError()
    }

    // HTTP错误
    if (error.statusCode) {
      switch (error.statusCode) {
        case 401:
          return new AuthError('Authentication required')
        case 403:
          return new ApiError('Access forbidden', ApiErrorCode.AUTH_ERROR, 403)
        case 404:
          return new ApiError('Resource not found', ApiErrorCode.RESOURCE_NOT_FOUND, 404)
        case 422:
          return new ApiError('Validation failed', ApiErrorCode.VALIDATION_ERROR, 422)
        case 500:
          return new ApiError('Internal server error', ApiErrorCode.SERVER_ERROR, 500)
        default:
          return new ApiError(
            error.message || `HTTP error ${error.statusCode}`,
            ApiErrorCode.SERVER_ERROR,
            error.statusCode
          )
      }
    }

    // Fetch错误
    if (error.name === 'FetchError') {
      return new NetworkError(error.message)
    }

    // 未知错误
    return new ApiError(
      error.message || `Unknown error${context ? ` in ${context}` : ''}`,
      ApiErrorCode.UNKNOWN_ERROR
    )
  }

  /**
   * 显示错误消息
   */
  public static showError(error: ApiError, showToast: boolean = true): void {
    const message = this.getErrorMessage(error)

    if (showToast) {
      toast.error(message, {
        duration: 5000,
      })
    }

    console.error('API Error:', error)
  }

  /**
   * 获取错误消息
   */
  public static getErrorMessage(error: ApiError): string {
    switch (error.code) {
      case ApiErrorCode.NETWORK_ERROR:
        return '网络连接失败，请检查网络设置'
      case ApiErrorCode.TIMEOUT_ERROR:
        return '请求超时，请稍后重试'
      case ApiErrorCode.AUTH_ERROR:
        return '认证失败，请重新登录'
      case ApiErrorCode.RESOURCE_NOT_FOUND:
        return '请求的资源不存在'
      case ApiErrorCode.VALIDATION_ERROR:
        return '请求参数验证失败'
      case ApiErrorCode.SERVER_ERROR:
        return `服务器错误 (${error.statusCode})，请稍后重试`
      default:
        return error.message || '发生未知错误'
    }
  }

  /**
   * 检查是否为认证错误
   */
  public static isAuthError(error: ApiError): boolean {
    return error.code === ApiErrorCode.AUTH_ERROR || error.statusCode === 401
  }

  /**
   * 重定向到登录页（如果需要）
   */
  public static redirectToLogin(): void {
    // 在浏览器环境中重定向到登录页
    if (typeof window !== 'undefined') {
      // 清除认证信息
      localStorage.removeItem('polymind_auth_token')
      localStorage.removeItem('polymind_refresh_token')

      // 重定向到登录页
      window.location.href = '/login'
    }
  }
}

export { ErrorHandler }
