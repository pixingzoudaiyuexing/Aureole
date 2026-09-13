import {
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
import { accountApi } from '@/features/account/account-api'
import type { AuthApi } from '@/features/auth/auth-api'
import {
  ordersApi,
  type Order,
  type OrderStatus,
} from '@/features/orders/orders-api'
import { ApiError } from '@/lib/api/errors'
import { AUTH_SESSION_STORAGE_KEY } from '@/lib/auth/credential-storage'

const pendingOrder: Order = {
  id: 'order-pending',
  status: 'pending',
  amountMinor: 1099,
  createdAt: '2026-09-13T00:00:00.000Z',
  updatedAt: null,
  expiresAt: null,
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function installMocks(status: OrderStatus = 'pending') {
  const listedOrder = { ...pendingOrder, status }
  const getList = vi
    .spyOn(ordersApi, 'getList')
    .mockResolvedValue([listedOrder])
  const getDetail = vi
    .spyOn(ordersApi, 'getDetail')
    .mockResolvedValue(listedOrder)
  const cancel = vi
    .spyOn(ordersApi, 'cancel')
    .mockResolvedValue({ cancelled: true })
  vi.spyOn(accountApi, 'getConfig').mockResolvedValue({
    currency: 'CNY',
    currencySymbol: '¥',
  })
  return { cancel, getDetail, getList }
}

function renderOrders() {
  window.sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, 'token')
  const authApi: AuthApi = {
    login: vi.fn(),
    getCurrentUser: vi.fn().mockResolvedValue({
      email: 'member@example.com',
      expiresAt: null,
      status: 'active',
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
  return router
}

async function openDetail(user = userEvent.setup()) {
  await user.click(await screen.findByRole('button', { name: /order-pending/ }))
  const dialog = await screen.findByRole('dialog')
  await within(dialog).findByRole('heading', { name: '订单 order-pending' })
  return { dialog, user }
}

async function confirmCancel(user: ReturnType<typeof userEvent.setup>) {
  const dialog = screen.getByRole('dialog')
  await user.click(within(dialog).getByRole('button', { name: '取消订单' }))
  await user.click(within(dialog).getByRole('button', { name: '确认取消' }))
}

describe('Order Cancel flow', () => {
  it.each([
    ['processing', '已支付，开通处理中'],
    ['cancelled', '已取消'],
    ['completed', '已完成'],
    ['adjusted', '已用于套餐变更折抵'],
  ] as const)(
    'does not offer Cancel for authoritative %s Detail',
    async (status, label) => {
      installMocks(status)
      renderOrders()
      const { dialog } = await openDetail()
      expect(within(dialog).getByText(label)).toBeInTheDocument()
      expect(
        within(dialog).queryByRole('button', { name: '取消订单' }),
      ).toBeNull()
    },
  )

  it('requires explicit confirmation and Return sends no POST', async () => {
    const mocks = installMocks()
    renderOrders()
    const { dialog, user } = await openDetail()
    await user.click(within(dialog).getByRole('button', { name: '取消订单' }))
    expect(within(dialog).getByText('确认取消此订单？')).toBeInTheDocument()
    expect(mocks.cancel).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: '返回' }))
    expect(mocks.cancel).not.toHaveBeenCalled()
    expect(
      within(dialog).getByRole('button', { name: '取消订单' }),
    ).toBeInTheDocument()
  })

  it('prevents same-tick duplicate Cancel and refreshes Detail/List after success', async () => {
    const mocks = installMocks()
    const pending = deferred<{ cancelled: true }>()
    mocks.cancel.mockReturnValue(pending.promise)
    mocks.getDetail.mockResolvedValueOnce(pendingOrder).mockResolvedValueOnce({
      ...pendingOrder,
      status: 'cancelled',
    })
    renderOrders()
    const { dialog, user } = await openDetail()
    await user.click(within(dialog).getByRole('button', { name: '取消订单' }))
    const confirm = within(dialog).getByRole('button', { name: '确认取消' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await waitFor(() => expect(mocks.cancel).toHaveBeenCalledOnce())
    pending.resolve({ cancelled: true })
    expect(
      await within(dialog).findByText('订单取消请求已完成。'),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText('最新订单状态为：已取消'),
    ).toBeInTheDocument()
    expect(mocks.getDetail).toHaveBeenCalledTimes(2)
    expect(mocks.getList).toHaveBeenCalledTimes(2)
    expect(
      within(dialog).queryByRole('button', { name: '取消订单' }),
    ).toBeNull()
  })

  it('refreshes authoritative state after ORDER_NOT_CANCELLABLE', async () => {
    const mocks = installMocks()
    mocks.cancel.mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'ORDER_NOT_CANCELLABLE',
        message: 'stale',
      }),
    )
    mocks.getDetail.mockResolvedValueOnce(pendingOrder).mockResolvedValueOnce({
      ...pendingOrder,
      status: 'processing',
    })
    renderOrders()
    const { dialog, user } = await openDetail()
    await confirmCancel(user)
    expect(
      await within(dialog).findByText('该订单当前已不能取消。'),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText('最新订单状态为：已支付，开通处理中'),
    ).toBeInTheDocument()
    expect(mocks.cancel).toHaveBeenCalledOnce()
    expect(mocks.getDetail).toHaveBeenCalledTimes(2)
    expect(mocks.getList).toHaveBeenCalledTimes(2)
  })

  it('preserves Session and refreshes List after cancel ORDER_NOT_FOUND', async () => {
    const mocks = installMocks()
    mocks.cancel.mockRejectedValue(
      new ApiError({
        status: 404,
        code: 'ORDER_NOT_FOUND',
        message: 'missing',
      }),
    )
    renderOrders()
    const { dialog, user } = await openDetail()
    await confirmCancel(user)
    expect(
      await within(dialog).findByText('该订单不存在或已不可用。'),
    ).toBeInTheDocument()
    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBe('token')
    expect(mocks.getDetail).toHaveBeenCalledOnce()
    expect(mocks.getList).toHaveBeenCalledTimes(2)
  })

  it('does not auto retry ORDER_CANCEL_FAILED and refreshes Detail before allowing retry', async () => {
    const mocks = installMocks()
    mocks.cancel.mockRejectedValue(
      new ApiError({
        status: 502,
        code: 'ORDER_CANCEL_FAILED',
        message: 'failed',
      }),
    )
    renderOrders()
    const { dialog, user } = await openDetail()
    await confirmCancel(user)
    expect(
      await within(dialog).findByText('取消操作未完成。'),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        '已刷新订单详情，请核对最新状态后再决定是否重试。',
      ),
    ).toBeInTheDocument()
    expect(mocks.cancel).toHaveBeenCalledOnce()
    expect(mocks.getDetail).toHaveBeenCalledTimes(2)
    expect(mocks.getList).toHaveBeenCalledOnce()
    expect(
      within(dialog).getByRole('button', { name: '取消订单' }),
    ).toBeInTheDocument()
  })

  it.each([
    ['NETWORK_ERROR', 0, 'pending', '待支付'],
    ['UPSTREAM_TIMEOUT', 504, 'cancelled', '已取消'],
    ['UPSTREAM_ERROR', 502, 'processing', '已支付，开通处理中'],
    ['MALFORMED_RESPONSE', 200, 'completed', '已完成'],
  ] as const)(
    'treats %s Cancel as unknown and shows authoritative %s recovery',
    async (code, status, latestStatus, latestLabel) => {
      const mocks = installMocks()
      mocks.cancel.mockRejectedValue(
        new ApiError({ status, code, message: 'ambiguous' }),
      )
      mocks.getDetail
        .mockResolvedValueOnce(pendingOrder)
        .mockResolvedValueOnce({
          ...pendingOrder,
          status: latestStatus,
        })
      renderOrders()
      const { dialog, user } = await openDetail()
      await confirmCancel(user)
      expect(
        await within(dialog).findByText('取消请求结果无法直接确认。'),
      ).toBeInTheDocument()
      expect(
        within(dialog).getByText(
          `以下为当前服务端最新订单状态：${latestLabel}`,
        ),
      ).toBeInTheDocument()
      expect(mocks.cancel).toHaveBeenCalledOnce()
      expect(mocks.getDetail).toHaveBeenCalledTimes(2)
      expect(mocks.getList).toHaveBeenCalledTimes(2)
      expect(
        within(dialog).queryByRole('button', { name: '取消订单' }),
      ).toBeNull()
    },
  )

  it('does not reopen Cancel when ORDER_CANCEL_FAILED recovery Detail fails', async () => {
    const mocks = installMocks()
    mocks.cancel.mockRejectedValue(
      new ApiError({
        status: 502,
        code: 'ORDER_CANCEL_FAILED',
        message: 'failed',
      }),
    )
    mocks.getDetail
      .mockResolvedValueOnce(pendingOrder)
      .mockRejectedValueOnce(
        new ApiError({ status: 502, code: 'UPSTREAM_ERROR', message: 'bad' }),
      )
      .mockRejectedValueOnce(
        new ApiError({ status: 502, code: 'UPSTREAM_ERROR', message: 'bad' }),
      )
    renderOrders()
    const { dialog, user } = await openDetail()
    await confirmCancel(user)
    expect(
      await within(dialog).findByText(
        '订单详情暂时无法刷新，请关闭后稍后重新查看。',
        {},
        { timeout: 3_000 },
      ),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('button', { name: '取消订单' }),
    ).toBeNull()
    expect(mocks.cancel).toHaveBeenCalledOnce()
  })

  it.each(['cancel', 'detail-recovery', 'list-recovery'] as const)(
    'exits protected UI when %s returns AUTH failure',
    async (source) => {
      const mocks = installMocks()
      const authError = new ApiError({
        status: 401,
        code: source === 'cancel' ? 'AUTH_REQUIRED' : 'AUTH_FAILED',
        message: 'auth',
      })
      if (source === 'cancel') mocks.cancel.mockRejectedValue(authError)
      if (source === 'detail-recovery') {
        mocks.cancel.mockRejectedValue(
          new ApiError({
            status: 504,
            code: 'UPSTREAM_TIMEOUT',
            message: 'timeout',
          }),
        )
        mocks.getDetail
          .mockResolvedValueOnce(pendingOrder)
          .mockRejectedValue(authError)
      }
      if (source === 'list-recovery') {
        mocks.cancel.mockRejectedValue(
          new ApiError({
            status: 504,
            code: 'UPSTREAM_TIMEOUT',
            message: 'timeout',
          }),
        )
        mocks.getList
          .mockResolvedValueOnce([pendingOrder])
          .mockRejectedValue(authError)
      }
      const router = renderOrders()
      const { user } = await openDetail()
      await confirmCancel(user)
      expect(
        await screen.findByRole('heading', { name: '登录 Aureole' }),
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
      expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
    },
  )
})
