import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/providers/app-providers'
import { createQueryClient } from '@/app/providers/query-client'
import { createAppRouter } from '@/app/router/router'
import {
  accountApi,
  type AccountPreferences,
} from '@/features/account/account-api'
import { accountQueryKeys } from '@/features/account/account-queries'
import type { AuthApi, CurrentUser } from '@/features/auth/auth-api'
import { publicAccountApi } from '@/features/auth/public-account-api'
import { ApiError } from '@/lib/api/errors'
import { AUTH_SESSION_STORAGE_KEY } from '@/lib/auth/credential-storage'
import { useAuthSessionStore } from '@/lib/auth/session-store'

const currentUser: CurrentUser = {
  email: 'member@example.com',
  expiresAt: '2030-01-01T00:00:00.000Z',
  status: 'active',
}

const preferences: AccountPreferences = {
  autoRenewal: false,
  remindExpire: true,
  remindTraffic: true,
}

function installAccountApiMocks() {
  const getPreferences = vi
    .spyOn(accountApi, 'getPreferences')
    .mockResolvedValue(preferences)
  const updatePreferences = vi
    .spyOn(accountApi, 'updatePreferences')
    .mockResolvedValue({ updated: true })
  const getStats = vi.spyOn(accountApi, 'getStats').mockResolvedValue({
    pendingOrders: 0,
    openTickets: 2,
    invitedUsers: 5,
  })
  const getConfig = vi.spyOn(accountApi, 'getConfig').mockResolvedValue({
    currency: 'CNY',
    currencySymbol: '¥',
  })
  const changePassword = vi
    .spyOn(accountApi, 'changePassword')
    .mockResolvedValue({ changed: true })
  return {
    changePassword,
    getConfig,
    getPreferences,
    getStats,
    updatePreferences,
  }
}

function renderAccount(
  user: CurrentUser = currentUser,
  queryClient: QueryClient = createQueryClient(),
) {
  let serverSessionValid = true
  const authApi: AuthApi = {
    login: vi.fn(),
    getCurrentUser: vi.fn(async () => {
      if (!serverSessionValid) {
        throw new ApiError({
          status: 401,
          code: 'AUTH_FAILED',
          message: 'Authentication failed',
        })
      }
      return user
    }),
    logout: vi.fn(async () => {
      serverSessionValid = false
    }),
  }
  const router = createAppRouter({ initialEntries: ['/settings'] })
  render(
    <AppProviders
      router={router}
      authApi={authApi}
      queryClient={queryClient}
    />,
  )
  return {
    authApi,
    queryClient,
    router,
    invalidateSession: () => {
      serverSessionValid = false
    },
  }
}

async function fillPasswordForm(
  user: ReturnType<typeof userEvent.setup>,
  newPassword = 'new-password123',
) {
  await user.type(await screen.findByLabelText('当前密码'), 'current-password')
  await user.type(screen.getByLabelText('新密码'), newPassword)
  await user.type(screen.getByLabelText('确认新密码'), newPassword)
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('Account self-service', () => {
  it('renders identity, status, expiry, stats, preferences, and account config', async () => {
    installAccountApiMocks()
    renderAccount()

    expect(
      await screen.findByRole('heading', { name: '账户' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('member@example.com').length).toBeGreaterThan(0)
    expect(screen.getAllByText('正常').length).toBeGreaterThan(0)
    expect(screen.getByText(/2030年/)).toBeInTheDocument()
    expect(await screen.findByText('CNY (¥)')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '待处理订单 0，查看详情' }),
    ).toHaveAttribute('href', '/orders')
    expect(
      screen.getByRole('link', { name: '开放工单 2，查看详情' }),
    ).toHaveAttribute('href', '/support')
    expect(
      screen.getByRole('link', { name: '已邀请用户 5，查看详情' }),
    ).toHaveAttribute('href', '/referrals')
    expect(screen.getByRole('checkbox', { name: '自动续费' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: '到期提醒' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: '流量提醒' })).toBeChecked()
  })

  it.each([
    ['active', '正常'],
    ['expired', '已过期'],
    ['disabled', '已停用'],
  ] as const)('maps %s to the exact account label', async (status, label) => {
    installAccountApiMocks()
    renderAccount({ ...currentUser, status, expiresAt: null })

    expect(await screen.findByText('无固定到期时间')).toBeInTheDocument()
    expect(screen.getAllByText(label).length).toBeGreaterThan(0)
  })

  it('retries only the failed stats section', async () => {
    const mocks = installAccountApiMocks()
    mocks.getStats
      .mockRejectedValueOnce(
        new ApiError({
          status: 200,
          code: 'MALFORMED_RESPONSE',
          message: 'Invalid response',
        }),
      )
      .mockResolvedValueOnce({
        pendingOrders: 1,
        openTickets: 0,
        invitedUsers: 0,
      })
    renderAccount()
    const user = userEvent.setup()

    expect(
      await screen.findByText('暂时无法读取账户概览。'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试' }))

    expect(
      await screen.findByRole('link', { name: '待处理订单 1，查看详情' }),
    ).toBeInTheDocument()
    expect(mocks.getStats).toHaveBeenCalledTimes(2)
    expect(mocks.getPreferences).toHaveBeenCalledOnce()
  })

  it('does not send a preference PATCH before anything changes', async () => {
    const mocks = installAccountApiMocks()
    renderAccount()

    const save = await screen.findByRole('button', { name: '保存偏好' })
    expect(save).toBeDisabled()
    expect(mocks.updatePreferences).not.toHaveBeenCalled()
  })

  it('sends only changed preferences and refetches authoritative values', async () => {
    const mocks = installAccountApiMocks()
    mocks.getPreferences
      .mockResolvedValueOnce(preferences)
      .mockResolvedValueOnce({ ...preferences, remindTraffic: false })
    renderAccount()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('checkbox', { name: '流量提醒' }))
    await user.click(screen.getByRole('button', { name: '保存偏好' }))

    expect(await screen.findByText('偏好设置已保存。')).toBeInTheDocument()
    expect(mocks.updatePreferences).toHaveBeenCalledOnce()
    expect(mocks.updatePreferences).toHaveBeenCalledWith(expect.any(String), {
      remindTraffic: false,
    })
    expect(mocks.getPreferences).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('checkbox', { name: '流量提醒' })).not.toBeChecked()
  })

  it('preserves user edits while synchronizing untouched authoritative preferences', async () => {
    installAccountApiMocks()
    const { queryClient } = renderAccount()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('checkbox', { name: '自动续费' }))
    act(() => {
      queryClient.setQueryData(accountQueryKeys.preferences, {
        ...preferences,
        remindTraffic: false,
      })
    })

    expect(screen.getByRole('checkbox', { name: '自动续费' })).toBeChecked()
    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', { name: '流量提醒' }),
      ).not.toBeChecked(),
    )
    expect(screen.getByRole('button', { name: '保存偏好' })).toBeEnabled()
  })

  it('keeps the session and shows PREFERENCES_UPDATE_FAILED safely', async () => {
    const mocks = installAccountApiMocks()
    mocks.updatePreferences.mockRejectedValue(
      new ApiError({
        status: 502,
        code: 'PREFERENCES_UPDATE_FAILED',
        message: 'Raw upstream detail',
        requestId: 'req-preferences',
      }),
    )
    renderAccount()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('checkbox', { name: '自动续费' }))
    await user.click(screen.getByRole('button', { name: '保存偏好' }))

    expect(
      await screen.findByText('无法保存偏好设置，请稍后重试。'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Raw upstream detail')).toBeNull()
    expect(screen.getByText('请求编号：req-preferences')).toBeInTheDocument()
    expect(mocks.updatePreferences).toHaveBeenCalledOnce()
    expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
    expect(useAuthSessionStore.getState().accessToken).not.toBeNull()
  })

  it.each([
    [0, 'NETWORK_ERROR'],
    [200, 'MALFORMED_RESPONSE'],
    [504, 'UPSTREAM_TIMEOUT'],
    [502, 'UPSTREAM_ERROR'],
  ])(
    'reconciles an ambiguous preference %s/%s without retrying PATCH',
    async (status, code) => {
      const mocks = installAccountApiMocks()
      mocks.getPreferences
        .mockResolvedValueOnce(preferences)
        .mockResolvedValueOnce({ ...preferences, autoRenewal: true })
      mocks.updatePreferences.mockRejectedValue(
        new ApiError({ status, code, message: 'Unknown outcome' }),
      )
      renderAccount()
      const user = userEvent.setup()

      await user.click(
        await screen.findByRole('checkbox', { name: '自动续费' }),
      )
      await user.click(screen.getByRole('button', { name: '保存偏好' }))

      expect(
        await screen.findByText(
          '保存结果无法确认，已重新读取服务器当前设置，请核对后再继续。',
        ),
      ).toBeInTheDocument()
      expect(mocks.updatePreferences).toHaveBeenCalledOnce()
      expect(mocks.getPreferences).toHaveBeenCalledTimes(2)
      expect(screen.getByRole('checkbox', { name: '自动续费' })).toBeChecked()
    },
  )

  it('shows an uncertain state when preference reconciliation also fails', async () => {
    const mocks = installAccountApiMocks()
    const networkError = new ApiError({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Unknown outcome',
    })
    mocks.getPreferences
      .mockResolvedValueOnce(preferences)
      .mockRejectedValue(networkError)
    mocks.updatePreferences.mockRejectedValue(networkError)
    renderAccount()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('checkbox', { name: '自动续费' }))
    await user.click(screen.getByRole('button', { name: '保存偏好' }))

    expect(
      await screen.findByText(
        '保存结果和服务器当前设置均无法确认，请稍后刷新页面核对，暂时不要重复保存。',
        {},
        { timeout: 3_000 },
      ),
    ).toBeInTheDocument()
    expect(mocks.updatePreferences).toHaveBeenCalledOnce()
  })

  it('exits when preference reconciliation proves the session invalid', async () => {
    const mocks = installAccountApiMocks()
    mocks.getPreferences.mockResolvedValueOnce(preferences).mockRejectedValue(
      new ApiError({
        status: 401,
        code: 'AUTH_FAILED',
        message: 'Authentication failed',
      }),
    )
    mocks.updatePreferences.mockRejectedValue(
      new ApiError({
        status: 0,
        code: 'NETWORK_ERROR',
        message: 'Unknown outcome',
      }),
    )
    const { router, invalidateSession } = renderAccount()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('checkbox', { name: '自动续费' }))
    invalidateSession()
    await user.click(screen.getByRole('button', { name: '保存偏好' }))

    expect(
      await screen.findByRole('heading', { name: '登录 Aureole' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(screen.queryByText(/保存结果/)).toBeNull()
    expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
  })

  it.each(['AUTH_REQUIRED', 'AUTH_FAILED'])(
    'exits the account page when preferences returns %s',
    async (code) => {
      const mocks = installAccountApiMocks()
      mocks.getPreferences.mockRejectedValue(
        new ApiError({ status: 401, code, message: 'Authentication failed' }),
      )
      const queryClient = createQueryClient()
      queryClient.setQueryData(['private-account-data'], { secret: 'cached' })
      const { router, invalidateSession } = renderAccount(
        currentUser,
        queryClient,
      )
      invalidateSession()

      expect(
        await screen.findByRole('heading', { name: '登录 Aureole' }),
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
      expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
      expect(queryClient.getQueryData(['private-account-data'])).toBeUndefined()
    },
  )

  it.each(['stats', 'config'] as const)(
    'exits the account page when %s proves the session invalid',
    async (source) => {
      const mocks = installAccountApiMocks()
      mocks[source === 'stats' ? 'getStats' : 'getConfig'].mockRejectedValue(
        new ApiError({
          status: 401,
          code: 'AUTH_FAILED',
          message: 'Authentication failed',
        }),
      )
      const { router, invalidateSession } = renderAccount()
      invalidateSession()

      expect(
        await screen.findByRole('heading', { name: '登录 Aureole' }),
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
      expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
    },
  )

  it('exits the account page when a preference PATCH proves the session invalid', async () => {
    const mocks = installAccountApiMocks()
    mocks.updatePreferences.mockRejectedValue(
      new ApiError({
        status: 401,
        code: 'AUTH_FAILED',
        message: 'Authentication failed',
      }),
    )
    const { router, invalidateSession } = renderAccount()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('checkbox', { name: '自动续费' }))
    invalidateSession()
    await user.click(screen.getByRole('button', { name: '保存偏好' }))

    expect(
      await screen.findByRole('heading', { name: '登录 Aureole' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(mocks.updatePreferences).toHaveBeenCalledOnce()
    expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
  })

  it('validates password fields locally without calling the API', async () => {
    const mocks = installAccountApiMocks()
    renderAccount()
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('新密码'), 'short')
    await user.type(screen.getByLabelText('确认新密码'), 'different')
    await user.click(screen.getByRole('button', { name: '修改密码' }))

    expect(await screen.findByText('请输入当前密码')).toBeInTheDocument()
    expect(screen.getByText('新密码至少需要 8 个字符')).toBeInTheDocument()
    expect(screen.getByText('两次输入的新密码不一致')).toBeInTheDocument()
    expect(mocks.changePassword).not.toHaveBeenCalled()
  })

  it('accepts a password over 64 characters and keeps the session on business failure', async () => {
    const mocks = installAccountApiMocks()
    mocks.changePassword.mockRejectedValue(
      new ApiError({
        status: 422,
        code: 'PASSWORD_CHANGE_FAILED',
        message: 'Raw upstream detail',
      }),
    )
    renderAccount()
    const user = userEvent.setup()
    const newPassword = 'n'.repeat(65)

    await fillPasswordForm(user, newPassword)
    await user.click(screen.getByRole('button', { name: '修改密码' }))

    expect(
      await screen.findByText('无法修改密码，请确认当前密码后重试。'),
    ).toBeInTheDocument()
    expect(mocks.changePassword).toHaveBeenCalledWith(expect.any(String), {
      currentPassword: 'current-password',
      newPassword,
    })
    expect(mocks.changePassword.mock.calls[0]?.[1]).not.toHaveProperty(
      'confirmNewPassword',
    )
    expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
    expect(useAuthSessionStore.getState().accessToken).not.toBeNull()
  })

  it('rejects a 1025-character new password locally', async () => {
    const mocks = installAccountApiMocks()
    renderAccount()
    const user = userEvent.setup()

    await user.type(
      await screen.findByLabelText('当前密码'),
      'current-password',
    )
    fireEvent.change(screen.getByLabelText('新密码'), {
      target: { value: 'n'.repeat(1025) },
    })
    fireEvent.change(screen.getByLabelText('确认新密码'), {
      target: { value: 'n'.repeat(1025) },
    })
    await user.click(screen.getByRole('button', { name: '修改密码' }))

    expect(
      await screen.findByText('新密码不能超过 1024 个字符'),
    ).toBeInTheDocument()
    expect(mocks.changePassword).not.toHaveBeenCalled()
  })

  it('blocks same-tick duplicate password submissions', async () => {
    const mocks = installAccountApiMocks()
    const deferred = createDeferred<{ changed: true }>()
    mocks.changePassword.mockImplementation(() => deferred.promise)
    renderAccount()
    const user = userEvent.setup()

    await fillPasswordForm(user)
    const form = screen
      .getByRole('button', { name: '修改密码' })
      .closest('form')!
    act(() => {
      fireEvent.submit(form)
      fireEvent.submit(form)
    })

    await waitFor(() => expect(mocks.changePassword).toHaveBeenCalledOnce())
    deferred.resolve({ changed: true })
    expect(
      await screen.findByText('密码已修改，请使用新密码重新登录。'),
    ).toBeInTheDocument()
  })

  it('clears credential and query cache after confirmed password success', async () => {
    const mocks = installAccountApiMocks()
    const register = vi.spyOn(publicAccountApi, 'register')
    const resetPassword = vi.spyOn(publicAccountApi, 'resetPassword')
    const queryClient = createQueryClient()
    queryClient.setQueryData(['private-account-data'], { secret: 'cached' })
    const { authApi, router } = renderAccount(currentUser, queryClient)
    const user = userEvent.setup()

    await fillPasswordForm(user)
    await user.click(screen.getByRole('button', { name: '修改密码' }))

    expect(
      await screen.findByText('密码已修改，请使用新密码重新登录。'),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.search).toEqual({
      account: 'password-changed',
    })
    expect(mocks.changePassword).toHaveBeenCalledOnce()
    expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
    expect(queryClient.getQueryData(['private-account-data'])).toBeUndefined()
    expect(authApi.login).not.toHaveBeenCalled()
    expect(register).not.toHaveBeenCalled()
    expect(resetPassword).not.toHaveBeenCalled()
    expect(screen.getByLabelText('密码')).toHaveValue('')
  })

  it.each([
    [0, 'NETWORK_ERROR'],
    [200, 'MALFORMED_RESPONSE'],
    [502, 'UPSTREAM_ERROR'],
    [504, 'UPSTREAM_TIMEOUT'],
  ])(
    'exits to re-auth after ambiguous password outcome %s/%s without retry',
    async (status, code) => {
      const mocks = installAccountApiMocks()
      mocks.changePassword.mockRejectedValue(
        new ApiError({ status, code, message: 'Unknown outcome' }),
      )
      const { router } = renderAccount()
      const user = userEvent.setup()

      await fillPasswordForm(user)
      await user.click(screen.getByRole('button', { name: '修改密码' }))

      expect(
        await screen.findByText(
          '密码修改结果无法确认。请尝试使用新密码登录；如果失败，再使用原密码。',
        ),
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
      expect(router.state.location.search).toEqual({
        account: 'password-change-uncertain',
      })
      expect(mocks.changePassword).toHaveBeenCalledOnce()
      expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
    },
  )

  it('exits protected Account UI after password AUTH_FAILED', async () => {
    const mocks = installAccountApiMocks()
    mocks.changePassword.mockRejectedValue(
      new ApiError({
        status: 401,
        code: 'AUTH_FAILED',
        message: 'Authentication failed',
      }),
    )
    const { router } = renderAccount()
    const user = userEvent.setup()

    await fillPasswordForm(user)
    await user.click(screen.getByRole('button', { name: '修改密码' }))

    expect(
      await screen.findByRole('heading', { name: '登录 Aureole' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
  })
})
