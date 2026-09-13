import { describe, expect, it, vi } from 'vitest'
import { ordersApi } from '@/features/orders/orders-api'
import { paymentApi } from '@/features/payments/payment-api'
import { checkoutMutationOptions } from '@/features/payments/payment-queries'
import { paymentQueryKeys } from '@/features/payments/payment-queries'
import { ordersQueryKeys } from '@/features/orders/orders-queries'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const token = 'opaque-token'

describe('Payment API', () => {
  it('configures Checkout as a non-retrying mutation', () => {
    expect(checkoutMutationOptions(token, 'order-1').retry).toBe(false)
    expect(paymentQueryKeys.methods).toEqual(['billing', 'methods'])
    expect(ordersQueryKeys.status('order-1')).toEqual([
      'orders',
      'status',
      'order-1',
    ])
    expect(
      JSON.stringify([
        paymentQueryKeys.methods,
        ordersQueryKeys.status('order-1'),
      ]),
    ).not.toContain(token)
  })
  it('loads methods from the exact endpoint and strips additive fields', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue([
        {
          id: '3',
          name: '支付宝',
          icon: 'https://cdn.example/alipay.png',
          fee: { fixedMinor: 25, percent: 0.5, private: true },
          plugin: 'private',
          merchant: 'private',
        },
      ])

    await expect(paymentApi.getMethods(token)).resolves.toEqual([
      {
        id: '3',
        name: '支付宝',
        icon: 'https://cdn.example/alipay.png',
        fee: { fixedMinor: 25, percent: 0.5 },
      },
    ])
    expect(request).toHaveBeenCalledWith('/api/v1/billing/methods', {
      method: 'GET',
      accessToken: token,
    })
  })

  it('accepts a null icon and empty method list', async () => {
    vi.spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValueOnce([
        {
          id: '1',
          name: '银行卡',
          icon: null,
          fee: { fixedMinor: 0, percent: 0 },
        },
      ])
      .mockResolvedValueOnce([])
    await expect(paymentApi.getMethods(token)).resolves.toMatchObject([
      { id: '1', icon: null },
    ])
    await expect(paymentApi.getMethods(token)).resolves.toEqual([])
  })

  it.each([
    { id: '0', name: 'A', icon: null, fee: { fixedMinor: 0, percent: 0 } },
    { id: '01', name: 'A', icon: null, fee: { fixedMinor: 0, percent: 0 } },
    {
      id: '2147483648',
      name: 'A',
      icon: null,
      fee: { fixedMinor: 0, percent: 0 },
    },
    { id: '1', name: '', icon: null, fee: { fixedMinor: 0, percent: 0 } },
    {
      id: '1',
      name: 'A',
      icon: 'not-a-url',
      fee: { fixedMinor: 0, percent: 0 },
    },
    {
      id: '1',
      name: 'A',
      icon: 'http://cdn.example/icon.png',
      fee: { fixedMinor: 0, percent: 0 },
    },
    { id: '1', name: 'A', icon: null, fee: { fixedMinor: -1, percent: 0 } },
    { id: '1', name: 'A', icon: null, fee: { fixedMinor: 0, percent: 101 } },
  ])('rejects malformed method DTO %#', async (method) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue([method])
    await expect(paymentApi.getMethods(token)).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })

  it.each([
    [{ type: 'finished', additive: true }, { type: 'finished' }],
    [
      { type: 'qrcode', data: 'opaque://pay?value=unchanged', additive: true },
      { type: 'qrcode', data: 'opaque://pay?value=unchanged' },
    ],
    [
      {
        type: 'redirect',
        target: 'https://pay.example/path?a=1%202',
        additive: true,
      },
      { type: 'redirect', target: 'https://pay.example/path?a=1%202' },
    ],
  ] as const)(
    'accepts and strips checkout action %#',
    async (payload, expected) => {
      const request = vi
        .spyOn(apiClient, 'authenticatedRequest')
        .mockResolvedValue(payload)
      await expect(
        paymentApi.checkout(token, 'order_001-A', { paymentMethodId: '3' }),
      ).resolves.toEqual(expected)
      expect(request).toHaveBeenCalledWith(
        '/api/v1/orders/order_001-A/checkout',
        {
          method: 'POST',
          body: { paymentMethodId: '3' },
          accessToken: token,
        },
      )
    },
  )

  it.each([
    { type: 'form', data: '<form>' },
    { type: 'qrcode', data: '' },
    { type: 'qrcode', data: 'bad\ncontent' },
    { type: 'redirect', target: 'http://pay.example/path' },
    { type: 'redirect', target: 'javascript:alert(1)' },
    { type: 'redirect' },
  ])('rejects unknown or malformed checkout action %#', async (payload) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(payload)
    await expect(
      paymentApi.checkout(token, 'order-1', { paymentMethodId: '3' }),
    ).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })

  it.each([
    { paymentMethodId: '0' },
    { paymentMethodId: '01' },
    { paymentMethodId: '2147483648' },
    { paymentMethodId: '3', amountMinor: 100 },
    { paymentMethodId: '3', returnUrl: 'https://example.test' },
    { paymentMethodId: '3', provider: 'private' },
  ])('rejects invalid or expanded checkout request %#', async (input) => {
    const request = vi.spyOn(apiClient, 'authenticatedRequest')
    await expect(
      paymentApi.checkout(token, 'order-1', input as never),
    ).rejects.toBeDefined()
    expect(request).not.toHaveBeenCalled()
  })
})

describe('Order Status API', () => {
  it('uses the exact endpoint, canonical status, and strips additions', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({
        id: 'order_001-A',
        status: 'processing',
        private: true,
      })
    await expect(ordersApi.getStatus(token, 'order_001-A')).resolves.toEqual({
      id: 'order_001-A',
      status: 'processing',
    })
    expect(request).toHaveBeenCalledWith('/api/v1/orders/order_001-A/status', {
      method: 'GET',
      accessToken: token,
    })
  })

  it.each([
    { id: 'order-1', status: 'paid' },
    { id: 'other-order', status: 'pending' },
    { id: '', status: 'pending' },
    { orderId: 'order-1', status: 'pending' },
  ])('rejects malformed status %#', async (payload) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(payload)
    await expect(ordersApi.getStatus(token, 'order-1')).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })

  it('rejects an invalid order ID before requesting status', async () => {
    const request = vi.spyOn(apiClient, 'authenticatedRequest')
    await expect(ordersApi.getStatus(token, 'with/slash')).rejects.toBeDefined()
    expect(request).not.toHaveBeenCalled()
  })
})
