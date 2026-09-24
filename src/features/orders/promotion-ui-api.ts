import { z } from 'zod'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const promotionUiSchema = z
  .object({
    showCouponEntry: z.boolean(),
    annualPrefillCode: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .refine((code) =>
        [...code].every((character) => {
          const point = character.codePointAt(0) ?? 0
          return (
            !/\s|[<>]/u.test(character) &&
            point > 0x1f &&
            (point < 0x7f || point > 0x9f)
          )
        }),
      )
      .nullable(),
  })
  .strip()

export type PromotionUiConfig = z.infer<typeof promotionUiSchema>

export const defaultPromotionUiConfig: PromotionUiConfig = {
  showCouponEntry: true,
  annualPrefillCode: null,
}

export function parsePromotionUi(data: unknown): PromotionUiConfig {
  const parsed = promotionUiSchema.safeParse(data)
  if (
    !parsed.success ||
    (!parsed.data.showCouponEntry && parsed.data.annualPrefillCode !== null)
  ) {
    throw new ApiError({
      status: 200,
      code: 'MALFORMED_RESPONSE',
      message: 'The public API returned an invalid response',
    })
  }
  return parsed.data
}

export const promotionUiApi = {
  async getConfig() {
    const data = await apiClient.request<unknown>(
      '/api/v1/config/promotion-ui',
      {
        method: 'GET',
      },
    )
    return parsePromotionUi(data)
  },
}
