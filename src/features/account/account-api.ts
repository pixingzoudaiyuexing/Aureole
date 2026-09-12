import { z } from 'zod'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

export const currentPasswordSchema = z
  .string()
  .min(1, '请输入当前密码')
  .max(1024, '当前密码不能超过 1024 个字符')

export const newAccountPasswordSchema = z
  .string()
  .min(8, '新密码至少需要 8 个字符')
  .max(1024, '新密码不能超过 1024 个字符')

const preferencesSchema = z
  .object({
    autoRenewal: z.boolean(),
    remindExpire: z.boolean(),
    remindTraffic: z.boolean(),
  })
  .strip()

const preferencesUpdateSchema = preferencesSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0)

const preferencesUpdatedSchema = z.object({ updated: z.literal(true) }).strip()

const accountStatsSchema = z
  .object({
    pendingOrders: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    openTickets: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    invitedUsers: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strip()

const accountConfigSchema = z
  .object({
    currency: z.string().trim().min(1).max(16),
    currencySymbol: z.string().trim().min(1).max(16),
  })
  .strip()

const changePasswordRequestSchema = z
  .object({
    currentPassword: currentPasswordSchema,
    newPassword: newAccountPasswordSchema,
  })
  .strict()

const passwordChangedSchema = z.object({ changed: z.literal(true) }).strip()

export type AccountPreferences = z.infer<typeof preferencesSchema>
export type AccountPreferencesUpdate = z.infer<typeof preferencesUpdateSchema>
export type AccountStats = z.infer<typeof accountStatsSchema>
export type AccountConfig = z.infer<typeof accountConfigSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordRequestSchema>

function parseAccountData<T>(schema: z.ZodType<T>, data: unknown) {
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

export const accountApi = {
  async getPreferences(accessToken: string) {
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/me/preferences',
      { method: 'GET', accessToken },
    )
    return parseAccountData(preferencesSchema, data)
  },

  async updatePreferences(
    accessToken: string,
    input: AccountPreferencesUpdate,
  ) {
    const request = preferencesUpdateSchema.parse(input)
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/me/preferences',
      { method: 'PATCH', body: request, accessToken },
    )
    return parseAccountData(preferencesUpdatedSchema, data)
  },

  async getStats(accessToken: string) {
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/me/stats',
      { method: 'GET', accessToken },
    )
    return parseAccountData(accountStatsSchema, data)
  },

  async getConfig(accessToken: string) {
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/config/account',
      { method: 'GET', accessToken },
    )
    return parseAccountData(accountConfigSchema, data)
  },

  async changePassword(accessToken: string, input: ChangePasswordInput) {
    const request = changePasswordRequestSchema.parse(input)
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/me/password',
      { method: 'POST', body: request, accessToken },
    )
    return parseAccountData(passwordChangedSchema, data)
  },
}
