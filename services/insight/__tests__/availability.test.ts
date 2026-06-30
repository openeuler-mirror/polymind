import {
  isInsightBackendUnavailable,
  isInsightCapabilitiesResponse,
} from '@/services/insight/availability'
import { ApiError, ApiErrorCode } from '@/lib/error-handler'

describe('insight availability helpers', () => {
  it('recognizes a valid insight capabilities response', () => {
    expect(
      isInsightCapabilitiesResponse({
        enabled: true,
        reachable: false,
        features: {
          sessions: true,
          timeseries: true,
          interruptions: false,
          health: true,
        },
      })
    ).toBe(true)
  })

  it('rejects non-capabilities responses', () => {
    expect(
      isInsightCapabilitiesResponse({
        agents: [],
        last_scan_time: Date.now(),
      })
    ).toBe(false)
    expect(isInsightCapabilitiesResponse('<html>not insight</html>')).toBe(false)
  })

  it('treats missing or unreachable bff probes as unavailable', () => {
    expect(
      isInsightBackendUnavailable(
        new ApiError('Resource not found', ApiErrorCode.RESOURCE_NOT_FOUND, 404)
      )
    ).toBe(true)
    expect(
      isInsightBackendUnavailable(
        new ApiError('Network connection failed', ApiErrorCode.NETWORK_ERROR)
      )
    ).toBe(true)
    expect(
      isInsightBackendUnavailable(new ApiError('Request timed out', ApiErrorCode.TIMEOUT_ERROR))
    ).toBe(true)
  })

  it('does not treat auth or upstream server errors as install-required outages', () => {
    expect(
      isInsightBackendUnavailable(new ApiError('Authentication required', ApiErrorCode.AUTH_ERROR))
    ).toBe(false)
    expect(
      isInsightBackendUnavailable(
        new ApiError('Internal server error', ApiErrorCode.SERVER_ERROR, 500)
      )
    ).toBe(false)
  })
})
