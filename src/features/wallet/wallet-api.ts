import { z } from 'zod'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const walletSchema = z
  .object({
    balanceMinor: z.number().int().nonnegative().max(2_147_483_647),
  })
  .strip()

export type Wallet = z.infer<typeof walletSchema>

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
}
