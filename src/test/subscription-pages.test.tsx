import { QueryClient } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/providers/app-providers'
import { createQueryClient } from '@/app/providers/query-client'
import { createAppRouter } from '@/app/router/router'
import type { AuthApi, CurrentUser } from '@/features/auth/auth-api'
import {
  subscriptionApi,
  type SubscriptionOverview,
} from '@/features/subscription/subscription-api'
import { subscriptionQueryKeys } from '@/features/subscription/subscription-queries'
import { trafficApi } from '@/features/traffic/traffic-api'
import { ApiError } from '@/lib/api/errors'
import { AUTH_SESSION_STORAGE_KEY } from '@/lib/auth/credential-storage'

const credentialUrl =
  'https://gateway.example/api/v1/access/subscription?token=opaque-token'

const currentUser: CurrentUser = {
  email: 'member@example.com',
  expiresAt: '2030-01-01T00:00:00.000Z',
  status: 'active',
}

const overview: SubscriptionOverview = {
  product: { id: '7', name: 'Pro Plan' },
  expiresAt: '2030-01-01T00:00:00.000Z',
  traffic: {
    uploadedBytes: 1_073_741_824,
    downloadedBytes: 2_147_483_648,
    allowanceBytes: 107_374_182_400,
  },
  deviceLimit: 3,
  activeDevices: 1,
  resetDay: 15,
  renewalAllowed: true,
}

function installSubscriptionMocks() {
  const getAccess = vi.spyOn(subscriptionApi, 'getAccess').mockResolvedValue({
    eligible: true,
    accessUrl: credentialUrl,
  })
  const getOverview = vi
    .spyOn(subscriptionApi, 'getOverview')
    .mockResolvedValue(overview)
  const getTraffic = vi.spyOn(trafficApi, 'getLogs').mockResolvedValue([])
  return { getAccess, getOverview, getTraffic }
}

function renderProtectedRoute(
  path: '/dashboard' | '/subscription',
  queryClient: QueryClient = createQueryClient(),
) {
  window.sessionStorage.setItem(
    AUTH_SESSION_STORAGE_KEY,
    'opaque-session-token',
  )
  const authApi: AuthApi = {
    login: vi.fn(),
    getCurrentUser: vi.fn().mockResolvedValue(currentUser),
  }
  const router = createAppRouter({ initialEntries: [path] })
  render(
    <AppProviders
      router={router}
      authApi={authApi}
      queryClient={queryClient}
    />,
  )
  return { queryClient, router }
}

function installClipboard(writeText: (value: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(writeText) },
  })
  return navigator.clipboard.writeText as ReturnType<typeof vi.fn>
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('Subscription page', () => {
  it('uses stable credential-free canonical query keys', () => {
    expect(subscriptionQueryKeys).toEqual({
      access: ['subscription', 'access'],
      overview: ['subscription', 'overview'],
    })
  })

  it('renders authoritative overview fields without derived business state', async () => {
    installSubscriptionMocks()
    renderProtectedRoute('/subscription')

    expect(await screen.findByText('Pro Plan')).toBeInTheDocument()
    expect(screen.getByText(/2030年/)).toBeInTheDocument()
    expect(screen.getByText('1 GB')).toBeInTheDocument()
    expect(screen.getByText('2 GB')).toBeInTheDocument()
    expect(screen.getByText('100 GB')).toBeInTheDocument()
    expect(screen.getByText('活跃设备')).toBeInTheDocument()
    expect(screen.getByText('设备限制')).toBeInTheDocument()
    expect(screen.getByText('重置日')).toBeInTheDocument()
    expect(screen.getByText('新周期功能')).toBeInTheDocument()
    expect(screen.getByText('已启用')).toBeInTheDocument()
    expect(screen.queryByText(/剩余|百分比|可续费/)).toBeNull()
  })

  it('preserves null overview fields as neutral states', async () => {
    const mocks = installSubscriptionMocks()
    mocks.getOverview.mockResolvedValue({
      ...overview,
      product: null,
      expiresAt: null,
      deviceLimit: null,
      resetDay: null,
      renewalAllowed: false,
    })
    renderProtectedRoute('/subscription')

    expect(await screen.findByText('暂无当前套餐')).toBeInTheDocument()
    expect(screen.getByText('无固定到期时间')).toBeInTheDocument()
    expect(screen.getAllByText('未提供')).toHaveLength(2)
    expect(screen.getByText('未启用')).toBeInTheDocument()
  })

  it('masks, reveals, and hides the credential without changing browser URL state', async () => {
    installSubscriptionMocks()
    const { router } = renderProtectedRoute('/subscription')
    const user = userEvent.setup()

    expect(await screen.findByLabelText('订阅地址已隐藏')).toBeInTheDocument()
    expect(screen.queryByText(credentialUrl)).toBeNull()
    expect(document.querySelector(`a[href="${credentialUrl}"]`)).toBeNull()
    const locationBefore = router.state.location.href

    await user.click(screen.getByRole('button', { name: '显示' }))
    expect(screen.getByText(credentialUrl)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '隐藏' })).toBeInTheDocument()
    expect(router.state.location.href).toBe(locationBefore)

    await user.click(screen.getByRole('button', { name: '隐藏' }))
    expect(screen.queryByText(credentialUrl)).toBeNull()
    expect(screen.getByLabelText('订阅地址已隐藏')).toBeInTheDocument()
    expect(router.state.location.href).toBe(locationBefore)
  })

  it('copies the exact credential while feedback never includes it', async () => {
    installSubscriptionMocks()
    const { router } = renderProtectedRoute('/subscription')
    const user = userEvent.setup()
    const writeText = installClipboard(() => Promise.resolve())

    await user.click(await screen.findByRole('button', { name: '复制' }))

    expect(writeText).toHaveBeenCalledOnce()
    expect(writeText).toHaveBeenCalledWith(credentialUrl)
    expect(screen.getByRole('button', { name: '已复制' })).toBeInTheDocument()
    expect(screen.getAllByText('已复制')).toHaveLength(2)
    expect(screen.queryByText(credentialUrl)).toBeNull()
    expect(router.state.location.pathname).toBe('/subscription')
    expect(router.state.location.search).toEqual({})
    expect(Object.values(window.localStorage)).not.toContain(credentialUrl)
    expect(Object.values(window.sessionStorage)).not.toContain(credentialUrl)
  })

  it('shows a recoverable local error when clipboard access fails', async () => {
    installSubscriptionMocks()
    renderProtectedRoute('/subscription')
    const user = userEvent.setup()
    const writeText = installClipboard(() =>
      Promise.reject(new Error('Denied')),
    )

    await user.click(await screen.findByRole('button', { name: '复制' }))

    expect(writeText).toHaveBeenCalledOnce()
    expect(
      await screen.findByText('无法复制订阅地址，请重试或先显示后手动复制。'),
    ).toBeInTheDocument()
    expect(screen.queryByText(credentialUrl)).toBeNull()
  })

  it('renders an unavailable access state without inventing a cause', async () => {
    const mocks = installSubscriptionMocks()
    mocks.getAccess.mockResolvedValue({ eligible: false, accessUrl: null })
    renderProtectedRoute('/subscription')

    expect(
      await screen.findByText('当前没有可展示的订阅地址。'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '显示' })).toBeNull()
    expect(screen.queryByRole('button', { name: '复制' })).toBeNull()
  })

  it('keeps eligible access visible when current product is null', async () => {
    const mocks = installSubscriptionMocks()
    mocks.getOverview.mockResolvedValue({ ...overview, product: null })
    renderProtectedRoute('/subscription')

    expect(await screen.findByText('暂无当前套餐')).toBeInTheDocument()
    expect(screen.getByLabelText('订阅地址已隐藏')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '显示' })).toBeInTheDocument()
  })

  it('keeps overview available when access fails and retries only access', async () => {
    const mocks = installSubscriptionMocks()
    mocks.getAccess
      .mockRejectedValueOnce(
        new ApiError({
          status: 200,
          code: 'MALFORMED_RESPONSE',
          message: 'Invalid response',
        }),
      )
      .mockResolvedValueOnce({ eligible: true, accessUrl: credentialUrl })
    renderProtectedRoute('/subscription')
    const user = userEvent.setup()

    expect(await screen.findByText('Pro Plan')).toBeInTheDocument()
    expect(screen.getByText('暂时无法读取订阅地址。')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试' }))

    expect(await screen.findByLabelText('订阅地址已隐藏')).toBeInTheDocument()
    expect(mocks.getAccess).toHaveBeenCalledTimes(2)
    expect(mocks.getOverview).toHaveBeenCalledOnce()
  })

  it('keeps access available when overview fails and retries only overview', async () => {
    const mocks = installSubscriptionMocks()
    mocks.getOverview
      .mockRejectedValueOnce(
        new ApiError({
          status: 200,
          code: 'MALFORMED_RESPONSE',
          message: 'Invalid response',
        }),
      )
      .mockResolvedValueOnce(overview)
    renderProtectedRoute('/subscription')
    const user = userEvent.setup()

    expect(await screen.findByLabelText('订阅地址已隐藏')).toBeInTheDocument()
    expect(screen.getByText('暂时无法读取订阅概览。')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试' }))

    expect(await screen.findByText('Pro Plan')).toBeInTheDocument()
    expect(mocks.getOverview).toHaveBeenCalledTimes(2)
    expect(mocks.getAccess).toHaveBeenCalledOnce()
  })

  it('renders traffic entries in server order with canonical byte formatting', async () => {
    const mocks = installSubscriptionMocks()
    mocks.getTraffic.mockResolvedValue([
      {
        uploadedBytes: 1_073_741_824,
        downloadedBytes: 536_870_912,
        recordedAt: '2026-09-11T00:00:00.000Z',
        rateMultiplier: 1.5,
      },
      {
        uploadedBytes: 0,
        downloadedBytes: 1_024,
        recordedAt: '2026-09-10T00:00:00.000Z',
        rateMultiplier: 0,
      },
    ])
    renderProtectedRoute('/subscription')

    const first = await screen.findByText(/2026年9月11日/)
    const second = screen.getByText(/2026年9月10日/)
    expect(
      first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getAllByText('1 GB').length).toBeGreaterThan(1)
    expect(screen.getByText('512 MB')).toBeInTheDocument()
    expect(screen.getByText('1 KB')).toBeInTheDocument()
    expect(screen.getByText('×1.5')).toBeInTheDocument()
    expect(screen.getByText('×0')).toBeInTheDocument()
    expect(screen.queryByText('1.5 GB')).toBeNull()
    expect(screen.queryByText(/合计|计费流量|费用/)).toBeNull()
  })

  it('shows an honest empty traffic state', async () => {
    installSubscriptionMocks()
    renderProtectedRoute('/subscription')

    expect(await screen.findByText('暂无流量记录。')).toBeInTheDocument()
  })

  it('keeps Subscription reads visible when Traffic fails and retries only Traffic', async () => {
    const mocks = installSubscriptionMocks()
    mocks.getTraffic
      .mockRejectedValueOnce(
        new ApiError({
          status: 200,
          code: 'MALFORMED_RESPONSE',
          message: 'Invalid response',
          requestId: 'req-traffic',
        }),
      )
      .mockResolvedValueOnce([])
    renderProtectedRoute('/subscription')
    const user = userEvent.setup()

    expect(await screen.findByText('Pro Plan')).toBeInTheDocument()
    expect(screen.getByLabelText('订阅地址已隐藏')).toBeInTheDocument()
    expect(screen.getByText('暂时无法读取流量历史。')).toBeInTheDocument()
    expect(screen.getByText('请求编号：req-traffic')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试' }))

    expect(await screen.findByText('暂无流量记录。')).toBeInTheDocument()
    expect(mocks.getTraffic).toHaveBeenCalledTimes(2)
    expect(mocks.getOverview).toHaveBeenCalledOnce()
    expect(mocks.getAccess).toHaveBeenCalledOnce()
  })

  it.each(['AUTH_REQUIRED', 'AUTH_FAILED'])(
    'exits Subscription and clears credential cache when Traffic returns %s',
    async (code) => {
      const mocks = installSubscriptionMocks()
      mocks.getTraffic.mockRejectedValue(
        new ApiError({ status: 401, code, message: 'Authentication failed' }),
      )
      const queryClient = createQueryClient()
      queryClient.setQueryData(subscriptionQueryKeys.access, {
        eligible: true,
        accessUrl: credentialUrl,
      })
      const { router } = renderProtectedRoute('/subscription', queryClient)

      expect(
        await screen.findByRole('heading', { name: '登录 Aureole' }),
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
      expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
      expect(
        queryClient.getQueryData(subscriptionQueryKeys.access),
      ).toBeUndefined()
    },
  )

  it.each([
    ['access', 'AUTH_REQUIRED'],
    ['access', 'AUTH_FAILED'],
    ['overview', 'AUTH_REQUIRED'],
    ['overview', 'AUTH_FAILED'],
  ] as const)(
    'exits authenticated UI when %s returns %s and clears the credential cache',
    async (source, code) => {
      const mocks = installSubscriptionMocks()
      mocks[
        source === 'access' ? 'getAccess' : 'getOverview'
      ].mockRejectedValue(
        new ApiError({ status: 401, code, message: 'Authentication failed' }),
      )
      const queryClient = createQueryClient()
      queryClient.setQueryData(
        subscriptionQueryKeys.access,
        {
          eligible: true,
          accessUrl: credentialUrl,
        },
        { updatedAt: 0 },
      )
      const { router } = renderProtectedRoute('/subscription', queryClient)

      expect(
        await screen.findByRole('heading', { name: '登录 Aureole' }),
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
      expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
      expect(
        queryClient.getQueryData(subscriptionQueryKeys.access),
      ).toBeUndefined()
    },
  )
})

describe('Dashboard subscription core', () => {
  it('renders product, expiry, traffic, and subscription navigation', async () => {
    const mocks = installSubscriptionMocks()
    renderProtectedRoute('/dashboard')

    expect(await screen.findByText('Pro Plan')).toBeInTheDocument()
    expect(screen.getByText(/2030年/)).toBeInTheDocument()
    expect(screen.getByText('1 GB')).toBeInTheDocument()
    expect(screen.getByText('2 GB')).toBeInTheDocument()
    expect(screen.getByText('100 GB')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看订阅详情' })).toHaveAttribute(
      'href',
      '/subscription',
    )
    expect(mocks.getOverview).toHaveBeenCalledOnce()
    expect(mocks.getAccess).not.toHaveBeenCalled()
  })

  it('renders neutral product and expiry states', async () => {
    const mocks = installSubscriptionMocks()
    mocks.getOverview.mockResolvedValue({
      ...overview,
      product: null,
      expiresAt: null,
    })
    renderProtectedRoute('/dashboard')

    expect(await screen.findByText('暂无当前套餐')).toBeInTheDocument()
    expect(screen.getByText('无固定到期时间')).toBeInTheDocument()
  })

  it('shows loading while the canonical overview is unresolved', async () => {
    const mocks = installSubscriptionMocks()
    const deferred = createDeferred<SubscriptionOverview>()
    mocks.getOverview.mockImplementation(() => deferred.promise)
    renderProtectedRoute('/dashboard')

    expect(await screen.findByText('正在读取订阅概览…')).toBeInTheDocument()
    act(() => deferred.resolve(overview))
    expect(await screen.findByText('Pro Plan')).toBeInTheDocument()
  })

  it('shows a recoverable read error without logging out', async () => {
    const mocks = installSubscriptionMocks()
    mocks.getOverview
      .mockRejectedValueOnce(
        new ApiError({
          status: 200,
          code: 'MALFORMED_RESPONSE',
          message: 'Invalid response',
          requestId: 'req-dashboard',
        }),
      )
      .mockResolvedValueOnce(overview)
    renderProtectedRoute('/dashboard')
    const user = userEvent.setup()

    expect(
      await screen.findByText('暂时无法读取订阅概览。'),
    ).toBeInTheDocument()
    expect(screen.getByText('请求编号：req-dashboard')).toBeInTheDocument()
    expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBe(
      'opaque-session-token',
    )
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('Pro Plan')).toBeInTheDocument()
  })

  it('exits authenticated Dashboard after AUTH_FAILED', async () => {
    const mocks = installSubscriptionMocks()
    mocks.getOverview.mockRejectedValue(
      new ApiError({
        status: 401,
        code: 'AUTH_FAILED',
        message: 'Authentication failed',
      }),
    )
    const { router } = renderProtectedRoute('/dashboard')

    expect(
      await screen.findByRole('heading', { name: '登录 Aureole' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('reuses the canonical overview cache when navigating to Subscription', async () => {
    const mocks = installSubscriptionMocks()
    const { router } = renderProtectedRoute('/dashboard')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('link', { name: '查看订阅详情' }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/subscription'),
    )
    expect(await screen.findByText('当前订阅')).toBeInTheDocument()
    expect(mocks.getOverview).toHaveBeenCalledOnce()
    expect(mocks.getAccess).toHaveBeenCalledOnce()
    expect(mocks.getTraffic).toHaveBeenCalledOnce()
  })
})
