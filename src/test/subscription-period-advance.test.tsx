import { QueryClient } from '@tanstack/react-query'
import {
  act,
  fireEvent,
  render,
  renderHook,
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
  type SubscriptionPeriodAdvance,
} from '@/features/subscription/subscription-api'
import { useSubscriptionMutationCoordinator } from '@/features/subscription/subscription-mutation-coordinator'
import { subscriptionQueryKeys } from '@/features/subscription/subscription-queries'
import { trafficApi } from '@/features/traffic/traffic-api'
import { ApiError } from '@/lib/api/errors'
import { AUTH_SESSION_STORAGE_KEY } from '@/lib/auth/credential-storage'

const credentialUrl =
  'https://gateway.example/api/v1/access/subscription?token=fake-token'

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
    allowanceBytes: 100,
  },
  deviceLimit: 3,
  activeDevices: 1,
  resetDay: 15,
  renewalAllowed: true,
}

const recoveredOverview: SubscriptionOverview = {
  ...overview,
  expiresAt: '2029-12-01T00:00:00.000Z',
  traffic: {
    ...overview.traffic,
    uploadedBytes: 0,
    downloadedBytes: 0,
  },
  resetDay: 1,
}

function installMocks(initialOverview: SubscriptionOverview = overview) {
  const getOverview = vi
    .spyOn(subscriptionApi, 'getOverview')
    .mockResolvedValue(initialOverview)
  const advancePeriod = vi
    .spyOn(subscriptionApi, 'advancePeriod')
    .mockResolvedValue({ advanced: true })
  const rotateAccess = vi
    .spyOn(subscriptionApi, 'rotateAccess')
    .mockResolvedValue({ rotated: true, accessUrl: credentialUrl })
  vi.spyOn(subscriptionApi, 'getAccess').mockResolvedValue({
    eligible: true,
    accessUrl: credentialUrl,
  })
  vi.spyOn(subscriptionApi, 'getEntries').mockResolvedValue({
    entries: [{ baseUrl: 'https://entry.example/subscriptions' }],
  })
  vi.spyOn(subscriptionApi, 'getEntryAccess').mockResolvedValue({
    accessUrl: credentialUrl,
  })
  const getTraffic = vi.spyOn(trafficApi, 'getLogs').mockResolvedValue([])
  return { advancePeriod, getOverview, getTraffic, rotateAccess }
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

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

async function openAdvanceConfirmation(
  label = '提前进入下一周期',
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
  await user.click(within(dialog).getByRole('checkbox'))
  await user.click(
    within(dialog).getByRole('button', { name: '确认进入下一周期' }),
  )
}

function expectLoggedOut(
  router: ReturnType<typeof createAppRouter>,
  queryClient: QueryClient,
) {
  expect(router.state.location.pathname).toBe('/login')
  expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
  expect(queryClient.getQueryData(['private-data'])).toBeUndefined()
  expect(
    queryClient.getQueryData(subscriptionQueryKeys.overview),
  ).toBeUndefined()
}

describe('Subscription period advance', () => {
  it('allows the backend to decide when renewalAllowed is false', async () => {
    const mocks = installMocks({ ...overview, renewalAllowed: false })
    renderSubscription()
    const user = userEvent.setup()

    expect(await screen.findByText('未启用')).toBeInTheDocument()
    expect(screen.queryByText('当前未开启提前进入下一周期。')).toBeNull()
    const advanceButton = screen.getByRole('button', {
      name: '提前进入下一周期',
    })
    expect(advanceButton).toBeEnabled()

    const { dialog } = await openAdvanceConfirmation('提前进入下一周期', user)
    await acknowledgeAndConfirm(dialog, user)

    expect(mocks.advancePeriod).toHaveBeenCalledOnce()
    expect(
      await screen.findByText('已进入下一周期，已重新读取最新订阅状态。'),
    ).toBeInTheDocument()
  })

  it('requires consequence acknowledgement and restores trigger focus', async () => {
    const mocks = installMocks()
    renderSubscription()
    const { dialog, opener, user } = await openAdvanceConfirmation()

    expect(opener).toBeEnabled()
    expect(mocks.advancePeriod).not.toHaveBeenCalled()
    expect(
      within(dialog).getByRole('heading', { name: '确认进入下一周期' }),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('此操作不是延长订阅。')).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        '执行后，本周期流量使用量会按服务端规则重置，到期时间可能提前。',
      ),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByLabelText(
        '我已理解此操作可能重置当前周期流量并使到期时间提前',
      ),
    ).not.toBeChecked()
    expect(
      within(dialog).getByRole('button', { name: '确认进入下一周期' }),
    ).toBeDisabled()

    await user.click(within(dialog).getByRole('button', { name: '返回' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()

    await user.click(opener)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()
  })

  it('uses a synchronous lock so same-tick confirmation posts once', async () => {
    const mocks = installMocks()
    const mutation = createDeferred<SubscriptionPeriodAdvance>()
    mocks.advancePeriod.mockReturnValue(mutation.promise)
    renderSubscription()
    const { dialog, user } = await openAdvanceConfirmation()
    await user.click(within(dialog).getByRole('checkbox'))
    const confirm = within(dialog).getByRole('button', {
      name: '确认进入下一周期',
    })

    fireEvent.click(confirm)
    fireEvent.click(confirm)

    await waitFor(() => expect(mocks.advancePeriod).toHaveBeenCalledOnce())
    expect(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: '正在进入…',
      }),
    ).toBeDisabled()
    act(() => mutation.resolve({ advanced: true }))
    expect(
      await screen.findByText('已进入下一周期，已重新读取最新订阅状态。'),
    ).toBeInTheDocument()
    expect(mocks.advancePeriod).toHaveBeenCalledOnce()
  })

  it('keeps the old overview until a successful authoritative reconciliation', async () => {
    const mocks = installMocks()
    const reconciliation = createDeferred<SubscriptionOverview>()
    mocks.getOverview
      .mockResolvedValueOnce(overview)
      .mockReturnValueOnce(reconciliation.promise)
    const { queryClient, router } = renderSubscription()
    const { dialog, user } = await openAdvanceConfirmation()
    await acknowledgeAndConfirm(dialog, user)

    expect(
      await screen.findByText('已进入下一周期，正在重新读取最新订阅状态。'),
    ).toBeInTheDocument()
    expect(queryClient.getQueryData(subscriptionQueryKeys.overview)).toEqual(
      overview,
    )

    act(() => reconciliation.resolve(recoveredOverview))
    expect(
      await screen.findByText('已进入下一周期，已重新读取最新订阅状态。'),
    ).toBeInTheDocument()
    expect(queryClient.getQueryData(subscriptionQueryKeys.overview)).toEqual(
      recoveredOverview,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocks.advancePeriod).toHaveBeenCalledOnce()
    expect(mocks.getTraffic).toHaveBeenCalledOnce()
    expect(router.state.location.search).toEqual({})
    expect(Object.keys(window.localStorage)).not.toContain('advance-period')
    expect(Object.keys(window.sessionStorage)).not.toContain('advance-period')
  })

  it('keeps confirmed success, fails closed, and reopens only after a manual read', async () => {
    const mocks = installMocks()
    mocks.getOverview
      .mockResolvedValueOnce(overview)
      .mockRejectedValueOnce(
        new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'offline' }),
      )
      .mockResolvedValueOnce(recoveredOverview)
    renderSubscription()
    const { dialog, user } = await openAdvanceConfirmation()
    await acknowledgeAndConfirm(dialog, user)

    expect(
      await screen.findByText(
        '操作已提交成功，但暂时无法读取最新订阅状态。请先重新读取订阅状态。',
      ),
    ).toBeInTheDocument()
    const advanceButton = screen.getByRole('button', {
      name: '提前进入下一周期',
    })
    expect(advanceButton).toBeDisabled()
    fireEvent.click(advanceButton)
    expect(mocks.advancePeriod).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '重置订阅地址' })).toBeDisabled()
    expect(mocks.advancePeriod).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: '重新读取订阅状态' }))

    expect(advanceButton).toBeEnabled()
    expect(screen.getByRole('button', { name: '重置订阅地址' })).toBeEnabled()
    expect(mocks.advancePeriod).toHaveBeenCalledOnce()
  })

  it.each([
    ['SUBSCRIPTION_PERIOD_ADVANCE_DISABLED', '当前未开启提前进入下一周期。'],
    [
      'SUBSCRIPTION_TRAFFIC_NOT_EXHAUSTED',
      '当前周期仍有可用流量，暂时不能提前进入下一周期。',
    ],
    [
      'SUBSCRIPTION_PERIOD_ADVANCE_UNAVAILABLE',
      '当前订阅状态暂时不能提前进入下一周期。',
    ],
    ['SUBSCRIPTION_PERIOD_ADVANCE_FAILED', '提前进入下一周期未完成。'],
  ])(
    'handles definitive %s with a safe message and overview recovery',
    async (code, message) => {
      const mocks = installMocks()
      mocks.advancePeriod.mockRejectedValue(
        new ApiError({
          status: code.endsWith('FAILED') ? 502 : 409,
          code,
          message: 'private upstream message',
        }),
      )
      mocks.getOverview
        .mockResolvedValueOnce(overview)
        .mockResolvedValueOnce(recoveredOverview)
      renderSubscription()
      expect(
        await screen.findByRole('button', { name: '提前进入下一周期' }),
      ).toBeEnabled()
      const { dialog, user } = await openAdvanceConfirmation()
      await acknowledgeAndConfirm(dialog, user)

      expect(await screen.findByText(message)).toBeInTheDocument()
      expect(screen.queryByText('private upstream message')).toBeNull()
      expect(screen.getByText('已重新读取当前订阅状态。')).toBeInTheDocument()
      expect(mocks.advancePeriod).toHaveBeenCalledOnce()
      expect(mocks.getOverview).toHaveBeenCalledTimes(2)
      expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBe(
        'opaque-session-token',
      )
    },
  )

  it.each([
    'SUBSCRIPTION_PERIOD_ADVANCE_DISABLED',
    'SUBSCRIPTION_TRAFFIC_NOT_EXHAUSTED',
    'SUBSCRIPTION_PERIOD_ADVANCE_UNAVAILABLE',
    'SUBSCRIPTION_PERIOD_ADVANCE_FAILED',
  ])(
    'fails closed when %s recovery cannot read authoritative state',
    async (code) => {
      const mocks = installMocks()
      mocks.advancePeriod.mockRejectedValue(
        new ApiError({
          status: 409,
          code,
          message: 'private upstream message',
        }),
      )
      mocks.getOverview.mockResolvedValueOnce(overview).mockRejectedValueOnce(
        new ApiError({
          status: 0,
          code: 'NETWORK_ERROR',
          message: 'offline',
        }),
      )
      renderSubscription()
      const { dialog, user } = await openAdvanceConfirmation()
      await acknowledgeAndConfirm(dialog, user)

      expect(
        await screen.findByRole('button', { name: '重新读取订阅状态' }),
      ).toBeInTheDocument()
      const advanceButton = screen.getByRole('button', {
        name: '提前进入下一周期',
      })
      expect(advanceButton).toBeDisabled()
      fireEvent.click(advanceButton)
      expect(mocks.advancePeriod).toHaveBeenCalledOnce()
      expect(
        screen.getByRole('button', { name: '重置订阅地址' }),
      ).toBeDisabled()
      expect(mocks.advancePeriod).toHaveBeenCalledOnce()
    },
  )

  it.each([
    [0, 'NETWORK_ERROR'],
    [504, 'UPSTREAM_TIMEOUT'],
    [502, 'UPSTREAM_ERROR'],
    [200, 'MALFORMED_RESPONSE'],
  ])(
    'treats %s/%s as unknown without inferring causality',
    async (status, code) => {
      const mocks = installMocks()
      mocks.advancePeriod.mockRejectedValue(
        new ApiError({ status, code, message: 'private unknown detail' }),
      )
      mocks.getOverview
        .mockResolvedValueOnce(overview)
        .mockResolvedValueOnce(recoveredOverview)
      const { queryClient } = renderSubscription()
      const { dialog, user } = await openAdvanceConfirmation()
      await acknowledgeAndConfirm(dialog, user)

      expect(
        await screen.findByText('操作结果暂时无法确认。'),
      ).toBeInTheDocument()
      expect(
        screen.getByText(
          '已重新读取当前订阅状态。请先核对当前状态，避免重复操作。',
        ),
      ).toBeInTheDocument()
      expect(screen.queryByText('已进入下一周期')).toBeNull()
      expect(screen.queryByText('private unknown detail')).toBeNull()
      expect(queryClient.getQueryData(subscriptionQueryKeys.overview)).toEqual(
        recoveredOverview,
      )
      expect(mocks.advancePeriod).toHaveBeenCalledOnce()

      const second = await openAdvanceConfirmation('再次进入下一周期', user)
      expect(
        within(second.dialog).getByLabelText(
          '我已核对当前订阅状态，仍要再次进入下一周期',
        ),
      ).not.toBeChecked()
      expect(
        within(second.dialog).getByRole('button', {
          name: '确认进入下一周期',
        }),
      ).toBeDisabled()
      expect(mocks.advancePeriod).toHaveBeenCalledOnce()
    },
  )

  it('allows a second unknown-result POST only after fresh acknowledgement', async () => {
    const mocks = installMocks()
    mocks.advancePeriod
      .mockRejectedValueOnce(
        new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'unknown' }),
      )
      .mockResolvedValueOnce({ advanced: true })
    mocks.getOverview
      .mockResolvedValueOnce(overview)
      .mockResolvedValueOnce(recoveredOverview)
      .mockResolvedValueOnce(recoveredOverview)
    renderSubscription()
    const first = await openAdvanceConfirmation()
    await acknowledgeAndConfirm(first.dialog, first.user)
    await screen.findByText('操作结果暂时无法确认。')

    const second = await openAdvanceConfirmation('再次进入下一周期', first.user)
    expect(mocks.advancePeriod).toHaveBeenCalledOnce()
    await acknowledgeAndConfirm(second.dialog, second.user)

    expect(mocks.advancePeriod).toHaveBeenCalledTimes(2)
    expect(
      await screen.findByText('已进入下一周期，已重新读取最新订阅状态。'),
    ).toBeInTheDocument()
  })

  it('fails closed after unknown recovery failure until a manual read succeeds', async () => {
    const mocks = installMocks()
    mocks.advancePeriod.mockRejectedValue(
      new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'unknown' }),
    )
    mocks.getOverview
      .mockResolvedValueOnce(overview)
      .mockRejectedValueOnce(
        new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'offline' }),
      )
      .mockResolvedValueOnce(recoveredOverview)
    renderSubscription()
    const first = await openAdvanceConfirmation()
    await acknowledgeAndConfirm(first.dialog, first.user)

    expect(
      await screen.findByText(
        '当前订阅状态也暂时无法重新读取。请先重新读取订阅状态，避免重复操作。',
      ),
    ).toBeInTheDocument()
    const advanceButton = screen.getByRole('button', {
      name: '提前进入下一周期',
    })
    expect(advanceButton).toBeDisabled()
    fireEvent.click(advanceButton)
    expect(mocks.advancePeriod).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '重置订阅地址' })).toBeDisabled()
    expect(mocks.advancePeriod).toHaveBeenCalledOnce()

    await first.user.click(
      screen.getByRole('button', { name: '重新读取订阅状态' }),
    )

    expect(
      await screen.findByRole('button', { name: '再次进入下一周期' }),
    ).toBeEnabled()
    expect(screen.getByRole('button', { name: '重置订阅地址' })).toBeEnabled()
    expect(mocks.getOverview).toHaveBeenCalledTimes(3)
    expect(mocks.advancePeriod).toHaveBeenCalledOnce()
  })

  it('prevents Advance while Rotate is pending', async () => {
    const mocks = installMocks()
    const rotation = createDeferred<SubscriptionAccessRotation>()
    mocks.rotateAccess.mockReturnValue(rotation.promise)
    renderSubscription()
    const user = userEvent.setup()
    const advanceButton = await screen.findByRole('button', {
      name: '提前进入下一周期',
    })
    await user.click(screen.getByRole('button', { name: '重置订阅地址' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('checkbox'))
    await user.click(within(dialog).getByRole('button', { name: '确认重置' }))

    await waitFor(() => expect(mocks.rotateAccess).toHaveBeenCalledOnce())
    expect(advanceButton).toBeDisabled()
    fireEvent.click(advanceButton)
    expect(mocks.advancePeriod).not.toHaveBeenCalled()

    act(() => rotation.resolve({ rotated: true, accessUrl: credentialUrl }))
    await screen.findByText('订阅地址已重置，请使用新地址重新获取订阅。')
  })

  it('prevents Rotate while Advance is pending', async () => {
    const mocks = installMocks()
    const advance = createDeferred<SubscriptionPeriodAdvance>()
    mocks.advancePeriod.mockReturnValue(advance.promise)
    renderSubscription()
    const rotateButton = await screen.findByRole('button', {
      name: '重置订阅地址',
    })
    const first = await openAdvanceConfirmation()
    await acknowledgeAndConfirm(first.dialog, first.user)

    await waitFor(() => expect(mocks.advancePeriod).toHaveBeenCalledOnce())
    expect(rotateButton).toBeDisabled()
    fireEvent.click(rotateButton)
    expect(mocks.rotateAccess).not.toHaveBeenCalled()

    act(() => advance.resolve({ advanced: true }))
    await screen.findByText('已进入下一周期，已重新读取最新订阅状态。')
  })

  it('allows only one different destructive action to acquire in the same tick', () => {
    const { result } = renderHook(() => useSubscriptionMutationCoordinator())

    expect(result.current.tryAcquire('rotate-access')).toBe(true)
    expect(result.current.tryAcquire('advance-period')).toBe(false)
  })

  it.each([
    [
      'Advance POST AUTH_REQUIRED',
      new ApiError({ status: 401, code: 'AUTH_REQUIRED', message: 'auth' }),
      null,
    ],
    [
      'Advance POST AUTH_FAILED',
      new ApiError({ status: 401, code: 'AUTH_FAILED', message: 'auth' }),
      null,
    ],
    [
      'success reconciliation',
      null,
      new ApiError({ status: 401, code: 'AUTH_FAILED', message: 'auth' }),
    ],
    [
      'unknown recovery',
      new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'unknown' }),
      new ApiError({ status: 401, code: 'AUTH_REQUIRED', message: 'auth' }),
    ],
    [
      'definitive recovery',
      new ApiError({
        status: 409,
        code: 'SUBSCRIPTION_PERIOD_ADVANCE_UNAVAILABLE',
        message: 'unavailable',
      }),
      new ApiError({ status: 401, code: 'AUTH_FAILED', message: 'auth' }),
    ],
  ] as const)(
    'clears session and protected cache after %s',
    async (_name, mutationError, recoveryError) => {
      const mocks = installMocks()
      if (mutationError) mocks.advancePeriod.mockRejectedValue(mutationError)
      if (recoveryError) {
        mocks.getOverview
          .mockResolvedValueOnce(overview)
          .mockRejectedValueOnce(recoveryError)
      }
      const queryClient = createQueryClient()
      queryClient.setQueryData(['private-data'], { sensitive: true })
      const { router } = renderSubscription(queryClient)
      const { dialog, user } = await openAdvanceConfirmation()
      await acknowledgeAndConfirm(dialog, user)

      expect(
        await screen.findByRole('heading', { name: '登录 Aureole' }),
      ).toBeInTheDocument()
      expectLoggedOut(router, queryClient)
      expect(mocks.advancePeriod).toHaveBeenCalledOnce()
    },
  )

  it('exits protected UI when manual overview recovery rejects authentication', async () => {
    const mocks = installMocks()
    mocks.advancePeriod.mockRejectedValue(
      new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'unknown' }),
    )
    mocks.getOverview
      .mockResolvedValueOnce(overview)
      .mockRejectedValueOnce(
        new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'offline' }),
      )
      .mockRejectedValueOnce(
        new ApiError({ status: 401, code: 'AUTH_REQUIRED', message: 'auth' }),
      )
    const queryClient = createQueryClient()
    queryClient.setQueryData(['private-data'], { sensitive: true })
    const { router } = renderSubscription(queryClient)
    const first = await openAdvanceConfirmation()
    await acknowledgeAndConfirm(first.dialog, first.user)
    await screen.findByRole('button', { name: '重新读取订阅状态' })

    await first.user.click(
      screen.getByRole('button', { name: '重新读取订阅状态' }),
    )

    expect(
      await screen.findByRole('heading', { name: '登录 Aureole' }),
    ).toBeInTheDocument()
    expectLoggedOut(router, queryClient)
    expect(mocks.advancePeriod).toHaveBeenCalledOnce()
  })
})
