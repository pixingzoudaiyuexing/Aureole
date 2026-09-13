import { z } from 'zod'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'
import { orderIdSchema } from '@/features/orders/orders-api'

export const paymentMethodIdSchema = z
  .string()
  .regex(/^[1-9]\d{0,9}$/)
  .refine((value) => Number(value) <= 2_147_483_647)

function isCredentialFreeHttpsUrl(target: string) {
  try {
    const url = new URL(target)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

const paymentMethodSchema = z
  .object({
    id: paymentMethodIdSchema,
    name: z.string().min(1).max(255),
    icon: z
      .string()
      .url()
      .max(8192)
      .refine(isCredentialFreeHttpsUrl)
      .nullable(),
    fee: z
      .object({
        fixedMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        percent: z.number().finite().nonnegative().max(100),
      })
      .strip(),
  })
  .strip()

function hasNoControlCharacters(value: string) {
  return Array.from(value).every((character) => {
    const code = character.codePointAt(0) ?? 0
    return !((code >= 0 && code <= 31) || (code >= 127 && code <= 159))
  })
}

const qrDataSchema = z.string().min(1).max(4096).refine(hasNoControlCharacters)

const redirectTargetSchema = z
  .string()
  .url()
  .max(8192)
  .refine(isCredentialFreeHttpsUrl)

const checkoutActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('finished') }).strip(),
  z.object({ type: z.literal('qrcode'), data: qrDataSchema }).strip(),
  z
    .object({ type: z.literal('redirect'), target: redirectTargetSchema })
    .strip(),
])

const checkoutRequestSchema = z
  .object({ paymentMethodId: paymentMethodIdSchema })
  .strict()

const paymentMethodsSchema = z.array(paymentMethodSchema)

export type PaymentMethod = z.infer<typeof paymentMethodSchema>
export type CheckoutAction = z.infer<typeof checkoutActionSchema>
export type CheckoutInput = z.input<typeof checkoutRequestSchema>

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

export const paymentApi = {
  async getMethods(accessToken: string) {
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/billing/methods',
      { method: 'GET', accessToken },
    )
    return parse(paymentMethodsSchema, data)
  },

  async checkout(accessToken: string, orderId: string, input: CheckoutInput) {
    const validOrderId = orderIdSchema.parse(orderId)
    const body = checkoutRequestSchema.parse(input)
    const data = await apiClient.authenticatedRequest<unknown>(
      `/api/v1/orders/${encodeURIComponent(validOrderId)}/checkout`,
      { method: 'POST', body, accessToken },
    )
    return parse(checkoutActionSchema, data)
  },
}
