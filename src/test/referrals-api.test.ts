import { describe, expect, it, vi } from 'vitest'
import {
  commissionPageRequestSchema,
  referralsApi,
} from '@/features/referrals/referrals-api'
import {
  referralCodeCreateMutationOptions,
  referralsMutationKeys,
} from '@/features/referrals/referrals-queries'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const token = 'opaque-referral-token'
const timestamp = '2026-09-14T01:02:03.000Z'

function validOverview() {
  return {
    codes: [{ code: 'FIRST123', createdAt: timestamp }],
    stats: {
      registeredUsers: 5,
      earnedCommissionMinor: 12_345,
      pendingCommissionMinor: 678,
      commissionRatePercent: 10,
      availableCommissionMinor: 9_000,
    },
  }
}

function validCommissionPage() {
  return {
    items: [
      {
        orderAmountMinor: 10_000,
        commissionAmountMinor: 1_000,
        createdAt: timestamp,
      },
    ],
    page: 1,
    pageSize: 20,
    total: 1,
  }
}

describe('Referrals API contract', () => {
  it('creates through the exact bodyless Public POST and strips additions', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({ created: true, code: 'PRIVATE', id: 7 })

    await expect(referralsApi.createCode(token)).resolves.toEqual({
      created: true,
    })
    expect(request).toHaveBeenCalledWith('/api/v1/referrals/codes', {
      method: 'POST',
      accessToken: token,
    })
    expect(request.mock.calls[0]?.[1]).not.toHaveProperty('body')
  })

  it.each([
    ['created false', { created: false }],
    ['missing created', {}],
    ['wrong type', { created: 'true' }],
    ['raw V2Board result', { data: true }],
  ])('rejects malformed Create success: %s', async (_name, payload) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(payload)
    await expect(referralsApi.createCode(token)).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })

  it('uses a credential- and content-free non-retrying mutation key', () => {
    const options = referralCodeCreateMutationOptions(token)
    expect(options.mutationKey).toEqual(['referrals', 'create-code'])
    expect(options.mutationKey).toBe(referralsMutationKeys.createCode)
    expect(options.retry).toBe(false)
    expect(JSON.stringify(options.mutationKey)).not.toContain(token)
    expect(JSON.stringify(options.mutationKey)).not.toContain('FIRST123')
  })

  it('reads the exact overview path, preserves code order, and strips additions', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({
        ...validOverview(),
        codes: [
          { code: 'FIRST123', createdAt: timestamp, userId: 1 },
          {
            code: 'SECOND456',
            createdAt: '2026-09-14T02:03:04+08:00',
            secret: true,
          },
        ],
        stats: { ...validOverview().stats, privateBalance: 999 },
        email: 'private@example.com',
      })

    await expect(referralsApi.getOverview(token)).resolves.toEqual({
      ...validOverview(),
      codes: [
        { code: 'FIRST123', createdAt: timestamp },
        { code: 'SECOND456', createdAt: '2026-09-14T02:03:04+08:00' },
      ],
    })
    expect(request).toHaveBeenCalledWith('/api/v1/referrals', {
      method: 'GET',
      accessToken: token,
    })
  })

  it('accepts empty codes and all overview numeric boundaries', async () => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue({
      codes: [],
      stats: {
        registeredUsers: 0,
        earnedCommissionMinor: Number.MAX_SAFE_INTEGER,
        pendingCommissionMinor: 0,
        commissionRatePercent: 0,
        availableCommissionMinor: Number.MAX_SAFE_INTEGER,
      },
    })
    await expect(referralsApi.getOverview(token)).resolves.toMatchObject({
      codes: [],
      stats: {
        registeredUsers: 0,
        earnedCommissionMinor: Number.MAX_SAFE_INTEGER,
        commissionRatePercent: 0,
      },
    })

    vi.mocked(apiClient.authenticatedRequest).mockResolvedValue({
      ...validOverview(),
      stats: { ...validOverview().stats, commissionRatePercent: 100 },
    })
    await expect(referralsApi.getOverview(token)).resolves.toMatchObject({
      stats: { commissionRatePercent: 100 },
    })
  })

  it.each([
    ['negative integer', { registeredUsers: -1 }],
    ['float', { earnedCommissionMinor: 1.5 }],
    ['numeric string', { pendingCommissionMinor: '1' }],
    ['rate below zero', { commissionRatePercent: -1 }],
    ['rate above 100', { commissionRatePercent: 101 }],
  ])('rejects malformed overview %s', async (_name, statsPatch) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue({
      ...validOverview(),
      stats: { ...validOverview().stats, ...statsPatch },
    })
    await expect(referralsApi.getOverview(token)).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })

  it.each([
    ['empty code', { code: '', createdAt: timestamp }],
    ['non-ASCII code', { code: '邀请码', createdAt: timestamp }],
    ['punctuated code', { code: 'CODE-1', createdAt: timestamp }],
    ['long code', { code: 'A'.repeat(33), createdAt: timestamp }],
    ['bad timestamp', { code: 'CODE1', createdAt: 'not-a-date' }],
  ])('rejects malformed referral code: %s', async (_name, code) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue({
      ...validOverview(),
      codes: [code],
    })
    await expect(referralsApi.getOverview(token)).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })

  it('reads the exact commission page, preserves order, and strips additions', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({
        ...validCommissionPage(),
        items: [
          { ...validCommissionPage().items[0], orderId: 'private' },
          {
            orderAmountMinor: 20_000,
            commissionAmountMinor: 2_000,
            createdAt: '2026-09-14T02:03:04.000Z',
            buyer: 'private',
          },
        ],
        privateTotal: 9,
      })

    await expect(referralsApi.getCommissions(token, 1, 20)).resolves.toEqual({
      ...validCommissionPage(),
      items: [
        validCommissionPage().items[0],
        {
          orderAmountMinor: 20_000,
          commissionAmountMinor: 2_000,
          createdAt: '2026-09-14T02:03:04.000Z',
        },
      ],
    })
    expect(request).toHaveBeenCalledWith(
      '/api/v1/referrals/commissions?page=1&pageSize=20',
      { method: 'GET', accessToken: token },
    )
  })

  it('encodes the requested commission page and accepts safe integer boundaries', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({
        items: [
          {
            orderAmountMinor: 0,
            commissionAmountMinor: Number.MAX_SAFE_INTEGER,
            createdAt: timestamp,
          },
        ],
        page: 2_147_483_647,
        pageSize: 100,
        total: Number.MAX_SAFE_INTEGER,
      })
    await expect(
      referralsApi.getCommissions(token, 2_147_483_647, 100),
    ).resolves.toMatchObject({
      page: 2_147_483_647,
      total: Number.MAX_SAFE_INTEGER,
    })
    expect(request).toHaveBeenCalledWith(
      '/api/v1/referrals/commissions?page=2147483647&pageSize=100',
      { method: 'GET', accessToken: token },
    )
  })

  it.each([
    ['negative order amount', { orderAmountMinor: -1 }],
    ['float commission amount', { commissionAmountMinor: 1.5 }],
    ['numeric amount string', { commissionAmountMinor: '1' }],
    ['bad timestamp', { createdAt: 'bad' }],
  ])('rejects malformed commission item: %s', async (_name, patch) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue({
      ...validCommissionPage(),
      items: [{ ...validCommissionPage().items[0], ...patch }],
    })
    await expect(
      referralsApi.getCommissions(token, 1, 20),
    ).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })

  it.each([
    ['negative total', { total: -1 }],
    ['float total', { total: 1.5 }],
    ['numeric total string', { total: '1' }],
    ['page zero', { page: 0 }],
    ['page over boundary', { page: 2_147_483_648 }],
    ['pageSize below boundary', { pageSize: 9 }],
    ['pageSize above boundary', { pageSize: 101 }],
  ])('rejects malformed commission pagination: %s', async (_name, patch) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue({
      ...validCommissionPage(),
      ...patch,
    })
    await expect(
      referralsApi.getCommissions(token, 1, 20),
    ).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })

  it.each([
    { page: 0, pageSize: 20 },
    { page: 2_147_483_648, pageSize: 20 },
    { page: 1.5, pageSize: 20 },
    { page: 1, pageSize: 9 },
    { page: 1, pageSize: 101 },
  ])(
    'rejects invalid commission request input before HTTP %#',
    async (input) => {
      const request = vi.spyOn(apiClient, 'authenticatedRequest')
      expect(() => commissionPageRequestSchema.parse(input)).toThrow()
      await expect(
        referralsApi.getCommissions(token, input.page, input.pageSize),
      ).rejects.toBeDefined()
      expect(request).not.toHaveBeenCalled()
    },
  )

  it('keeps the commission request schema strict', () => {
    expect(() =>
      commissionPageRequestSchema.parse({
        page: 1,
        pageSize: 20,
        token: 'private',
      }),
    ).toThrow()
  })

  it('reads withdrawal options exactly, preserves method order, and strips additions', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({
        enabled: true,
        methods: ['method-b', 'method-a'],
        minimum: 100,
        fee: 10,
      })
    await expect(referralsApi.getWithdrawalOptions(token)).resolves.toEqual({
      enabled: true,
      methods: ['method-b', 'method-a'],
    })
    expect(request).toHaveBeenCalledWith(
      '/api/v1/referrals/withdrawal-options',
      { method: 'GET', accessToken: token },
    )
  })

  it.each([
    { enabled: false, methods: [] },
    { enabled: true, methods: ['x', 'm'.repeat(255)] },
  ])('accepts withdrawal option boundaries %#', async (payload) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(payload)
    await expect(referralsApi.getWithdrawalOptions(token)).resolves.toEqual(
      payload,
    )
  })

  it.each([
    ['empty method', { enabled: true, methods: [''] }],
    ['long method', { enabled: true, methods: ['m'.repeat(256)] }],
    ['wrong enabled type', { enabled: 1, methods: [] }],
    ['wrong methods type', { enabled: true, methods: 'bank' }],
  ])('rejects malformed withdrawal options: %s', async (_name, payload) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(payload)
    await expect(
      referralsApi.getWithdrawalOptions(token),
    ).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })

  it.each([
    ['UPSTREAM_ERROR', 502],
    ['UPSTREAM_TIMEOUT', 504],
    ['NETWORK_ERROR', 0],
  ] as const)(
    'preserves the public %s read error boundary',
    async (code, status) => {
      const error = new ApiError({ status, code, message: 'public boundary' })
      vi.spyOn(apiClient, 'authenticatedRequest').mockRejectedValue(error)
      await expect(referralsApi.getOverview(token)).rejects.toBe(error)
    },
  )
})
