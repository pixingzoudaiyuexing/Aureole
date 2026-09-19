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

const subscriptionDeliveryEntryIdSchema = z
  .string()
  .regex(/^[a-z](?:[a-z0-9]|-(?=[a-z0-9])){0,63}$/)

const subscriptionDeliveryLabelSchema = z
  .string()
  .min(1)
  .max(120)
  .refine((value) => value.trim() === value)

const subscriptionDeliveryOptionsSchema = z
  .object({
    defaultEntryId: subscriptionDeliveryEntryIdSchema.nullable(),
    entries: z.array(
      z
        .object({
          id: subscriptionDeliveryEntryIdSchema,
          label: subscriptionDeliveryLabelSchema,
        })
        .strip(),
    ),
  })
  .strip()
  .superRefine((value, context) => {
    const ids = new Set<string>()
    value.entries.forEach((entry, index) => {
      if (ids.has(entry.id)) {
        context.addIssue({
          code: 'custom',
          path: ['entries', index, 'id'],
          message: 'Duplicate subscription delivery entry ID',
        })
      }
      ids.add(entry.id)
    })

    if (value.defaultEntryId !== null && !ids.has(value.defaultEntryId)) {
      context.addIssue({
        code: 'custom',
        path: ['defaultEntryId'],
        message: 'Default subscription delivery entry is unavailable',
      })
    }
  })

const subscriptionAccessLinkRequestSchema = z
  .object({
    entryId: subscriptionDeliveryEntryIdSchema,
    profileId: z.literal('default'),
    subscriptionInfo: z.enum(['show', 'hide']),
  })
  .strict()

const subscriptionAccessLinkSchema = z
  .object({ accessUrl: httpsCredentialUrlSchema })
  .strip()

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
export type SubscriptionDeliveryOptions = z.infer<
  typeof subscriptionDeliveryOptionsSchema
>
export type SubscriptionDeliveryEntry =
  SubscriptionDeliveryOptions['entries'][number]
export type SubscriptionInfoMode = 'show' | 'hide'
export type SubscriptionAccessLinkInput = z.input<
  typeof subscriptionAccessLinkRequestSchema
>
export type SubscriptionAccessLink = z.infer<
  typeof subscriptionAccessLinkSchema
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

  async getDeliveryOptions(accessToken: string, signal?: AbortSignal) {
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/subscription/delivery-options',
      { method: 'GET', accessToken, signal },
    )
    return parseSubscriptionData(subscriptionDeliveryOptionsSchema, data)
  },

  async getAccessLink(
    accessToken: string,
    input: SubscriptionAccessLinkInput,
    signal?: AbortSignal,
  ) {
    const body = parseSubscriptionRequest(
      subscriptionAccessLinkRequestSchema,
      input,
    )
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/subscription/access-link',
      { method: 'POST', accessToken, body, signal },
    )
    return parseSubscriptionData(subscriptionAccessLinkSchema, data)
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
