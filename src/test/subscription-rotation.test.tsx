import { QueryClient } from '@tanstack/react-query'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/providers/app-providers'
import { createQueryClient } from '@/app/providers/query-client'
import { createAppRouter } from '@/app/router/router'
import type { AuthApi, CurrentUser } from '@/features/auth/auth-api'
import {
  subscriptionApi,
  type SubscriptionAccessRotation,
  type SubscriptionOverview,
} from '@/features/subscription/subscription-api'
import { subscriptionQueryKeys } from '@/features/subscription/subscription-queries'
import { trafficApi } from '@/features/traffic/traffic-api'
import { ApiError } from '@/lib/api/errors'
import { AUTH_SESSION_STORAGE_KEY } from '@/lib/auth/credential-storage'

const oldCredentialUrl =
  'https://gateway.example/api/v1/access/subscription?token=fake-old-token'
const newCredentialUrl =
  'https://gateway.example/api/v1/access/subscription?token=fake-new-token'
const laterCredentialUrl =
  'https://gateway.example/api/v1/access/subscription?token=fake-later-token'

const currentUser: CurrentUser = {
  email: 'member@example.com',
  expiresAt: '2030-01-01T00:00:00.000Z',
  status: 'active',
}

const overview: SubscriptionOverview = {
  product: { id: '7', name: 'Pro Plan' },
  expiresAt: '2030-01-01T00:00:00.000Z',
  traffic: {
    uploadedBytes: 1,
    downloadedBytes: 2,
    allowanceBytes: 3,
  },
  deviceLimit: 3,
  activeDevices: 1,
  resetDay: 15,
  renewalAllowed: true,
}

function installMocks() {
  const getAccess = vi.spyOn(subscriptionApi, 'getAccess').mockResolvedValue({
    eligible: true,
    accessUrl: oldCredentialUrl,
  })
  const rotateAccess = vi
    .spyOn(subscriptionApi, 'rotateAccess')
    .mockResolvedValue({ rotated: true, accessUrl: newCredentialUrl })
  const advancePeriod = vi
    .spyOn(subscriptionApi, 'advancePeriod')
    .mockResolvedValue({ advanced: true })
  vi.spyOn(subscriptionApi, 'getOverview').mockResolvedValue(overview)
  vi.spyOn(trafficApi, 'getLogs').mockResolvedValue([])
  return { advancePeriod, getAccess, rotateAccess }
}

function renderSubscription(queryClient: QueryClient = createQueryClient()) {
  window.sessionStorage.setItem(
    AUTH_SESSION_STORAGE_KEY,
    'opaque-session-token',
  )
  const authApi: AuthApi = {
    login: vi.fn(),
    getCurrentUser: vi.fn().mockResolvedValue(currentUser),
  }
  const router = createAppRouter({ initialEntries: ['/subscription'] })
  render(
    <AppProviders
      router={router}
      authApi={authApi}
      queryClient={queryClient}
    />,
  )
  return { queryClient, router }
}

function installClipboard() {
  const writeText = vi.fn(() => Promise.resolve())
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  return writeText
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

async function openConfirmation(
  label = '重置订阅地址',
  user = userEvent.setup(),
) {
  const opener = await screen.findByRole('button', { name: label })
  await user.click(opener)
  const dialog = screen.getByRole('dialog')
  return { dialog, opener, user }
}

async function acknowledgeAndConfirm(
  dialog: HTMLElement,
  user: ReturnType<typeof userEvent.setup>,
) {
  const checkbox = within(dialog).getByRole('checkbox')
  const confirm = within(dialog).getByRole('button', { name: '确认重置' })
  await user.click(checkbox)
  await user.click(confirm)
}

describe('Subscription access rotation', () => {
  it('opens a consequence-first confirmation without posting and restores focus on close', async () => {
    const mocks = installMocks()
    renderSubscription()
    const { dialog, opener, user } = await openConfirmation()

    expect(mocks.rotateAccess).not.toHaveBeenCalled()
    expect(
      within(dialog).getByRole('heading', { name: '确认重置订阅地址' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        '重置后，当前订阅地址会失效。已导入客户端的旧节点凭据也可能失效，需要使用新的订阅地址重新获取订阅。',
      ),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByLabelText('我已理解旧订阅地址和旧节点凭据可能失效'),
    ).not.toBeChecked()
    expect(
      within(dialog).getByRole('button', { name: '确认重置' }),
    ).toBeDisabled()

    await user.click(within(dialog).getByRole('button', { name: '返回' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()

    await user.click(opener)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()
  })

  it('uses a synchronous lock so same-tick confirmation posts exactly once', async () => {
    const mocks = installMocks()
    const deferred = createDeferred<SubscriptionAccessRotation>()
    mocks.getAccess
      .mockResolvedValueOnce({
        eligible: true,
        accessUrl: oldCredentialUrl,
      })
      .mockResolvedValue({ eligible: true, accessUrl: newCredentialUrl })
    mocks.rotateAccess.mockImplementation(() => deferred.promise)
    renderSubscription()
    const { dialog, user } = await openConfirmation()
    await user.click(within(dialog).getByRole('checkbox'))
    const confirm = within(dialog).getByRole('button', { name: '确认重置' })
    await waitFor(() => expect(confirm).toBeEnabled())

    fireEvent.click(confirm)
    fireEvent.click(confirm)

    await waitFor(() => expect(mocks.rotateAccess).toHaveBeenCalledOnce())
    expect(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: '正在重置…',
      }),
    ).toBeDisabled()
    act(() => deferred.resolve({ rotated: true, accessUrl: newCredentialUrl }))
    expect(
      await screen.findByText('订阅地址已重置，请使用新地址重新获取订阅。'),
    ).toBeInTheDocument()
    expect(mocks.rotateAccess).toHaveBeenCalledOnce()
  })

  it('makes the reconciled URL canonical and resets reveal/copy state without fetching or copying it', async () => {
    const mocks = installMocks()
    mocks.getAccess
      .mockResolvedValueOnce({
        eligible: true,
        accessUrl: oldCredentialUrl,
      })
      .mockResolvedValueOnce({
        eligible: true,
        accessUrl: newCredentialUrl,
      })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { queryClient, router } = renderSubscription()
    const user = userEvent.setup()
    const writeText = installClipboard()

    await user.click(await screen.findByRole('button', { name: '显示' }))
    expect(screen.getByText(oldCredentialUrl)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '复制' }))
    expect(screen.getByRole('button', { name: '已复制' })).toBeInTheDocument()

    const { dialog } = await openConfirmation('重置订阅地址', user)
    await acknowledgeAndConfirm(dialog, user)

    expect(
      await screen.findByText('订阅地址已重置，请使用新地址重新获取订阅。'),
    ).toBeInTheDocument()
    expect(screen.queryByText(oldCredentialUrl)).toBeNull()
    expect(screen.queryByText(newCredentialUrl)).toBeNull()
    expect(screen.getByLabelText('订阅地址已隐藏')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '复制' })).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledOnce()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(queryClient.getQueryData(subscriptionQueryKeys.access)).toEqual({
      eligible: true,
      accessUrl: newCredentialUrl,
    })
    expect(router.state.location.search).toEqual({})
    expect(Object.values(window.localStorage)).not.toContain(newCredentialUrl)
    expect(Object.values(window.sessionStorage)).not.toContain(newCredentialUrl)

    await user.click(screen.getByRole('button', { name: '显示' }))
    expect(screen.getByText(newCredentialUrl)).toBeInTheDocument()
  })

  it('handles access unavailable as a definitive no-mutation result and removes rotation', async () => {
    const mocks = installMocks()
    mocks.rotateAccess.mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'SUBSCRIPTION_ACCESS_UNAVAILABLE',
        message: 'private upstream detail',
      }),
    )
    mocks.getAccess
      .mockResolvedValueOnce({
        eligible: true,
        accessUrl: oldCredentialUrl,
      })
      .mockResolvedValueOnce({ eligible: false, accessUrl: null })
    const { queryClient } = renderSubscription()
    const { dialog, user } = await openConfirmation()
    await acknowledgeAndConfirm(dialog, user)

    expect(
      await screen.findByText('当前账户暂时不能重置订阅地址。'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /重置订阅地址/ })).toBeNull()
    expect(screen.queryByText('private upstream detail')).toBeNull()
    expect(mocks.rotateAccess).toHaveBeenCalledOnce()
    expect(mocks.getAccess).toHaveBeenCalledTimes(2)
    expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBe(
      'opaque-session-token',
    )
    expect(queryClient.getQueryData(subscriptionQueryKeys.access)).toEqual({
      eligible: false,
      accessUrl: null,
    })
  })

  it('handles a definitive rotation failure, reconciles, and requires a new confirmation', async () => {
    const mocks = installMocks()
    mocks.rotateAccess.mockRejectedValue(
      new ApiError({
        status: 502,
        code: 'SUBSCRIPTION_ROTATION_FAILED',
        message: 'Reset failed',
      }),
    )
    mocks.getAccess.mockResolvedValue({
      eligible: true,
      accessUrl: oldCredentialUrl,
    })
    renderSubscription()
    const first = await openConfirmation()
    await acknowledgeAndConfirm(first.dialog, first.user)

    expect(await screen.findByText('订阅地址重置未完成。')).toBeInTheDocument()
    expect(screen.queryByText('Reset failed')).toBeNull()
    expect(mocks.rotateAccess).toHaveBeenCalledOnce()
    expect(mocks.getAccess).toHaveBeenCalledTimes(2)
    expect(
      screen.getByRole('button', { name: '重置订阅地址' }),
    ).toBeInTheDocument()
    expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBe(
      'opaque-session-token',
    )

    const second = await openConfirmation()
    expect(mocks.rotateAccess).toHaveBeenCalledOnce()
    expect(
      within(second.dialog).getByRole('button', { name: '确认重置' }),
    ).toBeDisabled()
  })

  it.each([
    [0, 'NETWORK_ERROR'],
    [504, 'UPSTREAM_TIMEOUT'],
    [502, 'UPSTREAM_ERROR'],
    [200, 'MALFORMED_RESPONSE'],
  ])(
    'treats %s/%s as unknown, reconciles, and blocks immediate resubmission',
    async (status, code) => {
      const mocks = installMocks()
      mocks.rotateAccess.mockRejectedValue(
        new ApiError({ status, code, message: 'unknown result' }),
      )
      mocks.getAccess
        .mockResolvedValueOnce({
          eligible: true,
          accessUrl: oldCredentialUrl,
        })
        .mockResolvedValueOnce({
          eligible: true,
          accessUrl: newCredentialUrl,
        })
      const { queryClient } = renderSubscription()
      const { dialog, user } = await openConfirmation()
      await acknowledgeAndConfirm(dialog, user)

      expect(
        await screen.findByText('重置请求结果暂时无法确认。'),
      ).toBeInTheDocument()
      expect(
        screen.getByText(
          '已重新读取当前订阅地址。请先确认并保存当前地址，避免重复重置。',
        ),
      ).toBeInTheDocument()
      expect(screen.queryByText('订阅地址重置未完成。')).toBeNull()
      expect(mocks.rotateAccess).toHaveBeenCalledOnce()
      expect(mocks.getAccess).toHaveBeenCalledTimes(2)
      expect(queryClient.getQueryData(subscriptionQueryKeys.access)).toEqual({
        eligible: true,
        accessUrl: newCredentialUrl,
      })

      const second = await openConfirmation('再次重置订阅地址')
      expect(
        within(second.dialog).getByLabelText(
          '我已确认并保存当前订阅地址，仍要再次重置',
        ),
      ).not.toBeChecked()
      expect(
        within(second.dialog).getByRole('button', { name: '确认重置' }),
      ).toBeDisabled()
      expect(mocks.rotateAccess).toHaveBeenCalledOnce()
    },
  )

  it('allows a second POST only after a fresh unknown-result acknowledgement and confirmation', async () => {
    const mocks = installMocks()
    mocks.rotateAccess
      .mockRejectedValueOnce(
        new ApiError({
          status: 0,
          code: 'NETWORK_ERROR',
          message: 'unknown',
        }),
      )
      .mockResolvedValueOnce({ rotated: true, accessUrl: laterCredentialUrl })
    mocks.getAccess
      .mockResolvedValueOnce({
        eligible: true,
        accessUrl: oldCredentialUrl,
      })
      .mockResolvedValueOnce({
        eligible: true,
        accessUrl: newCredentialUrl,
      })
      .mockResolvedValueOnce({
        eligible: true,
        accessUrl: laterCredentialUrl,
      })
    renderSubscription()
    const first = await openConfirmation()
    await acknowledgeAndConfirm(first.dialog, first.user)
    await screen.findByText('重置请求结果暂时无法确认。')

    const second = await openConfirmation('再次重置订阅地址')
    expect(mocks.rotateAccess).toHaveBeenCalledOnce()
    await acknowledgeAndConfirm(second.dialog, second.user)

    expect(mocks.rotateAccess).toHaveBeenCalledTimes(2)
    expect(
      await screen.findByText('订阅地址已重置，请使用新地址重新获取订阅。'),
    ).toBeInTheDocument()
  })

  it('fails closed when unknown-result recovery fails until an authoritative read succeeds', async () => {
    const mocks = installMocks()
    mocks.rotateAccess.mockRejectedValue(
      new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'unknown' }),
    )
    mocks.getAccess
      .mockResolvedValueOnce({
        eligible: true,
        accessUrl: oldCredentialUrl,
      })
      .mockRejectedValueOnce(
        new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'offline' }),
      )
      .mockResolvedValueOnce({
        eligible: true,
        accessUrl: newCredentialUrl,
      })
    renderSubscription()
    const first = await openConfirmation()
    await acknowledgeAndConfirm(first.dialog, first.user)

    expect(
      await screen.findByText(
        '当前订阅地址也暂时无法重新读取。请先重新读取成功，暂时不要再次重置。',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /重置订阅地址/ })).toBeNull()
    expect(
      screen.queryByRole('button', { name: '提前进入下一周期' }),
    ).toBeNull()
    expect(mocks.rotateAccess).toHaveBeenCalledOnce()
    expect(mocks.advancePeriod).not.toHaveBeenCalled()

    await first.user.click(
      screen.getByRole('button', { name: '重新读取订阅地址' }),
    )

    expect(
      await screen.findByRole('button', { name: '再次重置订阅地址' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '提前进入下一周期' }),
    ).toBeEnabled()
    expect(mocks.getAccess).toHaveBeenCalledTimes(3)
    expect(mocks.rotateAccess).toHaveBeenCalledOnce()
    expect(mocks.advancePeriod).not.toHaveBeenCalled()
  })

  it('blocks Advance when definitive rotation failure cannot reconcile Access', async () => {
    const mocks = installMocks()
    mocks.rotateAccess.mockRejectedValue(
      new ApiError({
        status: 502,
        code: 'SUBSCRIPTION_ROTATION_FAILED',
        message: 'failed',
      }),
    )
    mocks.getAccess
      .mockResolvedValueOnce({
        eligible: true,
        accessUrl: oldCredentialUrl,
      })
      .mockRejectedValueOnce(
        new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'offline' }),
      )
    renderSubscription()
    const first = await openConfirmation()
    await acknowledgeAndConfirm(first.dialog, first.user)

    expect(await screen.findByText('订阅地址重置未完成。')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '提前进入下一周期' }),
    ).toBeNull()
    expect(mocks.rotateAccess).toHaveBeenCalledOnce()
    expect(mocks.advancePeriod).not.toHaveBeenCalled()
  })

  it('blocks Advance when confirmed rotation success cannot reconcile Access', async () => {
    const mocks = installMocks()
    mocks.getAccess
      .mockResolvedValueOnce({
        eligible: true,
        accessUrl: oldCredentialUrl,
      })
      .mockRejectedValueOnce(
        new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'offline' }),
      )
      .mockResolvedValueOnce({
        eligible: true,
        accessUrl: newCredentialUrl,
      })
    renderSubscription()
    const first = await openConfirmation()
    await acknowledgeAndConfirm(first.dialog, first.user)

    expect(
      await screen.findByText(
        '当前地址暂时无法重新核对，请先保存页面显示的地址，再重新读取。',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '提前进入下一周期' }),
    ).toBeNull()
    expect(mocks.rotateAccess).toHaveBeenCalledOnce()
    expect(mocks.advancePeriod).not.toHaveBeenCalled()

    await first.user.click(
      screen.getByRole('button', { name: '重新读取订阅地址' }),
    )

    expect(
      await screen.findByRole('button', { name: '提前进入下一周期' }),
    ).toBeEnabled()
    expect(mocks.getAccess).toHaveBeenCalledTimes(3)
    expect(mocks.rotateAccess).toHaveBeenCalledOnce()
    expect(mocks.advancePeriod).not.toHaveBeenCalled()
  })

  it.each([
    [
      'Rotate POST',
      new ApiError({
        status: 401,
        code: 'AUTH_REQUIRED',
        message: 'Authentication required',
      }),
      null,
    ],
    [
      'success reconciliation',
      null,
      new ApiError({
        status: 401,
        code: 'AUTH_FAILED',
        message: 'Authentication failed',
      }),
    ],
    [
      'unknown recovery',
      new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'unknown' }),
      new ApiError({
        status: 401,
        code: 'AUTH_REQUIRED',
        message: 'Authentication required',
      }),
    ],
    [
      'definitive-error recovery',
      new ApiError({
        status: 502,
        code: 'SUBSCRIPTION_ROTATION_FAILED',
        message: 'failed',
      }),
      new ApiError({
        status: 401,
        code: 'AUTH_FAILED',
        message: 'Authentication failed',
      }),
    ],
  ] as const)(
    'clears the session and exits protected UI after %s rejects authentication',
    async (_name, mutationError, recoveryError) => {
      const mocks = installMocks()
      if (mutationError) mocks.rotateAccess.mockRejectedValue(mutationError)
      if (recoveryError) {
        mocks.getAccess
          .mockResolvedValueOnce({
            eligible: true,
            accessUrl: oldCredentialUrl,
          })
          .mockRejectedValueOnce(recoveryError)
      }
      const queryClient = createQueryClient()
      queryClient.setQueryData(['private-data'], { sensitive: true })
      const { router } = renderSubscription(queryClient)
      const { dialog, user } = await openConfirmation()
      await acknowledgeAndConfirm(dialog, user)

      expect(
        await screen.findByRole('heading', { name: '登录 Aureole' }),
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
      expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
      expect(
        queryClient.getQueryData(subscriptionQueryKeys.access),
      ).toBeUndefined()
      expect(queryClient.getQueryData(['private-data'])).toBeUndefined()
      expect(mocks.rotateAccess).toHaveBeenCalledOnce()
    },
  )
})
