import { z } from 'zod'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

export const billingPeriods = [
  'month',
  'quarter',
  'halfYear',
  'year',
  'twoYears',
  'threeYears',
  'oneTime',
] as const

const productIdSchema = z
  .string()
  .regex(/^[1-9]\d{0,9}$/)
  .refine((value) => Number(value) <= 2_147_483_647)
const safeIntegerSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER)
const productPriceSchema = z
  .object({
    billingPeriod: z.enum(billingPeriods),
    amountMinor: safeIntegerSchema,
  })
  .strip()
const productSchema = z
  .object({
    id: productIdSchema,
    name: z.string().min(1),
    dataAllowanceGb: safeIntegerSchema,
    speedLimitMbps: safeIntegerSchema.nullable(),
    available: z.boolean(),
    prices: z.array(productPriceSchema),
  })
  .strip()
const productsResponseSchema = z
  .object({ products: z.array(productSchema) })
  .strip()

export type BillingPeriod = (typeof billingPeriods)[number]
export type Product = z.infer<typeof productSchema>

function parseProducts(data: unknown) {
  const parsed = productsResponseSchema.safeParse(data)
  if (!parsed.success) {
    throw new ApiError({
      status: 200,
      code: 'MALFORMED_RESPONSE',
      message: 'The public API returned an invalid response',
    })
  }
  return parsed.data.products
}

export const catalogApi = {
  async getProducts(accessToken: string) {
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/products',
      { method: 'GET', accessToken },
    )
    return parseProducts(data)
  },
}
