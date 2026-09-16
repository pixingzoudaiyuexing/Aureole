import { z } from 'zod'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const productIdSchema = z
  .string()
  .regex(/^[1-9]\d{0,9}$/)
  .refine((value) => Number(value) <= 2_147_483_647)

const httpsCredentialUrlSchema = z.string().refine((value) => {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      url.toString() === value
    )
  } catch {
    return false
  }
})

const subscriptionEntryBaseUrlSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine((value) => value.trim().length > 0)

const subscriptionEntriesSchema = z
  .object({
    entries: z.array(
      z
        .object({
          baseUrl: subscriptionEntryBaseUrlSchema,
        })
        .strip(),
    ),
  })
  .strip()

const subscriptionEntryAccessRequestSchema = z
  .object({
    baseUrl: subscriptionEntryBaseUrlSchema,
  })
  .strict()

const subscriptionEntryAccessSchema = z
  .object({
    accessUrl: httpsCredentialUrlSchema,
  })
  .strip()

const subscriptionAccessSchema = z.union([
  z.object({ eligible: z.literal(false), accessUrl: z.null() }).strip(),
  z
    .object({
      eligible: z.literal(true),
      accessUrl: httpsCredentialUrlSchema,
    })
    .strip(),
])

const subscriptionAccessRotationSchema = z
  .object({
    rotated: z.literal(true),
    accessUrl: httpsCredentialUrlSchema,
  })
  .strip()

const subscriptionPeriodAdvanceSchema = z
  .object({
    advanced: z.literal(true),
  })
  .strip()

const safeCountSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER)

const boundedIntegerSchema = z.number().int().nonnegative().max(2_147_483_647)

const subscriptionOverviewSchema = z
  .object({
    product: z
      .object({
        id: productIdSchema,
        name: z.string().min(1).max(255),
      })
      .strip()
      .nullable(),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
    traffic: z
      .object({
        uploadedBytes: safeCountSchema,
        downloadedBytes: safeCountSchema,
        allowanceBytes: safeCountSchema,
      })
      .strip(),
    deviceLimit: boundedIntegerSchema.nullable(),
    activeDevices: boundedIntegerSchema,
    resetDay: boundedIntegerSchema.nullable(),
    renewalAllowed: z.boolean(),
  })
  .strip()

export type SubscriptionEntry = z.infer<
  typeof subscriptionEntriesSchema
>['entries'][number]
export type SubscriptionEntries = z.infer<typeof subscriptionEntriesSchema>
export type SubscriptionEntryAccess = z.infer<
  typeof subscriptionEntryAccessSchema
>
export type SubscriptionAccess = z.infer<typeof subscriptionAccessSchema>
export type SubscriptionAccessRotation = z.infer<
  typeof subscriptionAccessRotationSchema
>
export type SubscriptionPeriodAdvance = z.infer<
  typeof subscriptionPeriodAdvanceSchema
>
export type SubscriptionOverview = z.infer<typeof subscriptionOverviewSchema>

function parseSubscriptionData<T>(schema: z.ZodType<T>, data: unknown) {
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    throw new ApiError({
      status: 200,
      code: 'MALFORMED_RESPONSE',
      message: 'The public API returned an invalid response',
    })
  }
  return parsed.data
}

function parseSubscriptionRequest<T>(schema: z.ZodType<T>, data: unknown) {
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    throw new ApiError({
      status: 0,
      code: 'VALIDATION_ERROR',
      message: 'The subscription request is invalid',
    })
  }
  return parsed.data
}

export const subscriptionApi = {
  async getAccess(accessToken: string) {
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/subscription',
      { method: 'GET', accessToken },
    )
    return parseSubscriptionData(subscriptionAccessSchema, data)
  },

  async getEntries(accessToken: string, signal?: AbortSignal) {
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/subscription/entries',
      { method: 'GET', accessToken, signal },
    )
    return parseSubscriptionData(subscriptionEntriesSchema, data)
  },

  async getEntryAccess(
    accessToken: string,
    baseUrl: string,
    signal?: AbortSignal,
  ) {
    const body = parseSubscriptionRequest(
      subscriptionEntryAccessRequestSchema,
      { baseUrl },
    )
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/subscription/entry-access',
      { method: 'POST', accessToken, body, signal },
    )
    return parseSubscriptionData(subscriptionEntryAccessSchema, data)
  },

  async getOverview(accessToken: string) {
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/subscription/overview',
      { method: 'GET', accessToken },
    )
    return parseSubscriptionData(subscriptionOverviewSchema, data)
  },

  async rotateAccess(accessToken: string) {
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/subscription/rotate-access',
      { method: 'POST', accessToken },
    )
    return parseSubscriptionData(subscriptionAccessRotationSchema, data)
  },

  async advancePeriod(accessToken: string) {
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/subscription/advance-period',
      { method: 'POST', accessToken },
    )
    return parseSubscriptionData(subscriptionPeriodAdvanceSchema, data)
  },
}
