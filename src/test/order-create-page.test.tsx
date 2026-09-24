import type { QueryClient } from '@tanstack/react-query'
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
import { catalogApi, type Product } from '@/features/catalog/catalog-api'
import { ordersApi } from '@/features/orders/orders-api'
import { promotionsApi } from '@/features/orders/promotions-api'
import { promotionUiApi } from '@/features/orders/promotion-ui-api'
import { promotionUiQueryKey } from '@/features/orders/promotion-ui-queries'
import { ApiError } from '@/lib/api/errors'
import { AUTH_SESSION_STORAGE_KEY } from '@/lib/auth/credential-storage'
import { useAuthSessionStore } from '@/lib/auth/session-store'

const product: Product = {
  id: '7',
  name: 'Pro Plan',
  dataAllowanceGb: 100,
  speedLimitMbps: null,
  available: false,
  prices: [
    { billingPeriod: 'month', amountMinor: 990 },
    { billingPeriod: 'quarter', amountMinor: 2_500 },
    { billingPeriod: 'halfYear', amountMinor: 4_800 },
    { billingPeriod: 'year', amountMinor: 8_800 },
    { billingPeriod: 'twoYears', amountMinor: 10_000 },
    { billingPeriod: 'threeYears', amountMinor: 12_000 },
    { billingPeriod: 'oneTime', amountMinor: 15_000 },
  ],
}
const priceLessProduct: Product = {
  ...product,
  id: '8',
  name: 'No Price Plan',
  prices: [],
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

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
}

function installMocks() {
  vi.spyOn(promotionUiApi, 'getConfig').mockResolvedValue({
    showCouponEntry: true,
    annualPrefillCode: null,
  })
  const getProducts = vi
    .spyOn(catalogApi, 'getProducts')
    .mockResolvedValue([product, priceLessProduct])
  const getProduct = vi
    .spyOn(catalogApi, 'getProduct')
    .mockResolvedValue(product)
  const getConfig = vi
    .spyOn(accountApi, 'getConfig')
    .mockResolvedValue({ currency: 'CNY', currencySymbol: '¥' })
  const validate = vi.spyOn(promotionsApi, 'validate').mockResolvedValue({
    valid: true,
    discount: { type: 'fixed', amountMinor: 500 },
  })
  const create = vi
    .spyOn(ordersApi, 'create')
    .mockResolvedValue({ id: 'order-created' })
  const getOrders = vi.spyOn(ordersApi, 'getList').mockResolvedValue([])
  return { create, getConfig, getOrders, getProduct, getProducts, validate }
}

function renderPlans(queryClient: QueryClient = createQueryClient()) {
  const valid = { current: true }
  const router = createAppRouter({ initialEntries: ['/plans'] })
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

async function openCreateDialog(user = userEvent.setup(), waitForForm = true) {
  const trigger = await screen.findByRole('button', { name: '创建订单' })
  await user.click(trigger)
  const dialog = await screen.findByRole('dialog')
  if (waitForForm) await within(dialog).findByText('选择周期')
  return { dialog, trigger, user }
}

async function selectMonthAndConfirm(user: ReturnType<typeof userEvent.setup>) {
  const dialog = screen.getByRole('dialog')
  await user.click(within(dialog).getByRole('radio', { name: /月付/ }))
  await user.click(within(dialog).getByRole('button', { name: '确认创建订单' }))
}

describe('Order Create flow', () => {
  it('loads Product Detail lazily, keeps unavailable as metadata, and restores focus', async () => {
    const mocks = installMocks()
    renderPlans()
    const user = userEvent.setup()
    const trigger = await screen.findByRole('button', { name: '创建订单' })
    expect(screen.getAllByRole('button', { name: '创建订单' })).toHaveLength(1)
    expect(mocks.getProduct).not.toHaveBeenCalled()
    await user.click(trigger)
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('暂不可用')).toBeInTheDocument()
    expect(within(dialog).getByText('100 GB')).toBeInTheDocument()
    expect(within(dialog).getByText('未提供')).toBeInTheDocument()
    expect(mocks.getProduct).toHaveBeenCalledWith(
      useAuthSessionStore.getState().accessToken,
      '7',
    )
    for (const label of [
      '月付',
      '季付',
      '半年付',
      '年付',
      '两年付',
      '三年付',
      '一次性',
    ]) {
      expect(within(dialog).getByText(label)).toBeInTheDocument()
    }
    expect(
      within(dialog).getByRole('button', { name: '确认创建订单' }),
    ).toBeDisabled()
    await user.click(
      within(dialog).getByRole('button', { name: '关闭创建订单' }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(trigger).toHaveFocus()
  })

  it('shows no-period state when authoritative Detail has no prices', async () => {
    const mocks = installMocks()
    mocks.getProduct.mockResolvedValue({ ...product, prices: [] })
    renderPlans()
    const { dialog } = await openCreateDialog(undefined, false)
    expect(
      await within(dialog).findByText('当前套餐没有可选的下单周期。'),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('button', { name: '确认创建订单' }),
    ).toBeDisabled()
  })

  it('keeps the manual entry on configuration failure and submits no unverified code', async () => {
    const mocks = installMocks()
    vi.mocked(promotionUiApi.getConfig).mockRejectedValue(new Error('offline'))
    renderPlans()
    const { dialog, user } = await openCreateDialog()
    const input = within(dialog).getByLabelText('优惠码（可选）')
    await user.click(
      within(dialog).getByRole('radio', { name: /^年付套餐标价/ }),
    )
    expect(input).toHaveValue('')
    await user.type(input, 'MANUAL')
    await user.click(
      within(dialog).getByRole('button', { name: '确认创建订单' }),
    )
    expect(await within(dialog).findByText('订单已创建')).toBeInTheDocument()
    expect(mocks.validate).not.toHaveBeenCalled()
    expect(mocks.create.mock.calls[0]?.[1]).toEqual({
      productId: '7',
      billingPeriod: 'year',
    })
  })

  it('hides an already entered and validated coupon when config closes', async () => {
    const mocks = installMocks()
    const queryClient = createQueryClient()
    renderPlans(queryClient)
    const { dialog, user } = await openCreateDialog()
    await user.click(within(dialog).getByRole('radio', { name: /月付/ }))
    await user.type(within(dialog).getByLabelText('优惠码（可选）'), 'OLD')
    await user.click(within(dialog).getByRole('button', { name: '验证优惠码' }))
    await within(dialog).findByText(/优惠预览：/)
    queryClient.setQueryData(promotionUiQueryKey, {
      showCouponEntry: false,
      annualPrefillCode: null,
    })
    await waitFor(() =>
      expect(within(dialog).queryByLabelText('优惠码（可选）')).toBeNull(),
    )
    expect(
      within(dialog).queryByRole('button', { name: '验证优惠码' }),
    ).toBeNull()
    expect(within(dialog).queryByText(/优惠预览：/)).toBeNull()
    await user.click(
      within(dialog).getByRole('button', { name: '确认创建订单' }),
    )
    expect(await within(dialog).findByText('订单已创建')).toBeInTheDocument()
    expect(mocks.create.mock.calls[0]?.[1]).toEqual({
      productId: '7',
      billingPeriod: 'month',
    })
  })

  it('prefills only annual, never validates automatically, and preserves user edits after refresh', async () => {
    const mocks = installMocks()
    const queryClient = createQueryClient()
    vi.mocked(promotionUiApi.getConfig).mockResolvedValue({
      showCouponEntry: true,
      annualPrefillCode: 'PUBLIC-YEAR',
    })
    renderPlans(queryClient)
    const { dialog, user } = await openCreateDialog()
    const input = within(dialog).getByLabelText('优惠码（可选）')
    await user.click(within(dialog).getByRole('radio', { name: /月付/ }))
    expect(input).toHaveValue('')
    await user.click(
      within(dialog).getByRole('radio', { name: /^年付套餐标价/ }),
    )
    await waitFor(() => expect(input).toHaveValue('PUBLIC-YEAR'))
    expect(mocks.validate).not.toHaveBeenCalled()
    await user.click(
      within(dialog).getByRole('button', { name: '确认创建订单' }),
    )
    expect(await within(dialog).findByText('订单已创建')).toBeInTheDocument()
    expect(mocks.create.mock.calls[0]?.[1]).toEqual({
      productId: '7',
      billingPeriod: 'year',
    })
  })

  it('does not overwrite a user-cleared prefill on a later query response', async () => {
    installMocks()
    const queryClient = createQueryClient()
    vi.mocked(promotionUiApi.getConfig).mockResolvedValue({
      showCouponEntry: true,
      annualPrefillCode: 'PUBLIC-YEAR',
    })
    renderPlans(queryClient)
    const { dialog, user } = await openCreateDialog()
    const input = within(dialog).getByLabelText('优惠码（可选）')
    await user.click(
      within(dialog).getByRole('radio', { name: /^年付套餐标价/ }),
    )
    await waitFor(() => expect(input).toHaveValue('PUBLIC-YEAR'))
    await user.clear(input)
    queryClient.setQueryData(promotionUiQueryKey, {
      showCouponEntry: true,
      annualPrefillCode: 'REFRESHED',
    })
    expect(input).toHaveValue('')
    await user.click(within(dialog).getByRole('radio', { name: /月付/ }))
    await user.click(
      within(dialog).getByRole('radio', { name: /^年付套餐标价/ }),
    )
    expect(input).toHaveValue('')
  })

  it('preserves a manual edit made before the annual config response arrives', async () => {
    installMocks()
    const pending = deferred<{
      showCouponEntry: true
      annualPrefillCode: string
    }>()
    vi.mocked(promotionUiApi.getConfig).mockReturnValue(pending.promise)
    renderPlans()
    const { dialog, user } = await openCreateDialog()
    await user.click(
      within(dialog).getByRole('radio', { name: /^年付套餐标价/ }),
    )
    const input = within(dialog).getByLabelText('优惠码（可选）')
    await user.type(input, 'MY-CODE')
    pending.resolve({ showCouponEntry: true, annualPrefillCode: 'LATE-CODE' })
    await waitFor(() => expect(promotionUiApi.getConfig).toHaveBeenCalledOnce())
    expect(input).toHaveValue('MY-CODE')
  })

  it('discards an in-flight validation after the coupon entry is closed', async () => {
    const mocks = installMocks()
    const pending = deferred<{
      valid: true
      discount: { type: 'fixed'; amountMinor: number }
    }>()
    mocks.validate.mockReturnValue(pending.promise)
    const queryClient = createQueryClient()
    renderPlans(queryClient)
    const { dialog, user } = await openCreateDialog()
    await user.click(within(dialog).getByRole('radio', { name: /月付/ }))
    await user.type(within(dialog).getByLabelText('优惠码（可选）'), 'OLD')
    await user.click(within(dialog).getByRole('button', { name: '验证优惠码' }))
    queryClient.setQueryData(promotionUiQueryKey, {
      showCouponEntry: false,
      annualPrefillCode: null,
    })
    await waitFor(() =>
      expect(within(dialog).queryByLabelText('优惠码（可选）')).toBeNull(),
    )
    pending.resolve({
      valid: true,
      discount: { type: 'fixed', amountMinor: 500 },
    })
    await user.click(
      within(dialog).getByRole('button', { name: '确认创建订单' }),
    )
    expect(await within(dialog).findByText('订单已创建')).toBeInTheDocument()
    expect(mocks.create.mock.calls[0]?.[1]).toEqual({
      productId: '7',
      billingPeriod: 'month',
    })
  })

  it('clears an old preview and excludes its coupon when the billing period changes', async () => {
    const mocks = installMocks()
    renderPlans()
    const { dialog, user } = await openCreateDialog()
    await user.click(within(dialog).getByRole('radio', { name: /月付/ }))
    await user.type(within(dialog).getByLabelText('优惠码（可选）'), 'MANUAL')
    await user.click(within(dialog).getByRole('button', { name: '验证优惠码' }))
    await within(dialog).findByText(/优惠预览：/)
    await user.click(
      within(dialog).getByRole('radio', { name: /^年付套餐标价/ }),
    )
    expect(within(dialog).getByLabelText('优惠码（可选）')).toHaveValue(
      'MANUAL',
    )
    expect(within(dialog).queryByText(/优惠预览：/)).toBeNull()
    await user.click(
      within(dialog).getByRole('button', { name: '确认创建订单' }),
    )
    expect(await within(dialog).findByText('订单已创建')).toBeInTheDocument()
    expect(mocks.create.mock.calls[0]?.[1]).toEqual({
      productId: '7',
      billingPeriod: 'year',
    })
  })

  it.each([
    ['NETWORK_ERROR', 0],
    ['UPSTREAM_ERROR', 502],
    ['UPSTREAM_TIMEOUT', 504],
  ])(
    'does not clear the coupon on %s validation failure',
    async (code, status) => {
      const mocks = installMocks()
      mocks.validate.mockRejectedValue(
        new ApiError({ status, code, message: 'temporary' }),
      )
      renderPlans()
      const { dialog, user } = await openCreateDialog()
      await user.click(within(dialog).getByRole('radio', { name: /月付/ }))
      await user.type(within(dialog).getByLabelText('优惠码（可选）'), 'KEEP')
      await user.click(
        within(dialog).getByRole('button', { name: '验证优惠码' }),
      )
      expect(
        await within(dialog).findByText('优惠码暂时无法验证，请手动重试。'),
      ).toBeInTheDocument()
      expect(within(dialog).getByLabelText('优惠码（可选）')).toHaveValue(
        'KEEP',
      )
      expect(within(dialog).queryByText('优惠码本次未被接受。')).toBeNull()
    },
  )

  it('keeps Plans available for PRODUCT_NOT_FOUND and ordinary Detail retry', async () => {
    const mocks = installMocks()
    mocks.getProduct.mockRejectedValueOnce(
      new ApiError({
        status: 404,
        code: 'PRODUCT_NOT_FOUND',
        message: 'missing',
      }),
    )
    renderPlans()
    let opened = await openCreateDialog(undefined, false)
    expect(
      await within(opened.dialog).findByText(
        '该套餐当前不存在或不可用于此账户。',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('No Price Plan')).toBeInTheDocument()
    await opened.user.click(
      within(opened.dialog).getByRole('button', { name: '关闭创建订单' }),
    )

    mocks.getProduct
      .mockRejectedValueOnce(
        new ApiError({ status: 502, code: 'UPSTREAM_ERROR', message: 'bad' }),
      )
      .mockRejectedValueOnce(
        new ApiError({ status: 502, code: 'UPSTREAM_ERROR', message: 'bad' }),
      )
      .mockResolvedValueOnce(product)
    opened = await openCreateDialog(opened.user, false)
    expect(
      await within(opened.dialog).findByText(
        '暂时无法读取套餐详情。',
        {},
        { timeout: 3_000 },
      ),
    ).toBeInTheDocument()
    await opened.user.click(
      within(opened.dialog).getByRole('button', { name: '重试' }),
    )
    expect(
      await within(opened.dialog).findByText('选择周期'),
    ).toBeInTheDocument()
  })

  it('validates Promotion only on explicit click and shows fixed preview without payable math', async () => {
    const mocks = installMocks()
    renderPlans()
    const { dialog, user } = await openCreateDialog()
    await user.click(within(dialog).getByRole('radio', { name: /月付/ }))
    const input = within(dialog).getByLabelText('优惠码（可选）')
    await user.type(input, '  Mixed-Code  ')
    expect(mocks.validate).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: '验证优惠码' }))
    expect(
      await within(dialog).findByText('优惠预览：固定金额优惠 ¥5.00 CNY'),
    ).toBeInTheDocument()
    expect(mocks.validate).toHaveBeenCalledWith(
      useAuthSessionStore.getState().accessToken,
      {
        code: 'Mixed-Code',
        productId: 7,
      },
    )
    expect(
      within(dialog).getByText(
        '优惠验证仅供预览；具体能否应用及最终订单金额以下单结果为准。',
      ),
    ).toBeInTheDocument()
    expect(within(dialog).queryByText(/最终应付：|实际支付：/)).toBeNull()
  })

  it('shows percentage preview above 100 without clamping or payable calculation', async () => {
    const mocks = installMocks()
    mocks.validate.mockResolvedValue({
      valid: true,
      discount: { type: 'percentage', percent: 125 },
    })
    renderPlans()
    const { dialog, user } = await openCreateDialog()
    await user.click(within(dialog).getByRole('radio', { name: /月付/ }))
    await user.type(within(dialog).getByLabelText('优惠码（可选）'), 'PERCENT')
    await user.click(within(dialog).getByRole('button', { name: '验证优惠码' }))
    expect(
      await within(dialog).findByText('优惠预览：125%'),
    ).toBeInTheDocument()
    expect(within(dialog).queryByText(/¥-|-¥|折后价/)).toBeNull()
  })

  it('clears a successful preview when Promotion code changes', async () => {
    installMocks()
    renderPlans()
    const { dialog, user } = await openCreateDialog()
    await user.click(within(dialog).getByRole('radio', { name: /月付/ }))
    const input = within(dialog).getByLabelText('优惠码（可选）')
    await user.type(input, 'OLD')
    await user.click(within(dialog).getByRole('button', { name: '验证优惠码' }))
    await within(dialog).findByText(/优惠预览：固定金额优惠/)
    await user.type(input, '-NEW')
    expect(within(dialog).queryByText(/优惠预览：/)).toBeNull()
  })

  it('does not attach a stale Promotion response after the code changes', async () => {
    const mocks = installMocks()
    const pending = deferred<{
      valid: true
      discount: { type: 'fixed'; amountMinor: number }
    }>()
    mocks.validate.mockReturnValue(pending.promise)
    renderPlans()
    const { dialog, user } = await openCreateDialog()
    await user.click(within(dialog).getByRole('radio', { name: /月付/ }))
    const input = within(dialog).getByLabelText('优惠码（可选）')
    await user.type(input, 'OLD')
    await user.click(within(dialog).getByRole('button', { name: '验证优惠码' }))
    await user.clear(input)
    await user.type(input, 'NEW')
    pending.resolve({
      valid: true,
      discount: { type: 'fixed', amountMinor: 500 },
    })
    await waitFor(() => expect(mocks.validate).toHaveBeenCalledOnce())
    expect(within(dialog).queryByText(/优惠预览：/)).toBeNull()
  })

  it('handles PROMOTION_INVALID and permits only explicit validation retry', async () => {
    const mocks = installMocks()
    mocks.validate
      .mockRejectedValueOnce(
        new ApiError({
          status: 422,
          code: 'PROMOTION_INVALID',
          message: 'bad',
        }),
      )
      .mockResolvedValueOnce({
        valid: true,
        discount: { type: 'percentage', percent: 25 },
      })
    renderPlans()
    const { dialog, user } = await openCreateDialog()
    await user.click(within(dialog).getByRole('radio', { name: /月付/ }))
    await user.type(within(dialog).getByLabelText('优惠码（可选）'), 'PROMO')
    await user.click(within(dialog).getByRole('button', { name: '验证优惠码' }))
    expect(
      await within(dialog).findByText('优惠码无效、不可用或不适用于当前套餐。'),
    ).toBeInTheDocument()
    expect(mocks.validate).toHaveBeenCalledOnce()
    expect(within(dialog).getByLabelText('优惠码（可选）')).toHaveValue('')
    await user.type(within(dialog).getByLabelText('优惠码（可选）'), 'NEW')
    await user.click(within(dialog).getByRole('button', { name: '验证优惠码' }))
    expect(await within(dialog).findByText('优惠预览：25%')).toBeInTheDocument()
    expect(mocks.validate).toHaveBeenCalledTimes(2)
  })

  it('creates only after explicit confirmation, refreshes Orders, and does not start payment', async () => {
    const mocks = installMocks()
    renderPlans()
    const { dialog, user } = await openCreateDialog()
    await user.click(within(dialog).getByRole('radio', { name: /月付/ }))
    await user.type(within(dialog).getByLabelText('优惠码（可选）'), 'DIRECT')
    expect(mocks.create).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: '验证优惠码' }))
    await within(dialog).findByText(/优惠预览：固定金额优惠/)
    await user.click(
      within(dialog).getByRole('button', { name: '确认创建订单' }),
    )
    expect(await within(dialog).findByText('订单已创建')).toBeInTheDocument()
    expect(
      within(dialog).getByText('订单编号：order-created'),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('link', { name: '查看订单' }),
    ).toHaveAttribute('href', '/orders')
    expect(mocks.create).toHaveBeenCalledWith(
      useAuthSessionStore.getState().accessToken,
      {
        productId: '7',
        billingPeriod: 'month',
        promotionCode: 'DIRECT',
      },
    )
    expect(mocks.getOrders).toHaveBeenCalledOnce()
    expect(screen.queryByText(/支付方式|二维码|继续支付/)).toBeNull()
  })

  it('prevents same-tick duplicate Create submissions', async () => {
    const mocks = installMocks()
    const pending = deferred<{ id: string }>()
    mocks.create.mockReturnValue(pending.promise)
    renderPlans()
    const { dialog, user } = await openCreateDialog()
    await user.click(within(dialog).getByRole('radio', { name: /月付/ }))
    const confirm = within(dialog).getByRole('button', {
      name: '确认创建订单',
    })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce())
    pending.resolve({ id: 'order-created' })
    expect(await within(dialog).findByText('订单已创建')).toBeInTheDocument()
  })

  it('treats PROMOTION_INVALID during Create as final authority and clears preview', async () => {
    const mocks = installMocks()
    mocks.create.mockRejectedValue(
      new ApiError({ status: 422, code: 'PROMOTION_INVALID', message: 'bad' }),
    )
    renderPlans()
    const { dialog, user } = await openCreateDialog()
    await user.click(within(dialog).getByRole('radio', { name: /月付/ }))
    await user.type(within(dialog).getByLabelText('优惠码（可选）'), 'PROMO')
    await user.click(within(dialog).getByRole('button', { name: '验证优惠码' }))
    await within(dialog).findByText(/优惠预览：固定金额优惠/)
    await user.click(
      within(dialog).getByRole('button', { name: '确认创建订单' }),
    )
    expect(
      await within(dialog).findByText('优惠码本次未被接受。'),
    ).toBeInTheDocument()
    expect(within(dialog).queryByText(/优惠预览：/)).toBeNull()
    expect(within(dialog).getByLabelText('优惠码（可选）')).toHaveValue('')
    expect(mocks.create).toHaveBeenCalledOnce()
    expect(mocks.getOrders).not.toHaveBeenCalled()
    await user.click(
      within(dialog).getByRole('button', {
        name: '不使用优惠码，确认创建订单',
      }),
    )
    expect(mocks.create).toHaveBeenCalledTimes(2)
    expect(mocks.create.mock.calls[1]?.[1]).toEqual({
      productId: '7',
      billingPeriod: 'month',
    })
  })

  it('shows ORDER_CREATE_FAILED as definitive without automatic retry', async () => {
    const mocks = installMocks()
    mocks.create.mockRejectedValue(
      new ApiError({
        status: 502,
        code: 'ORDER_CREATE_FAILED',
        message: 'bad',
      }),
    )
    renderPlans()
    const { dialog, user } = await openCreateDialog()
    await selectMonthAndConfirm(user)
    expect(
      await within(dialog).findByText('服务未能创建订单，请检查选择后重试。'),
    ).toBeInTheDocument()
    expect(mocks.create).toHaveBeenCalledOnce()
    expect(mocks.getOrders).not.toHaveBeenCalled()
  })

  it.each([
    ['NETWORK_ERROR', 0],
    ['UPSTREAM_TIMEOUT', 504],
    ['UPSTREAM_ERROR', 502],
    ['MALFORMED_RESPONSE', 200],
  ])(
    'treats %s Create as unknown, performs GET recovery, and guards resubmit',
    async (code, status) => {
      const mocks = installMocks()
      mocks.create.mockRejectedValue(
        new ApiError({ status, code, message: 'ambiguous' }),
      )
      renderPlans()
      const { dialog, user } = await openCreateDialog()
      await selectMonthAndConfirm(user)
      expect(
        await within(dialog).findByText('订单提交结果暂时无法确认。'),
      ).toBeInTheDocument()
      expect(
        within(dialog).getByText(
          '系统已重新读取订单列表。请先检查是否出现新订单，避免重复下单。',
        ),
      ).toBeInTheDocument()
      expect(within(dialog).queryByText(/创建失败/)).toBeNull()
      expect(mocks.create).toHaveBeenCalledOnce()
      expect(mocks.getOrders).toHaveBeenCalledOnce()
      expect(
        within(dialog).getByRole('button', { name: '确认创建订单' }),
      ).toBeDisabled()
      expect(
        within(dialog).getByRole('link', { name: '查看订单' }),
      ).toHaveAttribute('href', '/orders')
    },
  )

  it('keeps unknown warning through edits and requires acknowledgement for a new POST', async () => {
    const mocks = installMocks()
    mocks.create
      .mockRejectedValueOnce(
        new ApiError({
          status: 504,
          code: 'UPSTREAM_TIMEOUT',
          message: 'timeout',
        }),
      )
      .mockResolvedValueOnce({ id: 'order-second-attempt' })
    renderPlans()
    const { dialog, user } = await openCreateDialog()
    await selectMonthAndConfirm(user)
    await within(dialog).findByText('订单提交结果暂时无法确认。')
    await user.type(within(dialog).getByLabelText('优惠码（可选）'), 'CHANGED')
    expect(
      within(dialog).getByText('订单提交结果暂时无法确认。'),
    ).toBeInTheDocument()
    const confirm = within(dialog).getByRole('button', {
      name: '确认创建订单',
    })
    expect(confirm).toBeDisabled()
    await user.click(
      within(dialog).getByRole('checkbox', {
        name: '我已检查订单列表，仍要重新提交',
      }),
    )
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    expect(await within(dialog).findByText('订单已创建')).toBeInTheDocument()
    expect(mocks.create).toHaveBeenCalledTimes(2)
  })

  it('blocks Create when the sticker price cannot be safely formatted', async () => {
    const mocks = installMocks()
    mocks.getConfig.mockResolvedValue({ currency: 'ZZZ', currencySymbol: '?' })
    renderPlans()
    const { dialog, user } = await openCreateDialog()
    await user.click(within(dialog).getByRole('radio', { name: /月付/ }))
    expect(
      within(dialog).getAllByText(/套餐标价：无法安全格式化/),
    ).toHaveLength(7)
    expect(
      within(dialog).getByRole('button', { name: '确认创建订单' }),
    ).toBeDisabled()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it.each(['product', 'promotion', 'create', 'recovery'] as const)(
    'exits protected UI when %s boundary returns AUTH failure',
    async (source) => {
      const mocks = installMocks()
      const authError = new ApiError({
        status: 401,
        code: source === 'promotion' ? 'AUTH_REQUIRED' : 'AUTH_FAILED',
        message: 'auth',
      })
      if (source === 'product') mocks.getProduct.mockRejectedValue(authError)
      if (source === 'promotion') mocks.validate.mockRejectedValue(authError)
      if (source === 'create') mocks.create.mockRejectedValue(authError)
      if (source === 'recovery') {
        mocks.create.mockRejectedValue(
          new ApiError({
            status: 504,
            code: 'UPSTREAM_TIMEOUT',
            message: 'timeout',
          }),
        )
        mocks.getOrders.mockRejectedValue(authError)
      }
      const { router, invalidateSession } = renderPlans()
      const failAuth = async () => {
        invalidateSession()
        throw authError
      }
      if (source === 'product') mocks.getProduct.mockImplementation(failAuth)
      if (source === 'promotion') mocks.validate.mockImplementation(failAuth)
      if (source === 'create') mocks.create.mockImplementation(failAuth)
      if (source === 'recovery') mocks.getOrders.mockImplementation(failAuth)
      if (source === 'product') {
        const user = userEvent.setup()
        await user.click(
          await screen.findByRole('button', { name: '创建订单' }),
        )
      } else {
        const { dialog, user } = await openCreateDialog()
        if (source === 'promotion') {
          await user.click(within(dialog).getByRole('radio', { name: /月付/ }))
          await user.type(
            within(dialog).getByLabelText('优惠码（可选）'),
            'PROMO',
          )
          await user.click(
            within(dialog).getByRole('button', { name: '验证优惠码' }),
          )
        } else if (source === 'create' || source === 'recovery') {
          await selectMonthAndConfirm(user)
        }
      }
      expect(
        await screen.findByRole('heading', { name: '登录 Aureole' }),
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
      expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
    },
  )
})
