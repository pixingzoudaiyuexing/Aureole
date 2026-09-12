import { ApiError } from '@/lib/api/errors'

export function isAmbiguousAccountMutationError(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.code === 'NETWORK_ERROR' ||
      error.code === 'MALFORMED_RESPONSE' ||
      error.code === 'UPSTREAM_ERROR' ||
      error.code === 'UPSTREAM_TIMEOUT')
  )
}

export function getPreferencesErrorMessage(error: unknown) {
  if (!(error instanceof ApiError)) {
    return '暂时无法保存偏好设置，请稍后重试。'
  }

  switch (error.code) {
    case 'VALIDATION_ERROR':
      return '偏好设置无效，请刷新页面后重试。'
    case 'PREFERENCES_UPDATE_FAILED':
      return '无法保存偏好设置，请稍后重试。'
    default:
      return '暂时无法保存偏好设置，请稍后重试。'
  }
}

export function getPasswordChangeErrorMessage(error: unknown) {
  if (!(error instanceof ApiError)) {
    return '暂时无法修改密码，请稍后重试。'
  }

  switch (error.code) {
    case 'VALIDATION_ERROR':
      return '请检查密码内容后重试。'
    case 'PASSWORD_CHANGE_FAILED':
      return '无法修改密码，请确认当前密码后重试。'
    default:
      return '暂时无法修改密码，请稍后重试。'
  }
}
