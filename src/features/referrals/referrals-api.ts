import { z } from 'zod'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const safeNonnegativeIntegerSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER)
const timestampSchema = z.string().datetime({ offset: true })
const referralCodeSchema = z
  .object({
    code: z.string().regex(/^[A-Za-z0-9]{1,32}$/),
    createdAt: timestampSchema,
  })
  .strip()
const referralOverviewSchema = z
  .object({
    codes: z.array(referralCodeSchema),
    stats: z
      .object({
        registeredUsers: safeNonnegativeIntegerSchema,
        earnedCommissionMinor: safeNonnegativeIntegerSchema,
        pendingCommissionMinor: safeNonnegativeIntegerSchema,
        commissionRatePercent: z.number().int().min(0).max(100),
        availableCommissionMinor: safeNonnegativeIntegerSchema,
      })
      .strip(),
  })
  .strip()
const commissionItemSchema = z
  .object({
    orderAmountMinor: safeNonnegativeIntegerSchema,
    commissionAmountMinor: safeNonnegativeIntegerSchema,
    createdAt: timestampSchema,
  })
  .strip()
export const commissionPageRequestSchema = z
  .object({
    page: z.number().int().positive().max(2_147_483_647),
    pageSize: z.number().int().min(10).max(100),
  })
  .strict()
const commissionPageSchema = z
  .object({
    items: z.array(commissionItemSchema),
    page: z.number().int().positive().max(2_147_483_647),
    pageSize: z.number().int().min(10).max(100),
    total: safeNonnegativeIntegerSchema,
  })
  .strip()
const withdrawalOptionsSchema = z
  .object({
    enabled: z.boolean(),
    methods: z.array(z.string().min(1).max(255)),
  })
  .strip()
const createdReferralCodeSchema = z
  .object({
    created: z.literal(true),
  })
  .strip()
export const commissionTransferRequestSchema = z
  .object({
    amountMinor: z.number().int().min(1).max(2_147_483_647),
  })
  .strict()
const commissionTransferredSchema = z
  .object({
    transferred: z.literal(true),
  })
  .strip()

export type ReferralOverview = z.infer<typeof referralOverviewSchema>
export type CommissionPage = z.infer<typeof commissionPageSchema>
export type WithdrawalOptions = z.infer<typeof withdrawalOptionsSchema>
export type CreatedReferralCode = z.infer<typeof createdReferralCodeSchema>
export type CommissionTransferInput = z.input<
  typeof commissionTransferRequestSchema
>
export type CommissionTransferred = z.infer<typeof commissionTransferredSchema>

function parse<T>(schema: z.ZodType<T>, data: unknown) {
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

export const referralsApi = {
  async getOverview(accessToken: string) {
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/referrals',
      { method: 'GET', accessToken },
    )
    return parse(referralOverviewSchema, data)
  },

  async createCode(accessToken: string) {
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/referrals/codes',
      { method: 'POST', accessToken },
    )
    return parse(createdReferralCodeSchema, data)
  },

  async getCommissions(accessToken: string, page: number, pageSize: number) {
    const request = commissionPageRequestSchema.parse({ page, pageSize })
    const query = new URLSearchParams({
      page: String(request.page),
      pageSize: String(request.pageSize),
    })
    const data = await apiClient.authenticatedRequest<unknown>(
      `/api/v1/referrals/commissions?${query.toString()}`,
      { method: 'GET', accessToken },
    )
    return parse(commissionPageSchema, data)
  },

  async transferCommission(
    accessToken: string,
    input: CommissionTransferInput,
  ) {
    const body = commissionTransferRequestSchema.parse(input)
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/referrals/commissions/transfer',
      { method: 'POST', body, accessToken },
    )
    return parse(commissionTransferredSchema, data)
  },

  async getWithdrawalOptions(accessToken: string) {
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/referrals/withdrawal-options',
      { method: 'GET', accessToken },
    )
    return parse(withdrawalOptionsSchema, data)
  },
}
