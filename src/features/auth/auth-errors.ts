import { ApiError } from '@/lib/api/errors'

export function isInvalidSessionError(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.code === 'AUTH_REQUIRED' || error.code === 'AUTH_FAILED')
  )
}

export function getLoginErrorMessage(error: unknown) {
  if (!(error instanceof ApiError)) {
    return '登录暂时无法完成，请稍后重试。'
  }

  switch (error.code) {
    case 'VALIDATION_ERROR':
      return '请检查邮箱和密码后重试。'
    case 'AUTH_REQUIRED':
    case 'AUTH_FAILED':
      return '邮箱或密码错误，或账户当前无法登录。'
    case 'UPSTREAM_TIMEOUT':
      return '服务响应超时，请稍后重试。'
    case 'UPSTREAM_ERROR':
      return '服务暂时不可用，请稍后重试。'
    case 'NETWORK_ERROR':
      return '无法连接服务，请检查网络后重试。'
    case 'API_BASE_URL_MISSING':
      return '服务地址尚未配置。'
    default:
      return '登录暂时无法完成，请稍后重试。'
  }
}

export function getBootstrapErrorMessage(error: unknown) {
  if (!(error instanceof ApiError)) {
    return '暂时无法验证登录状态，请稍后重试。'
  }

  switch (error.code) {
    case 'NETWORK_ERROR':
      return '无法连接服务。服务端会话未被确认为失效，请稍后重试。'
    case 'UPSTREAM_TIMEOUT':
      return '服务响应超时。服务端会话未被确认为失效，请稍后重试。'
    case 'UPSTREAM_ERROR':
      return '服务暂时不可用。服务端会话未被确认为失效，请稍后重试。'
    default:
      return '暂时无法验证登录状态。请稍后重试。'
  }
}
