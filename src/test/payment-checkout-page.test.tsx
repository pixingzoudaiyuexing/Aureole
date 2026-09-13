import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/providers/app-providers'
import { createQueryClient } from '@/app/providers/query-client'
import { createAppRouter } from '@/app/router/router'
import { accountApi } from '@/features/account/account-api'
import type { AuthApi } from '@/features/auth/auth-api'
import { ordersApi } from '@/features/orders/orders-api'
import {
  PAYMENT_STATUS_POLL_CAP_MS,
  PAYMENT_STATUS_POLL_INTERVAL_MS,
} from '@/features/payments/payment-constants'
import { paymentApi } from '@/features/payments/payment-api'
import { paymentNavigation } from '@/features/payments/payment-navigation'
import { ApiError } from '@/lib/api/errors'
import { AUTH_SESSION_STORAGE_KEY } from '@/lib/auth/credential-storage'

const pendingOrder = {
  id: 'payment-order-001',
  status: 'pending' as const,
  amountMinor: 1099,
  createdAt: '2026-09-13T00:00:00.000Z',
  updatedAt: null,
  expiresAt: null,
}

const methods = [
  {
    id: '3',
    name: '支付宝',
    icon: null,
    fee: { fixedMinor: 25, percent: 0.5 },
  },
  {
    id: '4',
    name: `银行卡${'很长的支付方式名称'.repeat(8)}`,
    icon: null,
    fee: { fixedMinor: 0, percent: 0 },
  },
]

function installMocks() {
  const getList = vi
    .spyOn(ordersApi, 'getList')
    .mockResolvedValue([pendingOrder])
  const getDetail = vi
    .spyOn(ordersApi, 'getDetail')
    .mockResolvedValue(pendingOrder)
  const getStatus = vi
    .spyOn(ordersApi, 'getStatus')
    .mockResolvedValue({ id: pendingOrder.id, status: 'pending' })
  const getMethods = vi
    .spyOn(paymentApi, 'getMethods')
    .mockResolvedValue(methods)
  const checkout = vi
    .spyOn(paymentApi, 'checkout')
    .mockResolvedValue({ type: 'finished' })
  vi.spyOn(accountApi, 'getConfig').mockResolvedValue({
    currency: 'CNY',
    currencySymbol: '¥',
  })
  return { checkout, getDetail, getList, getMethods, getStatus }
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
  const view = render(
    <AppProviders
      router={router}
      authApi={authApi}
      queryClient={createQueryClient()}
    />,
  )
  return { router, ...view }
}

async function openDetail() {
  const user = userEvent.setup()
  await user.click(
    await screen.findByRole('button', { name: /payment-order-001/ }),
  )
  const dialog = await screen.findByRole('dialog')
  await within(dialog).findByRole('button', { name: '支付订单' })
  return { dialog, user }
}

async function openPaymentAndSelect() {
  const opened = await openDetail()
  await opened.user.click(
    within(opened.dialog).getByRole('button', { name: '支付订单' }),
  )
  await opened.user.click(
    await within(opened.dialog).findByRole('radio', { name: /支付宝/ }),
  )
  return opened
}

async function confirmPayment(
  dialog: HTMLElement,
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(within(dialog).getByRole('button', { name: '确认支付' }))
}

afterEach(() => {
  vi.useRealTimers()
})

describe('Payment checkout flow', () => {
  it('loads methods only after explicit Pay and shows Contract fee metadata', async () => {
    const mocks = installMocks()
    renderOrders()
    const { dialog, user } = await openDetail()
    expect(mocks.getMethods).not.toHaveBeenCalled()
    expect(
      within(dialog).getByRole('button', { name: '取消订单' }),
    ).toBeEnabled()
    await user.click(within(dialog).getByRole('button', { name: '支付订单' }))
    expect(await within(dialog).findByText('支付宝')).toBeInTheDocument()
    expect(
      within(dialog).getByText('手续费：¥0.25 CNY + 0.5%'),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(/银行卡很长的支付方式名称/),
    ).toBeInTheDocument()
    expect(mocks.getMethods).toHaveBeenCalledOnce()
  })

  it('shows an honest empty state and icon fallback', async () => {
    const mocks = installMocks()
    mocks.getMethods.mockResolvedValue([])
    renderOrders()
    const { dialog, user } = await openDetail()
    await user.click(within(dialog).getByRole('button', { name: '支付订单' }))
    expect(
      await within(dialog).findByText('当前没有可用的支付方式。'),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('button', { name: '确认支付' }),
    ).toBeNull()
  })

  it('allows only one same-tick Checkout POST', async () => {
    const mocks = installMocks()
    let resolveCheckout!: (value: { type: 'finished' }) => void
    mocks.checkout.mockReturnValue(
      new Promise((resolve) => {
        resolveCheckout = resolve
      }),
    )
    renderOrders()
    const { dialog } = await openPaymentAndSelect()
    const button = within(dialog).getByRole('button', { name: '确认支付' })
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(mocks.checkout).toHaveBeenCalledOnce())
    expect(mocks.checkout).toHaveBeenCalledWith('token', pendingOrder.id, {
      paymentMethodId: '3',
    })
    await act(async () => resolveCheckout({ type: 'finished' }))
  })

  it('renders QR locally without fetching, changing URL, or persisting payload', async () => {
    const mocks = installMocks()
    const qrData = 'provider-pay://opaque?signature=a%2Bb&value=unchanged'
    mocks.checkout.mockResolvedValue({ type: 'qrcode', data: qrData })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const initialHref = window.location.href
    renderOrders()
    const { dialog, user } = await openPaymentAndSelect()
    await confirmPayment(dialog, user)
    expect(
      await within(dialog).findByRole('img', { name: '支付二维码' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText('请使用对应支付方式扫码完成支付。'),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(`订单编号：${pendingOrder.id}`),
    ).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(qrData)
    expect(window.location.href).toBe(initialHref)
    expect(
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    ).not.toContain(qrData)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('requires an explicit Redirect action and preserves its target', async () => {
    const mocks = installMocks()
    const target = 'https://pay.example/checkout?signed=a%2Bb&order=1'
    mocks.checkout.mockResolvedValue({ type: 'redirect', target })
    const navigate = vi
      .spyOn(paymentNavigation, 'goTo')
      .mockImplementation(() => undefined)
    renderOrders()
    const { dialog, user } = await openPaymentAndSelect()
    await confirmPayment(dialog, user)
    expect(
      await within(dialog).findByText('支付页面已准备好'),
    ).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
    expect(within(dialog).queryByText(target)).toBeNull()
    expect(within(dialog).queryByTitle(/iframe/i)).toBeNull()
    expect(document.querySelector('iframe')).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: '前往支付' }))
    expect(navigate).toHaveBeenCalledWith(target)
  })

  it('does not treat finished as success and starts authoritative confirmation', async () => {
    const mocks = installMocks()
    mocks.checkout.mockResolvedValue({ type: 'finished' })
    renderOrders()
    const { dialog, user } = await openPaymentAndSelect()
    await confirmPayment(dialog, user)
    expect(
      await within(dialog).findByText('支付流程已提交，正在确认订单状态。'),
    ).toBeInTheDocument()
    expect(within(dialog).queryByText(/支付成功|订阅已开通/)).toBeNull()
    expect(mocks.getStatus).toHaveBeenCalled()
    expect(mocks.getDetail).toHaveBeenCalledTimes(2)
    expect(mocks.getList).toHaveBeenCalledTimes(2)
  })

  it('keeps Checkout closed when Status is final even if Detail recovery fails', async () => {
    const mocks = installMocks()
    mocks.checkout.mockResolvedValue({ type: 'finished' })
    mocks.getStatus.mockResolvedValue({
      id: pendingOrder.id,
      status: 'completed',
    })
    mocks.getDetail.mockResolvedValueOnce(pendingOrder).mockRejectedValue(
      new ApiError({
        status: 502,
        code: 'UPSTREAM_ERROR',
        message: 'detail',
      }),
    )
    renderOrders()
    const { dialog, user } = await openPaymentAndSelect()
    await confirmPayment(dialog, user)
    expect(
      await within(dialog).findByText(
        '订单状态已更新：已完成。',
        {},
        { timeout: 3_000 },
      ),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('button', { name: '确认支付' }),
    ).toBeNull()
    expect(mocks.checkout).toHaveBeenCalledOnce()
  })

  it.each([
    ['NETWORK_ERROR', 0],
    ['UPSTREAM_TIMEOUT', 504],
    ['UPSTREAM_ERROR', 502],
    ['MALFORMED_RESPONSE', 200],
  ] as const)(
    'treats %s as unknown, recovers, and guards explicit resubmission',
    async (code, status) => {
      const mocks = installMocks()
      mocks.checkout.mockRejectedValue(
        new ApiError({ status, code, message: 'ambiguous' }),
      )
      renderOrders()
      const { dialog, user } = await openPaymentAndSelect()
      await confirmPayment(dialog, user)
      expect(
        await within(dialog).findByText('支付请求结果暂时无法确认。'),
      ).toBeInTheDocument()
      expect(within(dialog).queryByText('支付失败')).toBeNull()
      expect(mocks.checkout).toHaveBeenCalledOnce()
      expect(mocks.getStatus).toHaveBeenCalledOnce()
      expect(mocks.getDetail).toHaveBeenCalledTimes(2)
      expect(mocks.getList).toHaveBeenCalledTimes(2)
      const confirm = within(dialog).getByRole('button', { name: '确认支付' })
      expect(confirm).toBeDisabled()
      await user.click(
        within(dialog).getByRole('checkbox', {
          name: '我已检查订单状态，仍要重新发起支付',
        }),
      )
      expect(confirm).toBeEnabled()
      expect(mocks.checkout).toHaveBeenCalledOnce()
    },
  )

  it.each([
    ['PAYMENT_METHOD_UNAVAILABLE', '当前支付方式已不可用，请重新选择。'],
    ['ORDER_EXPIRED', '订单已过期，支付流程已停止。'],
    ['PAYMENT_CREATE_FAILED', '支付流程未能创建。'],
    ['VALIDATION_ERROR', '支付信息已失效，请重新选择支付方式。'],
  ] as const)(
    'recovers definitive %s without logging out or retrying',
    async (code, message) => {
      const mocks = installMocks()
      mocks.checkout.mockRejectedValue(
        new ApiError({ status: 422, code, message: 'definitive' }),
      )
      renderOrders()
      const { dialog, user } = await openPaymentAndSelect()
      await confirmPayment(dialog, user)
      expect(
        await within(dialog).findByText(new RegExp(message)),
      ).toBeInTheDocument()
      expect(mocks.checkout).toHaveBeenCalledOnce()
      expect(mocks.getStatus).toHaveBeenCalledOnce()
      expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBe('token')
      if (
        code === 'PAYMENT_METHOD_UNAVAILABLE' ||
        code === 'VALIDATION_ERROR'
      ) {
        expect(mocks.getMethods).toHaveBeenCalledTimes(2)
      }
      if (code === 'ORDER_EXPIRED') {
        expect(mocks.getDetail).toHaveBeenCalledTimes(2)
        expect(mocks.getList).toHaveBeenCalledTimes(2)
      }
    },
  )

  it('prevents Cancel and Payment flows from conflicting', async () => {
    installMocks()
    renderOrders()
    const { dialog, user } = await openDetail()
    const cancel = within(dialog).getByRole('button', { name: '取消订单' })
    await user.click(within(dialog).getByRole('button', { name: '支付订单' }))
    expect(cancel).toBeDisabled()
    await user.click(within(dialog).getByRole('button', { name: '关闭支付' }))
    expect(cancel).toBeEnabled()
    await user.click(cancel)
    expect(
      within(dialog).getByRole('button', { name: '支付订单' }),
    ).toBeDisabled()
  })

  it('stops QR polling when Payment UI closes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const mocks = installMocks()
    mocks.checkout.mockResolvedValue({ type: 'qrcode', data: 'opaque-qr' })
    renderOrders()
    await user.click(
      await screen.findByRole('button', { name: /payment-order-001/ }),
    )
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '支付订单' }))
    await user.click(
      await within(dialog).findByRole('radio', { name: /支付宝/ }),
    )
    await user.click(within(dialog).getByRole('button', { name: '确认支付' }))
    await waitFor(() => expect(mocks.getStatus).toHaveBeenCalledOnce())
    await act(async () =>
      vi.advanceTimersByTimeAsync(PAYMENT_STATUS_POLL_INTERVAL_MS),
    )
    await waitFor(() =>
      expect(mocks.getStatus.mock.calls.length).toBeGreaterThan(1),
    )
    await user.click(within(dialog).getByRole('button', { name: '关闭支付' }))
    const countAfterClose = mocks.getStatus.mock.calls.length
    await act(async () =>
      vi.advanceTimersByTimeAsync(PAYMENT_STATUS_POLL_INTERVAL_MS * 2),
    )
    expect(mocks.getStatus).toHaveBeenCalledTimes(countAfterClose)
  })

  it('stops polling on a non-pending status and refreshes Detail and List', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const mocks = installMocks()
    mocks.checkout.mockResolvedValue({ type: 'qrcode', data: 'opaque-qr' })
    mocks.getStatus
      .mockResolvedValueOnce({ id: pendingOrder.id, status: 'pending' })
      .mockResolvedValueOnce({ id: pendingOrder.id, status: 'processing' })
    renderOrders()
    await user.click(
      await screen.findByRole('button', { name: /payment-order-001/ }),
    )
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '支付订单' }))
    await user.click(
      await within(dialog).findByRole('radio', { name: /支付宝/ }),
    )
    await user.click(within(dialog).getByRole('button', { name: '确认支付' }))
    await waitFor(() => expect(mocks.getStatus).toHaveBeenCalledOnce())
    await act(async () =>
      vi.advanceTimersByTimeAsync(PAYMENT_STATUS_POLL_INTERVAL_MS),
    )
    await waitFor(() => {
      expect(mocks.getStatus).toHaveBeenCalledTimes(2)
      expect(mocks.getDetail).toHaveBeenCalledTimes(2)
      expect(mocks.getList).toHaveBeenCalledTimes(2)
    })
    expect(
      within(dialog).getByText('订单状态已更新：已支付，开通处理中。'),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('button', { name: '确认支付' }),
    ).toBeNull()
    const countAfterTransition = mocks.getStatus.mock.calls.length
    await act(async () =>
      vi.advanceTimersByTimeAsync(PAYMENT_STATUS_POLL_INTERVAL_MS * 2),
    )
    expect(mocks.getStatus).toHaveBeenCalledTimes(countAfterTransition)
  })

  it('stops at the polling hard cap and offers manual refresh', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const mocks = installMocks()
    mocks.checkout.mockResolvedValue({ type: 'qrcode', data: 'opaque-qr' })
    renderOrders()
    await user.click(
      await screen.findByRole('button', { name: /payment-order-001/ }),
    )
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '支付订单' }))
    await user.click(
      await within(dialog).findByRole('radio', { name: /支付宝/ }),
    )
    await user.click(within(dialog).getByRole('button', { name: '确认支付' }))
    await waitFor(() => expect(mocks.getStatus).toHaveBeenCalled())
    await act(async () =>
      vi.advanceTimersByTimeAsync(PAYMENT_STATUS_POLL_CAP_MS + 1),
    )
    expect(
      await within(dialog).findByText(
        '暂未确认支付状态，请稍后手动刷新订单状态。',
      ),
    ).toBeInTheDocument()
    const beforeManualRefresh = mocks.getStatus.mock.calls.length
    await user.click(within(dialog).getByRole('button', { name: '刷新状态' }))
    await waitFor(() =>
      expect(mocks.getStatus).toHaveBeenCalledTimes(beforeManualRefresh + 1),
    )
  })
})

describe('Payment authentication boundaries', () => {
  it('exits authenticated UI when Payment Methods rejects the session', async () => {
    const mocks = installMocks()
    mocks.getMethods.mockRejectedValue(
      new ApiError({ status: 401, code: 'AUTH_REQUIRED', message: 'auth' }),
    )
    const { router } = renderOrders()
    const { dialog, user } = await openDetail()
    await user.click(within(dialog).getByRole('button', { name: '支付订单' }))
    expect(
      await screen.findByRole('heading', { name: '登录 Aureole' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('exits authenticated UI when Checkout rejects the session', async () => {
    const mocks = installMocks()
    mocks.checkout.mockRejectedValue(
      new ApiError({ status: 401, code: 'AUTH_FAILED', message: 'auth' }),
    )
    const { router } = renderOrders()
    const { dialog, user } = await openPaymentAndSelect()
    await confirmPayment(dialog, user)
    expect(
      await screen.findByRole('heading', { name: '登录 Aureole' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('exits authenticated UI when status polling rejects the session', async () => {
    const mocks = installMocks()
    mocks.checkout.mockResolvedValue({ type: 'qrcode', data: 'opaque-qr' })
    mocks.getStatus.mockRejectedValue(
      new ApiError({ status: 401, code: 'AUTH_FAILED', message: 'auth' }),
    )
    const { router } = renderOrders()
    const { dialog, user } = await openPaymentAndSelect()
    await confirmPayment(dialog, user)
    expect(
      await screen.findByRole('heading', { name: '登录 Aureole' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it.each(['detail', 'list'] as const)(
    'exits authenticated UI when unknown-result %s recovery rejects the session',
    async (source) => {
      const mocks = installMocks()
      mocks.checkout.mockRejectedValue(
        new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'unknown' }),
      )
      const authError = new ApiError({
        status: 401,
        code: 'AUTH_FAILED',
        message: 'auth',
      })
      if (source === 'detail') {
        mocks.getDetail
          .mockResolvedValueOnce(pendingOrder)
          .mockRejectedValue(authError)
      } else {
        mocks.getList
          .mockResolvedValueOnce([pendingOrder])
          .mockRejectedValue(authError)
      }
      const { router } = renderOrders()
      const { dialog, user } = await openPaymentAndSelect()
      await confirmPayment(dialog, user)
      expect(
        await screen.findByRole('heading', { name: '登录 Aureole' }),
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
      expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
    },
  )
})
