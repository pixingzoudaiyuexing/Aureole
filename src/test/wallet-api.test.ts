import { describe, expect, it, vi } from 'vitest'
import { walletApi } from '@/features/wallet/wallet-api'
import {
  walletDepositMutationOptions,
  walletMutationKeys,
} from '@/features/wallet/wallet-queries'
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

  it('creates a deposit through the exact strict contract and strips additions', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({ id: 'deposit-order_1', private: true })

    await expect(
      walletApi.createDeposit(accessToken, { amountMinor: 10_000 }),
    ).resolves.toEqual({ id: 'deposit-order_1' })
    expect(request).toHaveBeenCalledWith('/api/v1/wallet/deposits', {
      method: 'POST',
      body: { amountMinor: 10_000 },
      accessToken,
    })
  })

  it.each([
    ['missing id', {}],
    ['invalid id', { id: 'invalid order id' }],
    ['numeric id', { id: 123 }],
  ])('rejects malformed deposit response: %s', async (_case, payload) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(payload)

    await expect(
      walletApi.createDeposit(accessToken, { amountMinor: 10_000 }),
    ).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })

  it.each([
    { amountMinor: 0 },
    { amountMinor: -1 },
    { amountMinor: 1.5 },
    { amountMinor: 2_147_483_648 },
    { amountMinor: 100, currency: 'CNY' },
    { amountMinor: 100, deposit_amount: 100 },
    { amountMinor: 100, paymentMethod: '3' },
  ])('rejects an invalid or expanded deposit request %#', async (input) => {
    const request = vi.spyOn(apiClient, 'authenticatedRequest')
    await expect(
      walletApi.createDeposit(accessToken, input as never),
    ).rejects.toBeDefined()
    expect(request).not.toHaveBeenCalled()
  })

  it.each([
    ['WALLET_DEPOSIT_UNAVAILABLE', 409],
    ['WALLET_DEPOSIT_AMOUNT_INVALID', 422],
    ['WALLET_DEPOSIT_CREATE_FAILED', 502],
    ['UPSTREAM_TIMEOUT', 504],
    ['UPSTREAM_ERROR', 502],
    ['NETWORK_ERROR', 0],
  ] as const)(
    'preserves the public %s error boundary',
    async (code, status) => {
      const error = new ApiError({ status, code, message: 'public boundary' })
      vi.spyOn(apiClient, 'authenticatedRequest').mockRejectedValue(error)

      await expect(
        walletApi.createDeposit(accessToken, { amountMinor: 10_000 }),
      ).rejects.toBe(error)
    },
  )

  it('configures a credential-free non-retrying deposit mutation', () => {
    expect(walletDepositMutationOptions(accessToken).retry).toBe(false)
    expect(walletMutationKeys.depositCreate).toEqual([
      'wallet',
      'deposit-create',
    ])
    expect(JSON.stringify(walletMutationKeys.depositCreate)).not.toContain(
      accessToken,
    )
  })
})
