import { z } from 'zod'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const publicIntegerSchema = z.number().int().nonnegative().max(2_147_483_647)
const validatePromotionRequestSchema = z
  .object({
    code: z.string().trim().min(1).max(255),
    productId: z.number().int().positive().max(2_147_483_647),
  })
  .strict()
const fixedDiscountSchema = z
  .object({ type: z.literal('fixed'), amountMinor: publicIntegerSchema })
  .strip()
const percentageDiscountSchema = z
  .object({ type: z.literal('percentage'), percent: publicIntegerSchema })
  .strip()
const promotionPreviewSchema = z
  .object({
    valid: z.literal(true),
    discount: z.discriminatedUnion('type', [
      fixedDiscountSchema,
      percentageDiscountSchema,
    ]),
  })
  .strip()

export type PromotionPreview = z.infer<typeof promotionPreviewSchema>
export type ValidatePromotionInput = z.input<
  typeof validatePromotionRequestSchema
>

function parsePreview(data: unknown) {
  const parsed = promotionPreviewSchema.safeParse(data)
  if (!parsed.success) {
    throw new ApiError({
      status: 200,
      code: 'MALFORMED_RESPONSE',
      message: 'The public API returned an invalid response',
    })
  }
  return parsed.data
}

export const promotionsApi = {
  async validate(accessToken: string, input: ValidatePromotionInput) {
    const body = validatePromotionRequestSchema.parse(input)
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/promotions/validate',
      { method: 'POST', body, accessToken },
    )
    return parsePreview(data)
  },
}
