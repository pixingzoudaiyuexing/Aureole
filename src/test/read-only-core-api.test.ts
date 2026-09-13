import { describe, expect, it, vi } from 'vitest'
import { catalogApi } from '@/features/catalog/catalog-api'
import { catalogQueryKeys } from '@/features/catalog/catalog-queries'
import { formatMinorMoney } from '@/features/catalog/money-format'
import { resourcesApi } from '@/features/resources/resources-api'
import { resourcesQueryKeys } from '@/features/resources/resources-queries'
import { trafficApi } from '@/features/traffic/traffic-api'
import { trafficQueryKeys } from '@/features/traffic/traffic-queries'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const accessToken = 'opaque-session-token'

const validProduct = {
  id: '7',
  name: 'Pro Plan',
  dataAllowanceGb: 100,
  speedLimitMbps: null,
  available: true,
  prices: [
    { billingPeriod: 'month', amountMinor: 990 },
    { billingPeriod: 'oneTime', amountMinor: 0 },
  ],
}

const validTrafficEntry = {
  uploadedBytes: 123_456,
  downloadedBytes: 654_321,
  recordedAt: '2026-09-11T00:00:00.000Z',
  rateMultiplier: 1.5,
}

describe('Read-only query ownership', () => {
  it('uses stable credential-free keys for every M4-002 domain', () => {
    expect({
      products: catalogQueryKeys.products,
      resources: resourcesQueryKeys.list,
      traffic: trafficQueryKeys.logs,
    }).toEqual({
      products: ['products'],
      resources: ['resources'],
      traffic: ['traffic', 'logs'],
    })
  })
})

describe('Products API', () => {
  it('preserves product and price order while stripping additive fields', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({
        products: [
          {
            ...validProduct,
            futureProductField: true,
            prices: [
              {
                billingPeriod: 'quarter',
                amountMinor: 2_500,
                futurePriceField: true,
              },
              validProduct.prices[0],
            ],
          },
          {
            ...validProduct,
            id: '8',
            name: 'Starter',
            speedLimitMbps: 0,
            available: false,
            prices: [],
          },
        ],
        futureTopLevelField: true,
      })

    await expect(catalogApi.getProducts(accessToken)).resolves.toEqual([
      {
        ...validProduct,
        prices: [
          { billingPeriod: 'quarter', amountMinor: 2_500 },
          validProduct.prices[0],
        ],
      },
      {
        ...validProduct,
        id: '8',
        name: 'Starter',
        speedLimitMbps: 0,
        available: false,
        prices: [],
      },
    ])
    expect(request).toHaveBeenCalledWith('/api/v1/products', {
      method: 'GET',
      accessToken,
    })
  })

  it('accepts an empty product catalog', async () => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue({
      products: [],
    })
    await expect(catalogApi.getProducts(accessToken)).resolves.toEqual([])
  })

  it.each([
    { ...validProduct, id: '0' },
    { ...validProduct, id: '2147483648' },
    { ...validProduct, name: '' },
    { ...validProduct, dataAllowanceGb: -1 },
    { ...validProduct, dataAllowanceGb: 1.5 },
    { ...validProduct, speedLimitMbps: -1 },
    { ...validProduct, speedLimitMbps: 1.5 },
    { ...validProduct, available: 'yes' },
    {
      ...validProduct,
      prices: [{ billingPeriod: 'weekly', amountMinor: 990 }],
    },
    {
      ...validProduct,
      prices: [{ billingPeriod: 'month', amountMinor: -1 }],
    },
    {
      ...validProduct,
      prices: [{ billingPeriod: 'month', amountMinor: 1.5 }],
    },
    {
      ...validProduct,
      prices: [
        {
          billingPeriod: 'month',
          amountMinor: Number.MAX_SAFE_INTEGER + 1,
        },
      ],
    },
  ])('rejects malformed known product fields', async (product) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue({
      products: [product],
    })

    await expect(catalogApi.getProducts(accessToken)).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })
})

describe('Minor-unit money formatting', () => {
  it.each([
    ['CNY', '¥', 990, '¥9.90 CNY'],
    ['JPY', '¥', 990, '¥990 JPY'],
    ['KWD', 'د.ك', 990, 'د.ك0.990 KWD'],
    ['CNY', 'CN¥', 0, 'CN¥0.00 CNY'],
    ['CNY', '¥', Number.MAX_SAFE_INTEGER, '¥90,071,992,547,409.91 CNY'],
  ] as const)(
    'formats %s minor units without a fixed exponent',
    (currency, currencySymbol, amountMinor, expected) => {
      expect(formatMinorMoney(amountMinor, { currency, currencySymbol })).toBe(
        expected,
      )
    },
  )

  it.each([
    ['ZZZ', '$', 990],
    ['not-a-code', '$', 990],
    ['CNY', '¥', Number.MAX_SAFE_INTEGER + 1],
  ] as const)(
    'fails closed for unsupported currency or unsafe amount',
    (currency, currencySymbol, amountMinor) => {
      expect(
        formatMinorMoney(amountMinor, { currency, currencySymbol }),
      ).toBeNull()
    },
  )
})

describe('Resources API', () => {
  it('preserves order and strips every non-Public resource field', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({
        resources: [
          {
            id: '3',
            name: 'Hong Kong 01',
            category: 'vmess',
            status: 'online',
            host: 'private.example',
            port: 443,
            serverKey: 'must-not-survive',
          },
          {
            id: '4',
            name: 'Tokyo 02',
            category: 'future-category',
            status: 'offline',
          },
        ],
        futureTopLevelField: true,
      })

    await expect(resourcesApi.getResources(accessToken)).resolves.toEqual([
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
    expect(request).toHaveBeenCalledWith('/api/v1/resources', {
      method: 'GET',
      accessToken,
    })
  })

  it('accepts an empty resource list', async () => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue({
      resources: [],
    })
    await expect(resourcesApi.getResources(accessToken)).resolves.toEqual([])
  })

  it.each([
    { id: '0', name: 'Node', category: 'type', status: 'online' },
    { id: '1', name: '', category: 'type', status: 'online' },
    { id: '1', name: 'Node', category: '', status: 'online' },
    { id: '1', name: 'Node', category: 'type', status: 'unknown' },
  ])('rejects malformed known resource fields', async (resource) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue({
      resources: [resource],
    })

    await expect(resourcesApi.getResources(accessToken)).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })
})

describe('Traffic API', () => {
  it('preserves entry order and strips additive fields', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({
        entries: [
          { ...validTrafficEntry, futureField: true },
          {
            ...validTrafficEntry,
            recordedAt: '2026-09-10T00:00:00.000Z',
            uploadedBytes: 0,
            downloadedBytes: 0,
            rateMultiplier: 0,
          },
        ],
        futureTopLevelField: true,
      })

    await expect(trafficApi.getLogs(accessToken)).resolves.toEqual([
      validTrafficEntry,
      {
        ...validTrafficEntry,
        recordedAt: '2026-09-10T00:00:00.000Z',
        uploadedBytes: 0,
        downloadedBytes: 0,
        rateMultiplier: 0,
      },
    ])
    expect(request).toHaveBeenCalledWith('/api/v1/traffic/logs', {
      method: 'GET',
      accessToken,
    })
  })

  it('accepts empty traffic history', async () => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue({
      entries: [],
    })
    await expect(trafficApi.getLogs(accessToken)).resolves.toEqual([])
  })

  it.each([
    { ...validTrafficEntry, uploadedBytes: -1 },
    { ...validTrafficEntry, uploadedBytes: 1.5 },
    { ...validTrafficEntry, downloadedBytes: Number.MAX_SAFE_INTEGER + 1 },
    { ...validTrafficEntry, recordedAt: 'not-a-timestamp' },
    { ...validTrafficEntry, rateMultiplier: -1 },
    { ...validTrafficEntry, rateMultiplier: Number.POSITIVE_INFINITY },
    { ...validTrafficEntry, rateMultiplier: Number.NaN },
  ])('rejects malformed known traffic fields', async (entry) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue({
      entries: [entry],
    })

    await expect(trafficApi.getLogs(accessToken)).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })
})
