import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/providers/app-providers'
import { createQueryClient } from '@/app/providers/query-client'
import { createAppRouter } from '@/app/router/router'
import type { AuthApi } from '@/features/auth/auth-api'
import type {
  RecaptchaRenderOptions,
  RecaptchaV2Api,
} from '@/features/auth/challenge/recaptcha-types'
import {
  publicAccountApi,
  type OnboardingConfig,
} from '@/features/auth/public-account-api'
import { ApiError } from '@/lib/api/errors'
import { AUTH_SESSION_STORAGE_KEY } from '@/lib/auth/credential-storage'
import { useAuthSessionStore } from '@/lib/auth/session-store'

const disabledConfig: OnboardingConfig = {
  termsUrl: null,
  emailVerificationRequired: false,
  inviteCodeRequired: false,
  emailSuffixWhitelist: null,
  antiBot: { state: 'disabled' },
}

function createAuthApi(): AuthApi {
  return {
    login: vi.fn(),
    getCurrentUser: vi.fn().mockRejectedValue(
      new ApiError({
        status: 401,
        code: 'AUTH_REQUIRED',
        message: 'Authentication required',
      }),
    ),
  }
}

function renderRecovery(config: OnboardingConfig) {
  vi.spyOn(publicAccountApi, 'getOnboardingConfig').mockResolvedValue(config)
  const authApi = createAuthApi()
  const router = createAppRouter({ initialEntries: ['/forgot-password'] })
  render(
    <AppProviders
      router={router}
      authApi={authApi}
      queryClient={createQueryClient()}
    />,
  )
  return { authApi, router }
}

async function fillRecoveryForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('邮箱'), 'member@example.com')
  await user.type(screen.getByLabelText('邮箱验证码'), '123456')
  await user.type(screen.getByLabelText('新密码'), 'new-password123')
  await user.type(screen.getByLabelText('确认新密码'), 'new-password123')
}

function installRecaptchaMock() {
  let options: RecaptchaRenderOptions | null = null
  const api: RecaptchaV2Api = {
    ready: (callback) => callback(),
    render: vi.fn((_, renderOptions) => {
      options = renderOptions
      return 17
    }),
    reset: vi.fn(),
  }
  window.grecaptcha = api
  return {
    api,
    getOptions: () => {
      if (!options) throw new Error('Challenge was not rendered')
      return options
    },
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('Password Recovery flow', () => {
  it('sends password-reset code without challenge when AntiBot is disabled', async () => {
    const sendEmailCode = vi
      .spyOn(publicAccountApi, 'sendEmailCode')
      .mockResolvedValue({ sent: true as const })
    renderRecovery(disabledConfig)
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('邮箱'), 'member@example.com')
    await user.click(screen.getByRole('button', { name: '发送验证码' }))

    expect(sendEmailCode).toHaveBeenCalledWith({
      email: 'member@example.com',
      purpose: 'password-reset',
    })
    expect(await screen.findByText('验证码已发送')).toBeInTheDocument()
    expect(document.getElementById('aureole-recaptcha-v2-script')).toBeNull()
  })

  it('fails closed for an unsupported AntiBot capability', async () => {
    const sendEmailCode = vi.spyOn(publicAccountApi, 'sendEmailCode')
    const resetPassword = vi.spyOn(publicAccountApi, 'resetPassword')
    renderRecovery({
      ...disabledConfig,
      antiBot: {
        state: 'unsupported',
        provider: 'future-provider',
        mode: 'future-mode',
      },
    })

    expect(
      await screen.findByText('当前验证方式暂不受支持'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发送验证码' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '重置密码' })).toBeDisabled()
    expect(sendEmailCode).not.toHaveBeenCalled()
    expect(resetPassword).not.toHaveBeenCalled()
    expect(document.getElementById('aureole-recaptcha-v2-script')).toBeNull()
  })

  it('uses and consumes challenge only for the password-reset email code', async () => {
    const { api, getOptions } = installRecaptchaMock()
    const sendEmailCode = vi
      .spyOn(publicAccountApi, 'sendEmailCode')
      .mockResolvedValue({ sent: true as const })
    const resetPassword = vi
      .spyOn(publicAccountApi, 'resetPassword')
      .mockResolvedValue({ reset: true as const })
    const { router } = renderRecovery({
      ...disabledConfig,
      antiBot: {
        state: 'supported',
        provider: 'recaptcha',
        mode: 'v2-checkbox',
        siteKey: 'public-site-key',
      },
    })
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('邮箱'), 'member@example.com')
    await waitFor(() => expect(api.render).toHaveBeenCalledOnce())
    act(() => getOptions().callback('password-code-challenge'))
    await user.click(screen.getByRole('button', { name: '发送验证码' }))

    expect(sendEmailCode).toHaveBeenCalledWith({
      email: 'member@example.com',
      purpose: 'password-reset',
      challengeToken: 'password-code-challenge',
    })
    expect(api.reset).toHaveBeenCalledWith(17)

    await user.type(screen.getByLabelText('邮箱验证码'), '123456')
    await user.type(screen.getByLabelText('新密码'), 'new-password123')
    await user.type(screen.getByLabelText('确认新密码'), 'new-password123')
    await user.click(screen.getByRole('button', { name: '重置密码' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(resetPassword).toHaveBeenCalledWith({
      email: 'member@example.com',
      emailCode: '123456',
      newPassword: 'new-password123',
    })
    expect(resetPassword.mock.calls[0]?.[0]).not.toHaveProperty(
      'challengeToken',
    )
    expect(resetPassword.mock.calls[0]?.[0]).not.toHaveProperty(
      'confirmNewPassword',
    )
    expect(
      await screen.findByText('密码已重置，请使用新密码登录。'),
    ).toBeInTheDocument()
  })

  it('returns to Login after reset without creating an Auth session', async () => {
    vi.spyOn(publicAccountApi, 'sendEmailCode').mockResolvedValue({
      sent: true,
    })
    vi.spyOn(publicAccountApi, 'resetPassword').mockResolvedValue({
      reset: true,
    })
    const { authApi, router } = renderRecovery(disabledConfig)
    const user = userEvent.setup()

    await fillRecoveryForm(user)
    await user.click(screen.getByRole('button', { name: '重置密码' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(authApi.login).not.toHaveBeenCalled()
    expect(authApi.getCurrentUser).toHaveBeenCalled()
    expect(useAuthSessionStore.getState().accessToken).toBeNull()
    expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
  })

  it('validates the exact code, password range, and local confirmation', async () => {
    const resetPassword = vi.spyOn(publicAccountApi, 'resetPassword')
    renderRecovery(disabledConfig)
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('邮箱'), 'member@example.com')
    await user.type(screen.getByLabelText('邮箱验证码'), '123')
    await user.type(screen.getByLabelText('新密码'), 'short')
    await user.type(screen.getByLabelText('确认新密码'), 'different')
    await user.click(screen.getByRole('button', { name: '重置密码' }))

    expect(await screen.findByText('请输入 6 位数字验证码')).toBeInTheDocument()
    expect(screen.getByText('密码至少需要 8 个字符')).toBeInTheDocument()
    expect(screen.getByText('两次输入的密码不一致')).toBeInTheDocument()
    expect(resetPassword).not.toHaveBeenCalled()
  })

  it.each([
    ['PASSWORD_RESET_FAILED', '暂时无法重置密码，请检查信息后重试。'],
    ['VERIFICATION_FAILED', '邮箱验证码或人机验证未通过，请重新验证。'],
  ])('maps %s without retry or automatic login', async (code, message) => {
    const resetPassword = vi
      .spyOn(publicAccountApi, 'resetPassword')
      .mockRejectedValue(
        new ApiError({ status: 422, code, message: 'Public error' }),
      )
    const { authApi, router } = renderRecovery(disabledConfig)
    const user = userEvent.setup()

    await fillRecoveryForm(user)
    await user.click(screen.getByRole('button', { name: '重置密码' }))

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(resetPassword).toHaveBeenCalledOnce()
    expect(router.state.location.pathname).toBe('/forgot-password')
    expect(authApi.login).not.toHaveBeenCalled()
  })

  it('maps email-code RATE_LIMITED and does not resend automatically', async () => {
    const sendEmailCode = vi
      .spyOn(publicAccountApi, 'sendEmailCode')
      .mockRejectedValue(
        new ApiError({
          status: 429,
          code: 'RATE_LIMITED',
          message: 'Rate limited',
        }),
      )
    renderRecovery(disabledConfig)
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('邮箱'), 'member@example.com')
    await user.click(screen.getByRole('button', { name: '发送验证码' }))

    expect(
      await screen.findByText('操作过于频繁，请稍后重试。'),
    ).toBeInTheDocument()
    expect(sendEmailCode).toHaveBeenCalledOnce()
  })

  it('prevents duplicate email-code submission while pending', async () => {
    let resolveSend!: (value: { sent: true }) => void
    const sendEmailCode = vi
      .spyOn(publicAccountApi, 'sendEmailCode')
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveSend = resolve
          }),
      )
    renderRecovery(disabledConfig)
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('邮箱'), 'member@example.com')
    await user.click(screen.getByRole('button', { name: '发送验证码' }))

    const pending = screen.getByRole('button', { name: '正在发送…' })
    expect(pending).toBeDisabled()
    await user.click(pending)
    expect(sendEmailCode).toHaveBeenCalledOnce()

    resolveSend({ sent: true })
    expect(await screen.findByText('验证码已发送')).toBeInTheDocument()
  })

  it('starts only one email-code request for same-tick actions', async () => {
    const deferred = createDeferred<{ sent: true }>()
    const sendEmailCode = vi
      .spyOn(publicAccountApi, 'sendEmailCode')
      .mockImplementation(() => deferred.promise)
    renderRecovery(disabledConfig)
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('邮箱'), 'member@example.com')
    const sendButton = screen.getByRole('button', { name: '发送验证码' })
    act(() => {
      fireEvent.click(sendButton)
      fireEvent.click(sendButton)
    })

    await waitFor(() => expect(sendEmailCode).toHaveBeenCalledTimes(1))
    deferred.resolve({ sent: true })
  })

  it('starts only one Password Reset request for same-tick submissions', async () => {
    const deferred = createDeferred<{ reset: true }>()
    const resetPassword = vi
      .spyOn(publicAccountApi, 'resetPassword')
      .mockImplementation(() => deferred.promise)
    renderRecovery(disabledConfig)
    const user = userEvent.setup()

    await fillRecoveryForm(user)
    const form = screen
      .getByRole('button', { name: '重置密码' })
      .closest('form')!
    act(() => {
      fireEvent.submit(form)
      fireEvent.submit(form)
    })

    await waitFor(() => expect(resetPassword).toHaveBeenCalledTimes(1))
    deferred.resolve({ reset: true })
  })
})
