import { ApiError } from '@/lib/api/errors'

type LifecycleAction = 'email-code' | 'register' | 'password-reset'

export function getLifecycleErrorMessage(
  error: unknown,
  action: LifecycleAction,
) {
  if (!(error instanceof ApiError)) {
    return '操作暂时无法完成，请稍后重试。'
  }

  switch (error.code) {
    case 'VALIDATION_ERROR':
      return '请检查填写内容后重试。'
    case 'REGISTRATION_UNAVAILABLE':
      return '当前无法完成注册；邮箱、邀请码、注册状态或站点规则可能不满足要求。'
    case 'VERIFICATION_FAILED':
      return '邮箱验证码或人机验证未通过，请重新验证。'
    case 'PASSWORD_RESET_FAILED':
      return '暂时无法重置密码，请检查信息后重试。'
    case 'RATE_LIMITED':
      return '操作过于频繁，请稍后重试。'
    case 'UPSTREAM_TIMEOUT':
      return '服务响应超时，请稍后重试。'
    case 'UPSTREAM_ERROR':
      return '服务暂时不可用，请稍后重试。'
    case 'NETWORK_ERROR':
      return '无法连接服务，请检查网络后重试。'
    case 'API_BASE_URL_MISSING':
      return '服务地址尚未配置。'
    default:
      return action === 'email-code'
        ? '验证码暂时无法发送，请稍后重试。'
        : '操作暂时无法完成，请稍后重试。'
  }
}
