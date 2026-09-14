import { ApiError } from '@/lib/api/errors'

const ambiguousCodes = new Set([
  'NETWORK_ERROR',
  'UPSTREAM_TIMEOUT',
  'UPSTREAM_ERROR',
  'MALFORMED_RESPONSE',
])

export function isAmbiguousReferralCodeCreateError(error: unknown) {
  return !(error instanceof ApiError) || ambiguousCodes.has(error.code)
}

export function getReferralCodeCreateErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
    return '当前请求无效，邀请码未创建。'
  }
  return '暂时无法创建邀请码，请稍后重新确认后再试。'
}
