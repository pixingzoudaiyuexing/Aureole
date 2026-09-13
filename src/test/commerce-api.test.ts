import { describe, expect, it, vi } from 'vitest'
import { catalogApi } from '@/features/catalog/catalog-api'
import { ordersApi } from '@/features/orders/orders-api'
import { promotionsApi } from '@/features/orders/promotions-api'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const token = 'opaque-token'
const product = {
  id: '7',
  name: 'Pro Plan',
  dataAllowanceGb: 100,
  speedLimitMbps: null,
  available: false,
  prices: [
    { billingPeriod: 'month' as const, amountMinor: 990 },
    { billingPeriod: 'year' as const, amountMinor: 9990 },
  ],
}

describe('Product Detail API', () => {
  it('uses the exact endpoint and the canonical Product parser', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({
        product: {
          ...product,
          content: 'private',
          renew: true,
          capacity_limit: 10,
        },
        future: true,
      })
    await expect(catalogApi.getProduct(token, '7')).resolves.toEqual(product)
    expect(request).toHaveBeenCalledWith('/api/v1/products/7', {
      method: 'GET',
      accessToken: token,
    })
  })

  it.each(['0', '-1', '1.5', '1e2', '2147483648', 'not-a-product'])(
    'rejects invalid Product ID %s before requesting',
    async (id) => {
      const request = vi.spyOn(apiClient, 'authenticatedRequest')
      await expect(catalogApi.getProduct(token, id)).rejects.toBeDefined()
      expect(request).not.toHaveBeenCalled()
    },
  )

  it.each([
    { ...product, id: '0' },
    { ...product, name: '' },
    { ...product, dataAllowanceGb: -1 },
    { ...product, speedLimitMbps: -1 },
    { ...product, available: 'yes' },
    {
      ...product,
      prices: [{ billingPeriod: 'weekly', amountMinor: 100 }],
    },
  ])('rejects malformed Product Detail fields', async (malformedProduct) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue({
      product: malformedProduct,
    })
    await expect(catalogApi.getProduct(token, '7')).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })
})

describe('Promotion Preview API', () => {
  it('sends only trimmed code and numeric productId', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({
        valid: true,
        discount: { type: 'fixed', amountMinor: 500, private: true },
        couponCode: 'private',
      })
    await expect(
      promotionsApi.validate(token, { code: '  Promo-X  ', productId: 7 }),
    ).resolves.toEqual({
      valid: true,
      discount: { type: 'fixed', amountMinor: 500 },
    })
    expect(request).toHaveBeenCalledWith('/api/v1/promotions/validate', {
      method: 'POST',
      body: { code: 'Promo-X', productId: 7 },
      accessToken: token,
    })
  })

  it.each([0, 25, 101, 2_147_483_647])(
    'accepts Contract percentage %s without frontend clamping',
    async (percent) => {
      vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue({
        valid: true,
        discount: { type: 'percentage', percent },
      })
      await expect(
        promotionsApi.validate(token, { code: 'PERCENT', productId: 7 }),
      ).resolves.toEqual({
        valid: true,
        discount: { type: 'percentage', percent },
      })
    },
  )

  it.each([
    { valid: false, discount: { type: 'fixed', amountMinor: 1 } },
    { valid: true, discount: { type: 'fixed', amountMinor: -1 } },
    { valid: true, discount: { type: 'fixed', amountMinor: 1.5 } },
    {
      valid: true,
      discount: { type: 'percentage', percent: 2_147_483_648 },
    },
    { valid: true, discount: { type: 'other', amountMinor: 1 } },
  ])('rejects malformed Promotion response', async (payload) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(payload)
    await expect(
      promotionsApi.validate(token, { code: 'PROMO', productId: 7 }),
    ).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })

  it.each([
    { code: '', productId: 7 },
    { code: 'x'.repeat(256), productId: 7 },
    { code: 'PROMO', productId: 0 },
    { code: 'PROMO', productId: 1.5 },
    { code: 'PROMO', productId: 2_147_483_648 },
    { code: 'PROMO', productId: 7, couponCode: 'alias' },
    { code: 'PROMO', productId: 7, coupon_code: 'alias' },
  ])(
    'rejects invalid or aliased Promotion input before requesting',
    async (input) => {
      const request = vi.spyOn(apiClient, 'authenticatedRequest')
      await expect(promotionsApi.validate(token, input)).rejects.toBeDefined()
      expect(request).not.toHaveBeenCalled()
    },
  )
})

describe('Order mutation API', () => {
  it('creates with only Product ID and Billing Period when promotion is omitted', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({ id: 'order-001', future: true })
    await expect(
      ordersApi.create(token, { productId: '7', billingPeriod: 'month' }),
    ).resolves.toEqual({ id: 'order-001' })
    expect(request).toHaveBeenCalledWith('/api/v1/orders', {
      method: 'POST',
      body: { productId: '7', billingPeriod: 'month' },
      accessToken: token,
    })
  })

  it('creates with a trimmed opaque promotionCode and no money/payment fields', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({ id: 'order-002' })
    await ordersApi.create(token, {
      productId: '7',
      billingPeriod: 'oneTime',
      promotionCode: '  Mixed-Code  ',
    })
    expect(request).toHaveBeenCalledWith('/api/v1/orders', {
      method: 'POST',
      body: {
        productId: '7',
        billingPeriod: 'oneTime',
        promotionCode: 'Mixed-Code',
      },
      accessToken: token,
    })
  })

  it.each([
    { productId: '0', billingPeriod: 'month' },
    { productId: '7', billingPeriod: 'weekly' },
    { productId: '7', billingPeriod: 'month', promotionCode: '' },
    {
      productId: '7',
      billingPeriod: 'month',
      promotionCode: 'x'.repeat(256),
    },
    { productId: '7', billingPeriod: 'month', amountMinor: 990 },
    { productId: '7', billingPeriod: 'month', amount: 9.9 },
    { productId: '7', billingPeriod: 'month', currency: 'CNY' },
    { productId: '7', billingPeriod: 'month', payment: 'balance' },
    { productId: '7', billingPeriod: 'month', couponCode: 'alias' },
    { productId: '7', billingPeriod: 'month', coupon_code: 'alias' },
  ])(
    'rejects invalid or expanded Create input before requesting',
    async (input) => {
      const request = vi.spyOn(apiClient, 'authenticatedRequest')
      await expect(
        ordersApi.create(token, input as never),
      ).rejects.toBeDefined()
      expect(request).not.toHaveBeenCalled()
    },
  )

  it.each([{ id: '' }, { id: 'x'.repeat(37) }, { orderId: 'order-1' }])(
    'rejects malformed Create response',
    async (payload) => {
      vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(payload)
      await expect(
        ordersApi.create(token, { productId: '7', billingPeriod: 'month' }),
      ).rejects.toMatchObject({
        code: 'MALFORMED_RESPONSE',
      } satisfies Partial<ApiError>)
    },
  )

  it('cancels through the exact validated path with no request body', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({ cancelled: true, future: true })
    await expect(ordersApi.cancel(token, 'order_001-A')).resolves.toEqual({
      cancelled: true,
    })
    expect(request).toHaveBeenCalledWith('/api/v1/orders/order_001-A/cancel', {
      method: 'POST',
      accessToken: token,
    })
  })

  it.each([{ cancelled: false }, {}, { cancelled: 'true' }])(
    'rejects malformed Cancel response',
    async (payload) => {
      vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(payload)
      await expect(ordersApi.cancel(token, 'order-1')).rejects.toMatchObject({
        code: 'MALFORMED_RESPONSE',
      } satisfies Partial<ApiError>)
    },
  )

  it.each(['', 'x'.repeat(37), 'with/slash'])(
    'rejects invalid Cancel ID %s before requesting',
    async (id) => {
      const request = vi.spyOn(apiClient, 'authenticatedRequest')
      await expect(ordersApi.cancel(token, id)).rejects.toBeDefined()
      expect(request).not.toHaveBeenCalled()
    },
  )
})
