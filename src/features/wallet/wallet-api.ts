import { z } from 'zod'
import { orderIdSchema } from '@/features/orders/orders-api'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const walletSchema = z
  .object({
    balanceMinor: z.number().int().nonnegative().max(2_147_483_647),
  })
  .strip()

export type Wallet = z.infer<typeof walletSchema>

const depositRequestSchema = z
  .object({
    amountMinor: z.number().int().min(1).max(2_147_483_647),
  })
  .strict()

const depositCreatedSchema = z.object({ id: orderIdSchema }).strip()

export type WalletDepositInput = z.input<typeof depositRequestSchema>
export type WalletDepositCreated = z.infer<typeof depositCreatedSchema>

function parseWallet(data: unknown) {
  const parsed = walletSchema.safeParse(data)
  if (!parsed.success) {
    throw new ApiError({
      status: 200,
      code: 'MALFORMED_RESPONSE',
      message: 'The public API returned an invalid response',
    })
  }
  return parsed.data
}

export const walletApi = {
  async getWallet(accessToken: string) {
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/wallet',
      { method: 'GET', accessToken },
    )
    return parseWallet(data)
  },

  async createDeposit(accessToken: string, input: WalletDepositInput) {
    const body = depositRequestSchema.parse(input)
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/wallet/deposits',
      { method: 'POST', body, accessToken },
    )
    const parsed = depositCreatedSchema.safeParse(data)
    if (!parsed.success) {
      throw new ApiError({
        status: 200,
        code: 'MALFORMED_RESPONSE',
        message: 'The public API returned an invalid response',
      })
    }
    return parsed.data
  },
}
