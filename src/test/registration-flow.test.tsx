import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/providers/app-providers'
import { createQueryClient } from '@/app/providers/query-client'
import { createAppRouter } from '@/app/router/router'
import type { AuthApi, CurrentUser } from '@/features/auth/auth-api'
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

const disabledConfig: OnboardingConfig = {
  termsUrl: null,
  emailVerificationRequired: false,
  inviteCodeRequired: false,
  emailSuffixWhitelist: null,
  antiBot: { state: 'disabled' },
}

const currentUser: CurrentUser = {
  email: 'member@example.com',
  expiresAt: '2030-01-01T00:00:00.000Z',
  status: 'active',
}

function createAuthApi(overrides: Partial<AuthApi> = {}): AuthApi {
  return {
    login: vi.fn(),
    getCurrentUser: vi.fn().mockResolvedValue(currentUser),
    ...overrides,
  }
}

function renderRegistration(
  config: OnboardingConfig,
  authApi = createAuthApi(),
) {
  vi.spyOn(publicAccountApi, 'getOnboardingConfig').mockResolvedValue(config)
  const router = createAppRouter({ initialEntries: ['/register'] })
  render(
    <AppProviders
      router={router}
      authApi={authApi}
      queryClient={createQueryClient()}
    />,
  )
  return router
}

async function fillBaseRegistration(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('邮箱'), 'member@example.com')
  await user.type(screen.getByLabelText('密码'), 'password123')
  await user.type(screen.getByLabelText('确认密码'), 'password123')
}

function installRecaptchaMock() {
  let options: RecaptchaRenderOptions | null = null
  const api: RecaptchaV2Api = {
    ready: (callback) => callback(),
    render: vi.fn((_, renderOptions) => {
      options = renderOptions
      return 11
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

describe('Registration flow', () => {
  it('registers without optional requirements and reuses Session Core', async () => {
    const registerUser = vi
      .spyOn(publicAccountApi, 'register')
      .mockResolvedValue({
        accessToken: 'registered-token',
        tokenType: 'Bearer',
      })
    vi.spyOn(publicAccountApi, 'sendEmailCode')
    const getCurrentUser = vi.fn().mockResolvedValue(currentUser)
    const router = renderRegistration(
      disabledConfig,
      createAuthApi({ getCurrentUser }),
    )
    const user = userEvent.setup()

    await fillBaseRegistration(user)
    await user.click(screen.getByRole('button', { name: '注册账号' }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dashboard'),
    )
    expect(registerUser).toHaveBeenCalledWith({
      email: 'member@example.com',
      password: 'password123',
    })
    expect(getCurrentUser).toHaveBeenCalledWith('registered-token')
    expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBe(
      'registered-token',
    )
    expect(document.getElementById('aureole-recaptcha-v2-script')).toBeNull()
  })

  it('sends an optional invite code without making it required', async () => {
    const registerUser = vi
      .spyOn(publicAccountApi, 'register')
      .mockResolvedValue({
        accessToken: 'registered-token',
        tokenType: 'Bearer',
      })
    const router = renderRegistration(disabledConfig)
    const user = userEvent.setup()

    await fillBaseRegistration(user)
    expect(screen.getByLabelText('邀请码（可选）')).toBeInTheDocument()
    await user.type(screen.getByLabelText('邀请码（可选）'), 'INVITE-123')
    await user.click(screen.getByRole('button', { name: '注册账号' }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dashboard'),
    )
    expect(registerUser).toHaveBeenCalledWith({
      email: 'member@example.com',
      password: 'password123',
      inviteCode: 'INVITE-123',
    })
  })

  it('requires configured invite and local terms confirmation without sending terms state', async () => {
    const registerUser = vi
      .spyOn(publicAccountApi, 'register')
      .mockResolvedValue({
        accessToken: 'registered-token',
        tokenType: 'Bearer',
      })
    const config: OnboardingConfig = {
      ...disabledConfig,
      termsUrl: 'https://legal.example/terms',
      inviteCodeRequired: true,
      emailSuffixWhitelist: ['@example.com', 'mail.example'],
    }
    const router = renderRegistration(config)
    const user = userEvent.setup()

    await fillBaseRegistration(user)
    expect(
      screen.getByText('允许的邮箱后缀：@example.com、mail.example'),
    ).toBeInTheDocument()
    const termsLink = screen.getByRole('link', { name: '服务条款' })
    expect(termsLink).toHaveAttribute('href', 'https://legal.example/terms')
    expect(termsLink).toHaveAttribute('target', '_blank')

    await user.click(screen.getByRole('button', { name: '注册账号' }))
    expect(await screen.findByText('请输入邀请码')).toBeInTheDocument()
    expect(screen.getByText('请阅读并同意服务条款')).toBeInTheDocument()
    expect(registerUser).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('邀请码'), 'REQUIRED-INVITE')
    await user.click(screen.getByRole('checkbox', { name: /我已阅读并同意/ }))
    await user.click(screen.getByRole('button', { name: '注册账号' }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dashboard'),
    )
    const payload = registerUser.mock.calls[0]?.[0]
    expect(payload).toEqual({
      email: 'member@example.com',
      password: 'password123',
      inviteCode: 'REQUIRED-INVITE',
    })
    expect(payload).not.toHaveProperty('confirmPassword')
    expect(payload).not.toHaveProperty('termsAccepted')
  })

  it('fails closed and retries when onboarding requirements are unavailable', async () => {
    const getOnboarding = vi
      .spyOn(publicAccountApi, 'getOnboardingConfig')
      .mockRejectedValueOnce(
        new ApiError({
          status: 400,
          code: 'MALFORMED_RESPONSE',
          message: 'Invalid response',
        }),
      )
      .mockResolvedValueOnce(disabledConfig)
    const router = createAppRouter({ initialEntries: ['/register'] })
    render(
      <AppProviders
        router={router}
        authApi={createAuthApi()}
        queryClient={createQueryClient()}
      />,
    )
    const user = userEvent.setup()

    expect(
      await screen.findByRole('heading', { name: '暂时无法读取注册要求' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '注册账号' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '重试' }))

    expect(
      await screen.findByRole('heading', { name: '注册 Aureole' }),
    ).toBeInTheDocument()
    expect(getOnboarding).toHaveBeenCalledTimes(2)
  })

  it('fails closed for an unsupported AntiBot capability', async () => {
    const registerUser = vi.spyOn(publicAccountApi, 'register')
    renderRegistration({
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
    expect(screen.getByRole('button', { name: '注册账号' })).toBeDisabled()
    expect(registerUser).not.toHaveBeenCalled()
    expect(document.getElementById('aureole-recaptcha-v2-script')).toBeNull()
  })

  it('consumes CAPTCHA A for email code and requires CAPTCHA B for Register', async () => {
    const { api, getOptions } = installRecaptchaMock()
    const sendEmailCode = vi
      .spyOn(publicAccountApi, 'sendEmailCode')
      .mockResolvedValue({ sent: true as const })
    const registerUser = vi
      .spyOn(publicAccountApi, 'register')
      .mockResolvedValue({
        accessToken: 'registered-token',
        tokenType: 'Bearer',
      })
    const router = renderRegistration({
      ...disabledConfig,
      emailVerificationRequired: true,
      antiBot: {
        state: 'supported',
        provider: 'recaptcha',
        mode: 'v2-checkbox',
        siteKey: 'public-site-key',
      },
    })
    const user = userEvent.setup()

    await fillBaseRegistration(user)
    await waitFor(() => expect(api.render).toHaveBeenCalledOnce())
    act(() => getOptions().callback('challenge-token-a'))
    await user.click(screen.getByRole('button', { name: '发送验证码' }))

    expect(sendEmailCode).toHaveBeenCalledWith({
      email: 'member@example.com',
      purpose: 'register',
      challengeToken: 'challenge-token-a',
    })
    expect(api.reset).toHaveBeenCalledWith(11)
    expect(
      await screen.findByText(/提交注册前请再次完成人机验证/),
    ).toBeInTheDocument()

    await user.type(screen.getByLabelText('邮箱验证码'), '123456')
    await user.click(screen.getByRole('button', { name: '注册账号' }))
    expect(await screen.findByText('请先完成人机验证')).toBeInTheDocument()
    expect(registerUser).not.toHaveBeenCalled()

    act(() => getOptions().callback('challenge-token-b'))
    await user.click(screen.getByRole('button', { name: '注册账号' }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dashboard'),
    )
    expect(registerUser).toHaveBeenCalledWith({
      email: 'member@example.com',
      password: 'password123',
      emailCode: '123456',
      challengeToken: 'challenge-token-b',
    })
    expect(registerUser.mock.calls[0]?.[0].challengeToken).not.toBe(
      'challenge-token-a',
    )
  })

  it('consumes a challenge after a failed email-code mutation', async () => {
    const { api, getOptions } = installRecaptchaMock()
    const sendEmailCode = vi
      .spyOn(publicAccountApi, 'sendEmailCode')
      .mockRejectedValue(
        new ApiError({ status: 429, code: 'RATE_LIMITED', message: 'Limited' }),
      )
    renderRegistration({
      ...disabledConfig,
      emailVerificationRequired: true,
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
    act(() => getOptions().callback('consumed-on-failure'))
    await user.click(screen.getByRole('button', { name: '发送验证码' }))

    expect(
      await screen.findByText('操作过于频繁，请稍后重试。'),
    ).toBeInTheDocument()
    expect(api.reset).toHaveBeenCalledWith(11)
    await user.click(screen.getByRole('button', { name: '发送验证码' }))
    expect(await screen.findByText('请先完成人机验证')).toBeInTheDocument()
    expect(sendEmailCode).toHaveBeenCalledOnce()
  })

  it('consumes a challenge after a failed Register mutation', async () => {
    const { api, getOptions } = installRecaptchaMock()
    const registerUser = vi
      .spyOn(publicAccountApi, 'register')
      .mockRejectedValue(
        new ApiError({
          status: 422,
          code: 'VERIFICATION_FAILED',
          message: 'Verification failed',
        }),
      )
    renderRegistration({
      ...disabledConfig,
      antiBot: {
        state: 'supported',
        provider: 'recaptcha',
        mode: 'v2-checkbox',
        siteKey: 'public-site-key',
      },
    })
    const user = userEvent.setup()

    await fillBaseRegistration(user)
    await waitFor(() => expect(api.render).toHaveBeenCalledOnce())
    act(() => getOptions().callback('register-failure-token'))
    await user.click(screen.getByRole('button', { name: '注册账号' }))

    expect(
      await screen.findByText('邮箱验证码或人机验证未通过，请重新验证。'),
    ).toBeInTheDocument()
    expect(api.reset).toHaveBeenCalledWith(11)
    await user.click(screen.getByRole('button', { name: '注册账号' }))
    expect(await screen.findByText('请先完成人机验证')).toBeInTheDocument()
    expect(registerUser).toHaveBeenCalledOnce()
  })

  it('does not establish a session or retry after Register failure', async () => {
    const registerUser = vi
      .spyOn(publicAccountApi, 'register')
      .mockRejectedValue(
        new ApiError({
          status: 409,
          code: 'REGISTRATION_UNAVAILABLE',
          message: 'Registration unavailable',
          requestId: 'req-register',
        }),
      )
    const getCurrentUser = vi.fn()
    renderRegistration(disabledConfig, createAuthApi({ getCurrentUser }))
    const user = userEvent.setup()

    await fillBaseRegistration(user)
    await user.click(screen.getByRole('button', { name: '注册账号' }))

    expect(
      await screen.findByText(
        '当前无法完成注册；邮箱、邀请码、注册状态或站点规则可能不满足要求。',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('请求编号：req-register')).toBeInTheDocument()
    expect(registerUser).toHaveBeenCalledOnce()
    expect(getCurrentUser).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
  })

  it('prevents duplicate Register submission while pending', async () => {
    let resolveRegister!: (value: {
      accessToken: string
      tokenType: 'Bearer'
    }) => void
    const registerUser = vi
      .spyOn(publicAccountApi, 'register')
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveRegister = resolve
          }),
      )
    renderRegistration(disabledConfig)
    const user = userEvent.setup()

    await fillBaseRegistration(user)
    await user.click(screen.getByRole('button', { name: '注册账号' }))

    const pending = screen.getByRole('button', { name: '正在注册…' })
    expect(pending).toBeDisabled()
    await user.click(pending)
    expect(registerUser).toHaveBeenCalledOnce()

    resolveRegister({ accessToken: 'registered-token', tokenType: 'Bearer' })
    await screen.findAllByRole('heading', { name: 'Overview' })
  })

  it('starts only one Register request for same-tick submissions', async () => {
    const deferred = createDeferred<{
      accessToken: string
      tokenType: 'Bearer'
    }>()
    const registerUser = vi
      .spyOn(publicAccountApi, 'register')
      .mockImplementation(() => deferred.promise)
    renderRegistration(disabledConfig)
    const user = userEvent.setup()

    await fillBaseRegistration(user)
    const form = screen
      .getByRole('button', { name: '注册账号' })
      .closest('form')!
    act(() => {
      fireEvent.submit(form)
      fireEvent.submit(form)
    })

    await waitFor(() => expect(registerUser).toHaveBeenCalledTimes(1))
    deferred.resolve({ accessToken: 'registered-token', tokenType: 'Bearer' })
  })

  it('starts only one email-code request for same-tick actions', async () => {
    const deferred = createDeferred<{ sent: true }>()
    const sendEmailCode = vi
      .spyOn(publicAccountApi, 'sendEmailCode')
      .mockImplementation(() => deferred.promise)
    renderRegistration({
      ...disabledConfig,
      emailVerificationRequired: true,
    })
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

  it('allows only one same-tick cross-action to consume a challenge', async () => {
    const { api, getOptions } = installRecaptchaMock()
    const emailDeferred = createDeferred<{ sent: true }>()
    const registerDeferred = createDeferred<{
      accessToken: string
      tokenType: 'Bearer'
    }>()
    const sendEmailCode = vi
      .spyOn(publicAccountApi, 'sendEmailCode')
      .mockImplementation(() => emailDeferred.promise)
    const registerUser = vi
      .spyOn(publicAccountApi, 'register')
      .mockImplementation(() => registerDeferred.promise)
    renderRegistration({
      ...disabledConfig,
      emailVerificationRequired: true,
      antiBot: {
        state: 'supported',
        provider: 'recaptcha',
        mode: 'v2-checkbox',
        siteKey: 'public-site-key',
      },
    })
    const user = userEvent.setup()

    await fillBaseRegistration(user)
    await user.type(screen.getByLabelText('邮箱验证码'), '123456')
    await waitFor(() => expect(api.render).toHaveBeenCalledOnce())
    act(() => getOptions().callback('same-tick-challenge'))

    const sendButton = screen.getByRole('button', { name: '发送验证码' })
    const form = screen
      .getByRole('button', { name: '注册账号' })
      .closest('form')!
    act(() => {
      fireEvent.click(sendButton)
      fireEvent.submit(form)
    })

    await waitFor(() =>
      expect(
        sendEmailCode.mock.calls.length + registerUser.mock.calls.length,
      ).toBe(1),
    )
    const tokens = [
      sendEmailCode.mock.calls[0]?.[0].challengeToken,
      registerUser.mock.calls[0]?.[0].challengeToken,
    ].filter(Boolean)
    expect(tokens).toEqual(['same-tick-challenge'])

    emailDeferred.resolve({ sent: true })
    registerDeferred.resolve({
      accessToken: 'registered-token',
      tokenType: 'Bearer',
    })
  })
})
