import type { QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/providers/app-providers'
import { createQueryClient } from '@/app/providers/query-client'
import { createAppRouter } from '@/app/router/router'
import { accountApi } from '@/features/account/account-api'
import { accountQueryKeys } from '@/features/account/account-queries'
import type { AuthApi, CurrentUser } from '@/features/auth/auth-api'
import { catalogApi, type Product } from '@/features/catalog/catalog-api'
import { resourcesApi } from '@/features/resources/resources-api'
import { subscriptionApi } from '@/features/subscription/subscription-api'
import { ApiError } from '@/lib/api/errors'
import { AUTH_SESSION_STORAGE_KEY } from '@/lib/auth/credential-storage'

const currentUser: CurrentUser = {
  email: 'member@example.com',
  expiresAt: '2030-01-01T00:00:00.000Z',
  status: 'active',
}

const products: Product[] = [
  {
    id: '7',
    name: 'Pro Plan',
    dataAllowanceGb: 100,
    speedLimitMbps: null,
    available: true,
    prices: [
      { billingPeriod: 'month', amountMinor: 990 },
      { billingPeriod: 'quarter', amountMinor: 2_500 },
      { billingPeriod: 'halfYear', amountMinor: 4_800 },
      { billingPeriod: 'year', amountMinor: 8_800 },
    ],
  },
  {
    id: '8',
    name: 'Starter Plan',
    dataAllowanceGb: 0,
    speedLimitMbps: 0,
    available: false,
    prices: [
      { billingPeriod: 'twoYears', amountMinor: 10_000 },
      { billingPeriod: 'threeYears', amountMinor: 12_000 },
      { billingPeriod: 'oneTime', amountMinor: 0 },
    ],
  },
]

function createAuthApi(valid: { current: boolean }): AuthApi {
  return {
    login: vi.fn(),
    getCurrentUser: vi.fn(async () => {
      if (!valid.current)
        throw new ApiError({
          status: 401,
          code: 'AUTH_FAILED',
          message: 'Authentication failed',
        })
      return currentUser
    }),
    logout: vi.fn(async () => {
      valid.current = false
    }),
  }
}

function renderProtectedRoute(
  path: '/plans' | '/resources',
  queryClient: QueryClient = createQueryClient(),
) {
  const router = createAppRouter({ initialEntries: [path] })
  const valid = { current: true }
  render(
    <AppProviders
      router={router}
      authApi={createAuthApi(valid)}
      queryClient={queryClient}
    />,
  )
  return {
    queryClient,
    router,
    invalidateSession: () => {
      valid.current = false
    },
  }
}

function installPlansMocks() {
  const getProducts = vi
    .spyOn(catalogApi, 'getProducts')
    .mockResolvedValue(products)
  const getConfig = vi.spyOn(accountApi, 'getConfig').mockResolvedValue({
    currency: 'CNY',
    currencySymbol: '¥',
  })
  const getOverview = vi.spyOn(subscriptionApi, 'getOverview')
  return { getConfig, getOverview, getProducts }
}

describe('Plans page', () => {
  it('renders products in server order with exact labels and no purchase claims', async () => {
    const mocks = installPlansMocks()
    renderProtectedRoute('/plans')

    const first = await screen.findByText('Pro Plan')
    const second = screen.getByText('Starter Plan')
    expect(
      first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getByText('100 GB')).toBeInTheDocument()
    expect(screen.getByText('0 GB')).toBeInTheDocument()
    expect(screen.getByText('未提供')).toBeInTheDocument()
    expect(screen.getByText('0 Mbps')).toBeInTheDocument()
    expect(screen.getByText('容量状态：可用')).toBeInTheDocument()
    expect(screen.getByText('容量状态：暂不可用')).toBeInTheDocument()
    for (const label of [
      '月付',
      '季付',
      '半年付',
      '年付',
      '两年付',
      '三年付',
      '一次性',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByText('¥9.90 CNY')).toBeInTheDocument()
    expect(screen.getByText('¥0.00 CNY')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /购买|订购|结账/ })).toBeNull()
    expect(screen.queryByText(/推荐|最受欢迎|Best Value/)).toBeNull()
    expect(mocks.getOverview).not.toHaveBeenCalled()
  })

  it('shows an honest empty catalog', async () => {
    const mocks = installPlansMocks()
    mocks.getProducts.mockResolvedValue([])
    renderProtectedRoute('/plans')

    expect(
      await screen.findByText('当前没有可展示的套餐。'),
    ).toBeInTheDocument()
  })

  it('keeps products visible when Account Config fails and retries only config', async () => {
    const mocks = installPlansMocks()
    mocks.getConfig
      .mockRejectedValueOnce(
        new ApiError({
          status: 200,
          code: 'MALFORMED_RESPONSE',
          message: 'Invalid response',
        }),
      )
      .mockResolvedValueOnce({ currency: 'CNY', currencySymbol: '¥' })
    renderProtectedRoute('/plans')
    const user = userEvent.setup()

    expect(await screen.findByText('Pro Plan')).toBeInTheDocument()
    expect(
      screen.getByText('暂时无法读取结算币种，套餐价格无法安全格式化。'),
    ).toBeInTheDocument()
    expect(screen.getAllByText('价格暂无法安全格式化').length).toBeGreaterThan(
      0,
    )
    await user.click(screen.getByRole('button', { name: '重试' }))

    expect(await screen.findByText('¥9.90 CNY')).toBeInTheDocument()
    expect(mocks.getConfig).toHaveBeenCalledTimes(2)
    expect(mocks.getProducts).toHaveBeenCalledOnce()
  })

  it('fails price formatting closed for an unsupported currency', async () => {
    const mocks = installPlansMocks()
    mocks.getConfig.mockResolvedValue({ currency: 'ZZZ', currencySymbol: '$' })
    renderProtectedRoute('/plans')

    expect(await screen.findByText('Pro Plan')).toBeInTheDocument()
    expect(screen.getAllByText('价格暂无法安全格式化').length).toBeGreaterThan(
      0,
    )
    expect(screen.queryByText('$9.90 ZZZ')).toBeNull()
  })

  it('reuses the canonical Account Config cache', async () => {
    const mocks = installPlansMocks()
    const queryClient = createQueryClient()
    renderProtectedRoute('/plans', queryClient)
    await screen.findByText('Pro Plan')
    queryClient.setQueryData(
      accountQueryKeys.config,
      { currency: 'JPY', currencySymbol: '¥' },
      { updatedAt: Date.now() },
    )
    await waitFor(() =>
      expect(screen.getByText('¥990 JPY')).toBeInTheDocument(),
    )
    expect(mocks.getConfig).toHaveBeenCalledOnce()
  })

  it('shows an ordinary catalog error and retries without logging out', async () => {
    const mocks = installPlansMocks()
    mocks.getProducts
      .mockRejectedValueOnce(
        new ApiError({
          status: 200,
          code: 'MALFORMED_RESPONSE',
          message: 'Invalid response',
          requestId: 'req-products',
        }),
      )
      .mockResolvedValueOnce(products)
    renderProtectedRoute('/plans')
    const user = userEvent.setup()

    expect(await screen.findByText('暂时无法读取套餐。')).toBeInTheDocument()
    expect(screen.getByText('请求编号：req-products')).toBeInTheDocument()
    expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('Pro Plan')).toBeInTheDocument()
  })

  it.each([
    ['products', 'AUTH_REQUIRED'],
    ['products', 'AUTH_FAILED'],
    ['config', 'AUTH_REQUIRED'],
    ['config', 'AUTH_FAILED'],
  ] as const)(
    'exits protected Plans when %s returns %s',
    async (source, code) => {
      const mocks = installPlansMocks()
      mocks[
        source === 'products' ? 'getProducts' : 'getConfig'
      ].mockRejectedValue(
        new ApiError({ status: 401, code, message: 'Authentication failed' }),
      )
      const { router, invalidateSession } = renderProtectedRoute('/plans')
      invalidateSession()

      expect(
        await screen.findByRole('heading', { name: '登录 Aureole' }),
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
      expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
    },
  )
})

function installResourcesMock() {
  return vi.spyOn(resourcesApi, 'getResources').mockResolvedValue([
    {
      id: '3',
      name: 'Hong Kong 01',
      category: 'vmess',
      status: 'online',
    },
    {
      id: '4',
      name: 'Tokyo 02',
      category: 'future-category',
      status: 'offline',
    },
  ])
}

describe('Resources page', () => {
  it('renders only public fields in server order with semantic statuses', async () => {
    installResourcesMock()
    renderProtectedRoute('/resources')

    const first = await screen.findByText('Hong Kong 01')
    const second = screen.getByText('Tokyo 02')
    expect(
      first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getByText('vmess')).toBeInTheDocument()
    expect(screen.getByText('future-category')).toBeInTheDocument()
    expect(screen.getByText('在线')).toBeInTheDocument()
    expect(screen.getByText('离线')).toBeInTheDocument()
    for (const privateValue of [
      'host',
      'IP',
      'port',
      'server key',
      'UUID',
      'SNI',
      'private.example',
      'must-not-survive',
    ]) {
      expect(screen.queryByText(privateValue)).toBeNull()
    }
  })

  it('shows an honest empty resource state', async () => {
    const getResources = installResourcesMock()
    getResources.mockResolvedValue([])
    renderProtectedRoute('/resources')

    expect(
      await screen.findByText('当前没有可展示的资源。'),
    ).toBeInTheDocument()
  })

  it('shows an ordinary resource error and retries independently', async () => {
    const getResources = installResourcesMock()
    getResources
      .mockRejectedValueOnce(
        new ApiError({
          status: 200,
          code: 'MALFORMED_RESPONSE',
          message: 'Invalid response',
        }),
      )
      .mockResolvedValueOnce([
        {
          id: '3',
          name: 'Hong Kong 01',
          category: 'vmess',
          status: 'online',
        },
      ])
    const queryClient = createQueryClient()
    renderProtectedRoute('/resources', queryClient)
    const user = userEvent.setup()

    expect(await screen.findByText('暂时无法读取资源。')).toBeInTheDocument()
    queryClient.setQueryData(['unrelated-subscription'], { kept: true })
    expect(queryClient.getQueryData(['unrelated-subscription'])).toEqual({
      kept: true,
    })
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('Hong Kong 01')).toBeInTheDocument()
  })

  it.each(['AUTH_REQUIRED', 'AUTH_FAILED'])(
    'exits protected Resources after %s',
    async (code) => {
      const getResources = installResourcesMock()
      getResources.mockRejectedValue(
        new ApiError({ status: 401, code, message: 'Authentication failed' }),
      )
      const { router, invalidateSession } = renderProtectedRoute('/resources')
      invalidateSession()

      expect(
        await screen.findByRole('heading', { name: '登录 Aureole' }),
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
      expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
    },
  )
})
