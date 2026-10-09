import { describe, expect, it, vi } from 'vitest'
import { catalogApi } from '@/features/catalog/catalog-api'
import { apiClient } from '@/lib/api/client'

const product = {
  id: '7',
  name: 'Pro Plan',
  dataAllowanceGb: 100,
  speedLimitMbps: null,
  available: false,
  prices: [{ billingPeriod: 'month', amountMinor: 990 }],
}

describe('Optional Product features contract', () => {
  it.each([
    undefined,
    [],
    [
      { feature: '<script>alert(1)</script>', support: true },
      { feature: 'Streaming', support: false },
      { feature: 'Streaming', support: false },
    ],
  ])(
    'uses the same list/detail parser without changing business fields',
    async (features) => {
      const expected = {
        ...product,
        ...(features === undefined ? {} : { features }),
      }
      const request = vi
        .spyOn(apiClient, 'authenticatedRequest')
        .mockResolvedValueOnce({
          products: [
            {
              ...expected,
              content: '[{"feature":"raw","support":true}]',
              descriptionHtml: '<b>ignored</b>',
            },
          ],
        })
        .mockResolvedValueOnce({
          product: { ...expected, content: 'legacy HTML' },
        })
      await expect(catalogApi.getProducts('opaque-token')).resolves.toEqual([
        expected,
      ])
      await expect(catalogApi.getProduct('opaque-token', '7')).resolves.toEqual(
        expected,
      )
      expect(request).toHaveBeenNthCalledWith(1, '/api/v1/products', {
        method: 'GET',
        accessToken: 'opaque-token',
      })
      expect(request).toHaveBeenNthCalledWith(2, '/api/v1/products/7', {
        method: 'GET',
        accessToken: 'opaque-token',
      })
    },
  )

  it.each([
    null,
    '{}',
    [{ feature: 123, support: true }],
    [{ feature: {}, support: true }],
    [{ feature: 'Streaming', support: 'true' }],
    [{ feature: 'Streaming', support: 'false' }],
    [{ feature: 'Streaming', support: 1 }],
    [{ feature: 'Streaming', support: null }],
    [{ feature: 'Streaming' }],
    [{ support: true }],
  ])(
    'rejects malformed features in both endpoints without coercion',
    async (features) => {
      vi.spyOn(apiClient, 'authenticatedRequest')
        .mockResolvedValueOnce({ products: [{ ...product, features }] })
        .mockResolvedValueOnce({ product: { ...product, features } })
      await expect(
        catalogApi.getProducts('opaque-token'),
      ).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' })
      await expect(
        catalogApi.getProduct('opaque-token', '7'),
      ).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' })
    },
  )
})
