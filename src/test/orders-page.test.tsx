import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/providers/app-providers'
import { createQueryClient } from '@/app/providers/query-client'
import { createAppRouter } from '@/app/router/router'
import { accountApi } from '@/features/account/account-api'
import type { AuthApi } from '@/features/auth/auth-api'
import { ordersApi } from '@/features/orders/orders-api'
import { ApiError } from '@/lib/api/errors'
import { AUTH_SESSION_STORAGE_KEY } from '@/lib/auth/credential-storage'
import { useAuthSessionStore } from '@/lib/auth/session-store'

const baseOrder = {
  id: 'order-pending',
  status: 'pending' as const,
  amountMinor: 1099,
  createdAt: '2026-09-13T00:00:00.000Z',
  updatedAt: null,
  expiresAt: null,
}

const orders = [
  baseOrder,
  { ...baseOrder, id: 'order-processing', status: 'processing' as const },
  { ...baseOrder, id: 'order-cancelled', status: 'cancelled' as const },
  { ...baseOrder, id: 'order-completed', status: 'completed' as const },
  { ...baseOrder, id: 'order-adjusted', status: 'adjusted' as const },
]

function installMocks() {
  const getList = vi.spyOn(ordersApi, 'getList').mockResolvedValue(orders)
  const getDetail = vi
    .spyOn(ordersApi, 'getDetail')
    .mockResolvedValue(baseOrder)
  const getConfig = vi
    .spyOn(accountApi, 'getConfig')
    .mockResolvedValue({ currency: 'CNY', currencySymbol: '¥' })
  return { getList, getDetail, getConfig }
}

function renderOrders() {
  const valid = { current: true }
  const authApi: AuthApi = {
    login: vi.fn(),
    getCurrentUser: vi.fn(async () => {
      if (!valid.current)
        throw new ApiError({
          status: 401,
          code: 'AUTH_FAILED',
          message: 'Authentication failed',
        })
      return {
        email: 'member@example.com',
        expiresAt: null,
        status: 'active' as const,
      }
    }),
    logout: vi.fn(async () => {
      valid.current = false
    }),
  }
  const router = createAppRouter({ initialEntries: ['/orders'] })
  render(
    <AppProviders
      router={router}
      authApi={authApi}
      queryClient={createQueryClient()}
    />,
  )
  return {
    router,
    invalidateSession: () => {
      valid.current = false
    },
  }
}

describe('Orders page', () => {
  it('preserves server order, shows all status meanings, and formats CNY', async () => {
    installMocks()
    renderOrders()
    const first = await screen.findByText('order-pending')
    const second = screen.getByText('order-processing')
    expect(
      first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    for (const [id, label] of [
      ['order-pending', '待支付'],
      ['order-processing', '已支付，开通处理中'],
      ['order-cancelled', '已取消'],
      ['order-completed', '已完成'],
      ['order-adjusted', '已用于套餐变更折抵'],
    ]) {
      expect(
        screen.getByRole('button', { name: new RegExp(`${id}.*${label}`) }),
      ).toBeInTheDocument()
    }
    expect(screen.getAllByText('¥10.99 CNY')).toHaveLength(5)
    expect(screen.getAllByText(/2026年9月13日/)).toHaveLength(5)
    expect(
      screen.queryByText(/套餐购买|续费|充值|升级|降级|流量重置/),
    ).toBeNull()
    for (const command of [
      '购买',
      '创建订单',
      '取消订单',
      '支付',
      '继续支付',
      'Checkout',
      '优惠码',
    ]) {
      expect(screen.queryByRole('button', { name: command })).toBeNull()
    }
  })

  it('shows honest empty state', async () => {
    const mocks = installMocks()
    mocks.getList.mockResolvedValue([])
    renderOrders()
    expect(await screen.findByText('当前没有订单。')).toBeInTheDocument()
  })

  it('uses canonical JPY formatting', async () => {
    const mocks = installMocks()
    mocks.getList.mockResolvedValue([{ ...baseOrder, amountMinor: 990 }])
    mocks.getConfig.mockResolvedValue({ currency: 'JPY', currencySymbol: '¥' })
    renderOrders()
    expect(await screen.findByText('¥990 JPY')).toBeInTheDocument()
  })

  it('keeps orders visible when currency is unsupported', async () => {
    const mocks = installMocks()
    mocks.getList.mockResolvedValue([baseOrder])
    mocks.getConfig.mockResolvedValue({ currency: 'ZZZ', currencySymbol: '?' })
    renderOrders()
    expect(await screen.findByText('order-pending')).toBeInTheDocument()
    expect(screen.getByText('金额暂无法安全格式化')).toBeInTheDocument()
  })

  it('keeps orders visible when config fails and retries config', async () => {
    const mocks = installMocks()
    mocks.getConfig
      .mockRejectedValueOnce(
        new ApiError({ status: 502, code: 'UPSTREAM_ERROR', message: 'bad' }),
      )
      .mockRejectedValueOnce(
        new ApiError({ status: 502, code: 'UPSTREAM_ERROR', message: 'bad' }),
      )
      .mockResolvedValueOnce({ currency: 'CNY', currencySymbol: '¥' })
    renderOrders()
    const user = userEvent.setup()
    expect(await screen.findByText('order-pending')).toBeInTheDocument()
    expect(
      await screen.findByText(
        '暂时无法读取结算币种，订单金额无法安全格式化。',
        {},
        { timeout: 3_000 },
      ),
    ).toBeInTheDocument()
    expect(screen.getAllByText('金额暂无法安全格式化')).toHaveLength(5)
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findAllByText('¥10.99 CNY')).toHaveLength(5)
  })

  it('loads detail lazily, shows null times, closes, and restores focus', async () => {
    const mocks = installMocks()
    renderOrders()
    const user = userEvent.setup()
    const trigger = await screen.findByRole('button', {
      name: /order-pending/,
    })
    expect(mocks.getDetail).not.toHaveBeenCalled()
    await user.click(trigger)
    expect(
      await screen.findByRole('heading', { name: '订单 order-pending' }),
    ).toBeInTheDocument()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('¥10.99 CNY')).toBeInTheDocument()
    expect(within(dialog).getByText(/2026年9月13日/)).toBeInTheDocument()
    expect(within(dialog).getByText('暂无更新时间')).toBeInTheDocument()
    expect(within(dialog).getByText('未提供订单过期时间')).toBeInTheDocument()
    expect(mocks.getDetail).toHaveBeenCalledWith(
      useAuthSessionStore.getState().accessToken,
      'order-pending',
    )
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(trigger).toHaveFocus()
    await user.click(trigger)
    await screen.findByRole('heading', { name: '订单 order-pending' })
    await user.click(screen.getByRole('button', { name: '关闭订单详情' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(trigger).toHaveFocus()
  })

  it('keeps list available for detail 404 without retry', async () => {
    const mocks = installMocks()
    mocks.getDetail.mockRejectedValue(
      new ApiError({
        status: 404,
        code: 'ORDER_NOT_FOUND',
        message: 'missing',
      }),
    )
    renderOrders()
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: /order-pending/ }),
    )
    expect(
      await screen.findByText('该订单不存在或已不可用。'),
    ).toBeInTheDocument()
    expect(screen.getByText('order-processing')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull()
  })

  it('keeps list available while retrying an ordinary detail error', async () => {
    const mocks = installMocks()
    mocks.getDetail
      .mockRejectedValueOnce(
        new ApiError({
          status: 502,
          code: 'ORDER_QUERY_FAILED',
          message: 'bad',
        }),
      )
      .mockRejectedValueOnce(
        new ApiError({
          status: 502,
          code: 'ORDER_QUERY_FAILED',
          message: 'bad',
        }),
      )
      .mockResolvedValueOnce({ ...baseOrder, status: 'completed' })
    renderOrders()
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: /order-pending/ }),
    )
    expect(
      await screen.findByText('暂时无法读取订单详情。', {}, { timeout: 3_000 }),
    ).toBeInTheDocument()
    expect(screen.getByText('order-processing')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(mocks.getDetail).toHaveBeenCalledTimes(3))
    expect(
      within(screen.getByRole('dialog')).getByText('已完成'),
    ).toBeInTheDocument()
  })

  it('retries an ordinary list error', async () => {
    const mocks = installMocks()
    mocks.getList
      .mockRejectedValueOnce(
        new ApiError({
          status: 502,
          code: 'ORDER_QUERY_FAILED',
          message: 'bad',
        }),
      )
      .mockRejectedValueOnce(
        new ApiError({
          status: 502,
          code: 'ORDER_QUERY_FAILED',
          message: 'bad',
        }),
      )
      .mockResolvedValueOnce(orders)
    renderOrders()
    const user = userEvent.setup()
    expect(
      await screen.findByText('暂时无法读取订单。', {}, { timeout: 3_000 }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('order-pending')).toBeInTheDocument()
  })

  it.each(['AUTH_REQUIRED', 'AUTH_FAILED'])(
    'exits after list %s',
    async (code) => {
      const mocks = installMocks()
      mocks.getList.mockRejectedValue(
        new ApiError({ status: 401, code, message: 'auth' }),
      )
      const { router, invalidateSession } = renderOrders()
      invalidateSession()
      expect(
        await screen.findByRole('heading', { name: '登录 Aureole' }),
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
      expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
    },
  )

  it.each(['AUTH_REQUIRED', 'AUTH_FAILED'])(
    'exits after detail %s',
    async (code) => {
      const mocks = installMocks()
      mocks.getDetail.mockRejectedValue(
        new ApiError({ status: 401, code, message: 'auth' }),
      )
      const { router, invalidateSession } = renderOrders()
      const user = userEvent.setup()
      const detailButton = await screen.findByRole('button', {
        name: /order-pending/,
      })
      invalidateSession()
      await user.click(detailButton)
      expect(
        await screen.findByRole('heading', { name: '登录 Aureole' }),
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
      expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
      expect(screen.queryByText('暂无更新时间')).toBeNull()
    },
  )

  it('exits after Account Config AUTH_FAILED', async () => {
    const mocks = installMocks()
    mocks.getConfig.mockRejectedValue(
      new ApiError({ status: 401, code: 'AUTH_FAILED', message: 'auth' }),
    )
    const { router, invalidateSession } = renderOrders()
    invalidateSession()
    expect(
      await screen.findByRole('heading', { name: '登录 Aureole' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
  })

  it('does not render additive private order data', async () => {
    const mocks = installMocks()
    const orderWithPrivateFields = {
      ...baseOrder,
      productId: 'private-product',
      planName: 'Private Plan',
      paymentId: 'private-payment',
      callbackUrl: 'https://private.example/callback',
      userUuid: 'private-user',
      coupon: 'PRIVATE-COUPON',
    }
    mocks.getList.mockResolvedValue([orderWithPrivateFields])
    renderOrders()
    await screen.findByText('order-pending')
    for (const value of [
      'private-product',
      'Private Plan',
      'private-payment',
      'https://private.example/callback',
      'private-user',
      'PRIVATE-COUPON',
    ]) {
      expect(screen.queryByText(value)).toBeNull()
    }
  })
})
