import { ApiError } from '@/lib/api/errors'

const ambiguousCodes = new Set([
  'NETWORK_ERROR',
  'UPSTREAM_TIMEOUT',
  'UPSTREAM_ERROR',
  'MALFORMED_RESPONSE',
])

export function isAmbiguousTicketCreateError(error: unknown) {
  return !(error instanceof ApiError) || ambiguousCodes.has(error.code)
}

export function getTicketCreateErrorMessage(error: unknown) {
  if (!(error instanceof ApiError)) {
    return '工单提交未能完成，请确认内容后重新提交。'
  }

  switch (error.code) {
    case 'TICKET_UNAVAILABLE':
      return '当前暂时无法创建新工单，请检查已有工单或账户状态。'
    case 'VALIDATION_ERROR':
      return '工单内容无效，请检查主题、优先级和问题描述。'
    case 'TICKET_CREATE_FAILED':
    default:
      return '工单提交未能完成，请确认内容后重新提交。'
  }
}
