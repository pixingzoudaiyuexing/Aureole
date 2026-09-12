import { describe, expect, it } from 'vitest'
import { getLifecycleErrorMessage } from '@/features/auth/account-lifecycle-errors'
import { ApiError } from '@/lib/api/errors'

describe('Account lifecycle error translation', () => {
  it.each([
    ['VALIDATION_ERROR', '请检查填写内容后重试。'],
    [
      'REGISTRATION_UNAVAILABLE',
      '当前无法完成注册；邮箱、邀请码、注册状态或站点规则可能不满足要求。',
    ],
    ['VERIFICATION_FAILED', '邮箱验证码或人机验证未通过，请重新验证。'],
    ['PASSWORD_RESET_FAILED', '暂时无法重置密码，请检查信息后重试。'],
    ['RATE_LIMITED', '操作过于频繁，请稍后重试。'],
    ['UPSTREAM_TIMEOUT', '服务响应超时，请稍后重试。'],
    ['UPSTREAM_ERROR', '服务暂时不可用，请稍后重试。'],
    ['NETWORK_ERROR', '无法连接服务，请检查网络后重试。'],
  ])('maps stable %s without inspecting raw messages', (code, expected) => {
    expect(
      getLifecycleErrorMessage(
        new ApiError({ status: 400, code, message: 'Untrusted raw message' }),
        'register',
      ),
    ).toBe(expected)
  })
})
