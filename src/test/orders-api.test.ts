import { describe, expect, it, vi } from 'vitest'
import { ordersApi } from '@/features/orders/orders-api'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const token = 'opaque-token'
const order = {
  id: 'order_001-A',
  status: 'pending' as const,
  amountMinor: 1099,
  createdAt: '2026-09-13T00:00:00.000Z',
  updatedAt: '2026-09-13T01:00:00.000Z',
  expiresAt: null,
}

describe('Orders API', () => {
  it('requests the exact list path, preserves order, and strips private fields', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue([
        {
          ...order,
          productId: 'private-product',
          planName: 'Private Plan',
          paymentId: 'payment-1',
          callbackUrl: 'https://private.example/callback',
          userUuid: 'private-user',
          coupon: 'PRIVATE',
        },
        { ...order, id: 'order_002-B', status: 'completed' },
      ])

    await expect(ordersApi.getList(token)).resolves.toEqual([
      order,
      { ...order, id: 'order_002-B', status: 'completed' },
    ])
    expect(request).toHaveBeenCalledWith('/api/v1/orders', {
      method: 'GET',
      accessToken: token,
    })
  })

  it('accepts empty list', async () => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue([])
    await expect(ordersApi.getList(token)).resolves.toEqual([])
  })

  it('accepts all statuses, zero and largest safe amount, and nullable times', async () => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue([
      { ...order, status: 'pending', amountMinor: 0 },
      { ...order, id: '2', status: 'processing' },
      { ...order, id: '3', status: 'cancelled' },
      { ...order, id: '4', status: 'completed' },
      {
        ...order,
        id: '5',
        status: 'adjusted',
        amountMinor: Number.MAX_SAFE_INTEGER,
        updatedAt: null,
        expiresAt: null,
      },
    ])
    const result = await ordersApi.getList(token)
    expect(result.map(({ status }) => status)).toEqual([
      'pending',
      'processing',
      'cancelled',
      'completed',
      'adjusted',
    ])
    expect(result[0]?.amountMinor).toBe(0)
    expect(result[4]).toMatchObject({
      amountMinor: Number.MAX_SAFE_INTEGER,
      updatedAt: null,
      expiresAt: null,
    })
  })

  it('requests an exact validated detail path and strips additive fields', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({ ...order, future: true, productName: 'Private' })
    await expect(ordersApi.getDetail(token, 'order_001-A')).resolves.toEqual(
      order,
    )
    expect(request).toHaveBeenCalledWith('/api/v1/orders/order_001-A', {
      method: 'GET',
      accessToken: token,
    })
  })

  it.each([
    '',
    'x'.repeat(37),
    'with.dot',
    'with/slash',
    'with%escape',
    '订单-1',
  ])('rejects invalid detail id %s before requesting', async (id) => {
    const request = vi.spyOn(apiClient, 'authenticatedRequest')
    await expect(ordersApi.getDetail(token, id)).rejects.toBeDefined()
    expect(request).not.toHaveBeenCalled()
  })

  it.each([
    { ...order, id: '' },
    { ...order, status: 'paid' },
    { ...order, amountMinor: -1 },
    { ...order, amountMinor: 1.5 },
    { ...order, amountMinor: Number.MAX_SAFE_INTEGER + 1 },
    { ...order, createdAt: 'bad' },
    { ...order, updatedAt: 'bad' },
    { ...order, expiresAt: 'bad' },
  ])('rejects malformed known fields', async (payload) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue([payload])
    await expect(ordersApi.getList(token)).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })
})
