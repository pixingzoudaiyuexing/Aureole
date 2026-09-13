import { z } from 'zod'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const signedIntSchema = z.number().int().min(-2_147_483_648).max(2_147_483_647)

const giftCardEffectSchema = z.discriminatedUnion('type', [
  z
    .object({ type: z.literal('balance'), amountMinor: signedIntSchema })
    .strip(),
  z.object({ type: z.literal('validity'), days: signedIntSchema }).strip(),
  z.object({ type: z.literal('traffic'), gigabytes: signedIntSchema }).strip(),
  z.object({ type: z.literal('trafficReset') }).strip(),
  z
    .object({
      type: z.literal('plan'),
      durationDays: signedIntSchema.nullable(),
    })
    .strip(),
])

const redeemGiftCardRequestSchema = z
  .object({ code: z.string().min(1).max(255) })
  .strict()

const redeemedGiftCardSchema = z
  .object({
    redeemed: z.literal(true),
    effect: giftCardEffectSchema,
  })
  .strip()

export type GiftCardEffect = z.infer<typeof giftCardEffectSchema>
export type RedeemGiftCardInput = z.input<typeof redeemGiftCardRequestSchema>
export type RedeemedGiftCard = z.infer<typeof redeemedGiftCardSchema>

function parseRedeemedGiftCard(data: unknown) {
  const parsed = redeemedGiftCardSchema.safeParse(data)
  if (!parsed.success) {
    throw new ApiError({
      status: 200,
      code: 'MALFORMED_RESPONSE',
      message: 'The public API returned an invalid response',
    })
  }
  return parsed.data
}

export const giftCardApi = {
  async redeem(accessToken: string, input: RedeemGiftCardInput) {
    const body = redeemGiftCardRequestSchema.parse(input)
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/gift-cards/redeem',
      { method: 'POST', body, accessToken },
    )
    return parseRedeemedGiftCard(data)
  },
}
