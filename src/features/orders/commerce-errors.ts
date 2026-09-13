import { ApiError } from '@/lib/api/errors'

const ambiguousCodes = new Set([
  'NETWORK_ERROR',
  'UPSTREAM_TIMEOUT',
  'UPSTREAM_ERROR',
  'MALFORMED_RESPONSE',
])

export function isAmbiguousCommerceMutationError(error: unknown) {
  return !(error instanceof ApiError) || ambiguousCodes.has(error.code)
}

export function getPromotionErrorMessage(error: unknown) {
  return error instanceof ApiError && error.code === 'PROMOTION_INVALID'
    ? '优惠码无效、不可用或不适用于当前套餐。'
    : '优惠码暂时无法验证，请手动重试。'
}

export function getCreateOrderErrorMessage(error: unknown) {
  if (!(error instanceof ApiError)) return '暂时无法创建订单。'
  switch (error.code) {
    case 'PROMOTION_INVALID':
      return '优惠码在创建订单时未通过最终验证，请检查后重新提交。'
    case 'VALIDATION_ERROR':
      return '下单信息无效，请重新选择周期并检查优惠码。'
    case 'ORDER_CREATE_FAILED':
      return '服务未能创建订单，请检查选择后重试。'
    default:
      return '暂时无法创建订单。'
  }
}
