import { ApiError } from '@/lib/api/errors'

const definitiveCodes = new Set([
  'WITHDRAWAL_DISABLED',
  'WITHDRAWAL_METHOD_UNSUPPORTED',
  'WITHDRAWAL_MINIMUM_NOT_MET',
  'WITHDRAWAL_REQUEST_FAILED',
  'VALIDATION_ERROR',
])

export function isAmbiguousWithdrawalRequestError(error: unknown) {
  return !(error instanceof ApiError) || !definitiveCodes.has(error.code)
}
