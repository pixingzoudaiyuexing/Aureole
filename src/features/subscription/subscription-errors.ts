import { ApiError } from '@/lib/api/errors'

const ambiguousRotationCodes = new Set([
  'NETWORK_ERROR',
  'UPSTREAM_TIMEOUT',
  'UPSTREAM_ERROR',
  'MALFORMED_RESPONSE',
])

export function isAmbiguousSubscriptionRotationError(error: unknown) {
  return !(error instanceof ApiError) || ambiguousRotationCodes.has(error.code)
}
