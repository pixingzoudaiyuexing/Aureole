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

export const productIdSchema = z
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
export const productSchema = z
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
const productResponseSchema = z.object({ product: productSchema }).strip()

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

function parseProduct(data: unknown) {
  const parsed = productResponseSchema.safeParse(data)
  if (!parsed.success) {
    throw new ApiError({
      status: 200,
      code: 'MALFORMED_RESPONSE',
      message: 'The public API returned an invalid response',
    })
  }
  return parsed.data.product
}

export function toNumericProductId(id: string) {
  return Number(productIdSchema.parse(id))
}

export const catalogApi = {
  async getProducts(accessToken: string) {
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/products',
      { method: 'GET', accessToken },
    )
    return parseProducts(data)
  },

  async getProduct(accessToken: string, id: string) {
    const validId = productIdSchema.parse(id)
    const data = await apiClient.authenticatedRequest<unknown>(
      `/api/v1/products/${encodeURIComponent(validId)}`,
      { method: 'GET', accessToken },
    )
    return parseProduct(data)
  },
}
