import { ApiError, ApiErrorCode } from '@/lib/error-handler'
import type { InsightCapabilitiesResponse } from './api-types'

export const WITTY_INSIGHT_PROJECT_URL = 'https://gitcode.com/openeuler/witty-insight'

export type InsightAvailabilityStatus = 'checking' | 'available' | 'unavailable'

export function isInsightCapabilitiesResponse(
  value: unknown
): value is InsightCapabilitiesResponse {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<InsightCapabilitiesResponse>
  const features = candidate.features as
    | Partial<InsightCapabilitiesResponse['features']>
    | undefined

  return (
    typeof candidate.enabled === 'boolean' &&
    typeof candidate.reachable === 'boolean' &&
    !!features &&
    typeof features.sessions === 'boolean' &&
    typeof features.timeseries === 'boolean' &&
    typeof features.interruptions === 'boolean' &&
    typeof features.health === 'boolean'
  )
}

export function isInsightBackendUnavailable(error: unknown): boolean {
  if (error instanceof ApiError) {
    return (
      error.statusCode === 404 ||
      error.code === ApiErrorCode.RESOURCE_NOT_FOUND ||
      error.code === ApiErrorCode.NETWORK_ERROR ||
      error.code === ApiErrorCode.TIMEOUT_ERROR
    )
  }

  return false
}
