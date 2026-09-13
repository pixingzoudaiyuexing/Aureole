import { describe, expect, it, vi } from 'vitest'
import { giftCardApi } from '@/features/wallet/gift-card-api'
import {
  giftCardMutationKeys,
  giftCardRedeemMutationOptions,
} from '@/features/wallet/gift-card-queries'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const accessToken = 'opaque-session-token'

describe('Gift Card API contract', () => {
  it.each(['x', 'x'.repeat(255), ' Exact-Fake-Code '])(
    'preserves a valid code of length %i exactly',
    async (code) => {
      const request = vi
        .spyOn(apiClient, 'authenticatedRequest')
        .mockResolvedValue({
          redeemed: true,
          effect: { type: 'trafficReset' },
        })

      await expect(giftCardApi.redeem(accessToken, { code })).resolves.toEqual({
        redeemed: true,
        effect: { type: 'trafficReset' },
      })
      expect(request).toHaveBeenCalledWith('/api/v1/gift-cards/redeem', {
        method: 'POST',
        body: { code },
        accessToken,
      })
    },
  )

  it.each([
    {},
    { code: '' },
    { code: 'x'.repeat(256) },
    { code: 123 },
    { giftcard: 'fake-card' },
    { code: 'fake-card', type: 1 },
    { code: 'fake-card', value: 100 },
    { code: 'fake-card', amount: 100 },
    { code: 'fake-card', plan: 7 },
  ])('rejects an invalid or expanded request %# before POST', async (input) => {
    const request = vi.spyOn(apiClient, 'authenticatedRequest')

    await expect(
      giftCardApi.redeem(accessToken, input as never),
    ).rejects.toBeDefined()
    expect(request).not.toHaveBeenCalled()
  })

  it.each([
    [
      { type: 'balance', amountMinor: 2_147_483_647, private: true },
      { type: 'balance', amountMinor: 2_147_483_647 },
    ],
    [
      { type: 'balance', amountMinor: -2_147_483_648 },
      { type: 'balance', amountMinor: -2_147_483_648 },
    ],
    [
      { type: 'validity', days: -365, private: true },
      { type: 'validity', days: -365 },
    ],
    [
      { type: 'traffic', gigabytes: -100, private: true },
      { type: 'traffic', gigabytes: -100 },
    ],
    [{ type: 'trafficReset', private: true }, { type: 'trafficReset' }],
    [
      { type: 'plan', durationDays: 0, private: true },
      { type: 'plan', durationDays: 0 },
    ],
    [
      { type: 'plan', durationDays: -30 },
      { type: 'plan', durationDays: -30 },
    ],
    [
      { type: 'plan', durationDays: null },
      { type: 'plan', durationDays: null },
    ],
  ] as const)(
    'accepts and strips Public effect %#',
    async (effect, expected) => {
      vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue({
        redeemed: true,
        effect,
        code: 'must-not-survive',
        giftcard: 'must-not-survive',
      })

      await expect(
        giftCardApi.redeem(accessToken, { code: 'fake-card' }),
      ).resolves.toEqual({ redeemed: true, effect: expected })
    },
  )

  it.each([
    { redeemed: false, effect: { type: 'trafficReset' } },
    { effect: { type: 'trafficReset' } },
    { redeemed: true },
    { redeemed: true, effect: { type: 'unknown', value: 1 } },
    { redeemed: true, effect: { type: 1, value: 1 } },
    { redeemed: true, effect: { type: 'balance', amountMinor: 1.5 } },
    { redeemed: true, effect: { type: 'balance', amountMinor: '1' } },
    {
      redeemed: true,
      effect: { type: 'balance', amountMinor: 2_147_483_648 },
    },
    {
      redeemed: true,
      effect: { type: 'balance', amountMinor: -2_147_483_649 },
    },
    { redeemed: true, effect: { type: 'validity' } },
    { redeemed: true, effect: { type: 'validity', days: 1.5 } },
    { redeemed: true, effect: { type: 'traffic', gigabytes: '1' } },
    { redeemed: true, effect: { type: 'plan' } },
    { redeemed: true, effect: { type: 'plan', durationDays: '0' } },
  ])('rejects malformed success DTO %#', async (payload) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(payload)

    await expect(
      giftCardApi.redeem(accessToken, { code: 'fake-card' }),
    ).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })

  it.each([
    ['GIFT_CARD_NOT_FOUND', 404],
    ['GIFT_CARD_NOT_ACTIVE', 409],
    ['GIFT_CARD_EXPIRED', 409],
    ['GIFT_CARD_USAGE_LIMIT_REACHED', 409],
    ['GIFT_CARD_ALREADY_REDEEMED', 409],
    ['GIFT_CARD_NOT_APPLICABLE', 409],
    ['GIFT_CARD_REDEEM_FAILED', 502],
    ['VALIDATION_ERROR', 400],
    ['UPSTREAM_TIMEOUT', 504],
    ['UPSTREAM_ERROR', 502],
    ['NETWORK_ERROR', 0],
  ] as const)(
    'preserves the public %s error boundary',
    async (code, status) => {
      const error = new ApiError({ status, code, message: 'public boundary' })
      vi.spyOn(apiClient, 'authenticatedRequest').mockRejectedValue(error)

      await expect(
        giftCardApi.redeem(accessToken, { code: 'fake-card' }),
      ).rejects.toBe(error)
    },
  )

  it('uses a credential-free non-retrying mutation key', () => {
    const options = giftCardRedeemMutationOptions(accessToken)
    expect(giftCardMutationKeys.redeem).toEqual(['gift-cards', 'redeem'])
    expect(options.mutationKey).not.toContain(accessToken)
    expect(JSON.stringify(options.mutationKey)).not.toContain('fake-card')
    expect(options.retry).toBe(false)
  })
})
