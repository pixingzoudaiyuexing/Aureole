import { ApiError } from '@/lib/api/errors'

const ambiguousCodes = new Set([
  'NETWORK_ERROR',
  'UPSTREAM_TIMEOUT',
  'UPSTREAM_ERROR',
  'MALFORMED_RESPONSE',
])

export function isAmbiguousCommissionTransferError(error: unknown) {
  return !(error instanceof ApiError) || ambiguousCodes.has(error.code)
}
