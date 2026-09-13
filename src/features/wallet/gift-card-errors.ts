import { ApiError } from '@/lib/api/errors'

const ambiguousCodes = new Set([
  'NETWORK_ERROR',
  'UPSTREAM_TIMEOUT',
  'UPSTREAM_ERROR',
  'MALFORMED_RESPONSE',
])

export function isAmbiguousGiftCardError(error: unknown) {
  return !(error instanceof ApiError) || ambiguousCodes.has(error.code)
}

export function getGiftCardErrorMessage(error: unknown) {
  if (!(error instanceof ApiError))
    return '礼品卡兑换未能完成，请重新确认后再试。'
  switch (error.code) {
    case 'GIFT_CARD_NOT_FOUND':
      return '未找到该礼品卡。'
    case 'GIFT_CARD_NOT_ACTIVE':
      return '该礼品卡尚未生效。'
    case 'GIFT_CARD_EXPIRED':
      return '该礼品卡已过期。'
    case 'GIFT_CARD_USAGE_LIMIT_REACHED':
      return '该礼品卡的使用次数已达到限制。'
    case 'GIFT_CARD_ALREADY_REDEEMED':
      return '该礼品卡已被当前账户使用过。'
    case 'GIFT_CARD_NOT_APPLICABLE':
      return '该礼品卡当前不适用于此账户。'
    case 'VALIDATION_ERROR':
      return '礼品卡信息无效，请检查后重新提交。'
    case 'GIFT_CARD_REDEEM_FAILED':
    default:
      return '礼品卡兑换未能完成，请重新确认后再试。'
  }
}
