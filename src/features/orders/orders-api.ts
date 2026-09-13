import { z } from 'zod'
import { billingPeriods, productIdSchema } from '@/features/catalog/catalog-api'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

export const orderStatuses = [
  'pending',
  'processing',
  'cancelled',
  'completed',
  'adjusted',
] as const

export const orderIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,36}$/)
const timestampSchema = z.string().datetime({ offset: true })
const orderSchema = z
  .object({
    id: orderIdSchema,
    status: z.enum(orderStatuses),
    amountMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    createdAt: timestampSchema,
    updatedAt: timestampSchema.nullable(),
    expiresAt: timestampSchema.nullable(),
  })
  .strip()
const ordersSchema = z.array(orderSchema)
const promotionCodeSchema = z.string().trim().min(1).max(255)
const createOrderRequestSchema = z
  .object({
    productId: productIdSchema,
    billingPeriod: z.enum(billingPeriods),
    promotionCode: promotionCodeSchema.optional(),
  })
  .strict()
const createdOrderSchema = z.object({ id: orderIdSchema }).strip()
const cancelledOrderSchema = z.object({ cancelled: z.literal(true) }).strip()

export type OrderStatus = (typeof orderStatuses)[number]
export type Order = z.infer<typeof orderSchema>
export type CreateOrderInput = z.input<typeof createOrderRequestSchema>

function parse<T>(schema: z.ZodType<T>, data: unknown) {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new ApiError({
      status: 200,
      code: 'MALFORMED_RESPONSE',
      message: 'The public API returned an invalid response',
    })
  }
  return result.data
}

export const ordersApi = {
  async getList(accessToken: string) {
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/orders',
      { method: 'GET', accessToken },
    )
    return parse(ordersSchema, data)
  },

  async getDetail(accessToken: string, id: string) {
    const validId = orderIdSchema.parse(id)
    const data = await apiClient.authenticatedRequest<unknown>(
      `/api/v1/orders/${encodeURIComponent(validId)}`,
      { method: 'GET', accessToken },
    )
    return parse(orderSchema, data)
  },

  async create(accessToken: string, input: CreateOrderInput) {
    const body = createOrderRequestSchema.parse(input)
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/orders',
      { method: 'POST', body, accessToken },
    )
    return parse(createdOrderSchema, data)
  },

  async cancel(accessToken: string, id: string) {
    const validId = orderIdSchema.parse(id)
    const data = await apiClient.authenticatedRequest<unknown>(
      `/api/v1/orders/${encodeURIComponent(validId)}/cancel`,
      { method: 'POST', accessToken },
    )
    return parse(cancelledOrderSchema, data)
  },
}
