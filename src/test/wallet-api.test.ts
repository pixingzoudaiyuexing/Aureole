import { describe, expect, it, vi } from 'vitest'
import { walletApi } from '@/features/wallet/wallet-api'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const accessToken = 'opaque-wallet-token'

describe('Wallet API contract', () => {
  it.each([0, 1, 2_147_483_647])(
    'reads valid balanceMinor=%i from the exact authenticated path',
    async (balanceMinor) => {
      const request = vi
        .spyOn(apiClient, 'authenticatedRequest')
        .mockResolvedValue({ balanceMinor })

      await expect(walletApi.getWallet(accessToken)).resolves.toEqual({
        balanceMinor,
      })
      expect(request).toHaveBeenCalledWith('/api/v1/wallet', {
        method: 'GET',
        accessToken,
      })
    },
  )

  it('strips additive private fields', async () => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue({
      balanceMinor: 12_345,
      email: 'private@example.com',
      commissionBalance: 999,
      pendingBalance: 456,
      rawUser: { id: 1 },
    })

    await expect(walletApi.getWallet(accessToken)).resolves.toEqual({
      balanceMinor: 12_345,
    })
  })

  it.each([
    ['negative', { balanceMinor: -1 }],
    ['float', { balanceMinor: 1.5 }],
    ['numeric string', { balanceMinor: '1' }],
    ['null', { balanceMinor: null }],
    ['missing', {}],
    ['above signed INT', { balanceMinor: 2_147_483_648 }],
  ])('rejects %s balance as MALFORMED_RESPONSE', async (_case, payload) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(payload)

    await expect(walletApi.getWallet(accessToken)).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })
})
