import { describe, expect, it, vi } from 'vitest'
import { appleIdApi } from '@/features/apple-id/apple-id-api'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const account = {
  username: 'one@example.com',
  status: true,
  lastCheck: '2026-09-26',
  remark: null,
}

describe('Apple ID API', () => {
  it('uses authenticated paths and strips plaintext from the list', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValueOnce({
        items: [{ ...account, password: 'must-not-survive', raw: true }],
      })
      .mockResolvedValueOnce({ ...account, password: 'fresh', raw: true })
    await expect(appleIdApi.list('token')).resolves.toEqual({
      items: [account],
    })
    await expect(appleIdApi.reveal('token', account.username)).resolves.toEqual(
      { ...account, password: 'fresh' },
    )
    expect(request).toHaveBeenNthCalledWith(1, '/api/v1/apple-ids', {
      method: 'GET',
      accessToken: 'token',
    })
    expect(request).toHaveBeenNthCalledWith(2, '/api/v1/apple-ids/reveal', {
      method: 'POST',
      accessToken: 'token',
      body: { username: account.username },
    })
  })

  it.each([
    [{ items: [{ ...account, status: 'true' }] }, 'list'],
    [{ ...account, password: '' }, 'reveal'],
    [
      { ...account, username: 'other@example.com', password: 'wrong' },
      'reveal',
    ],
  ] as const)(
    'rejects malformed or mismatched %s responses',
    async (data, operation) => {
      vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(data)
      await expect(
        operation === 'list'
          ? appleIdApi.list('token')
          : appleIdApi.reveal('token', account.username),
      ).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' })
    },
  )

  it('preserves public errors and network failures', async () => {
    const request = vi.spyOn(apiClient, 'authenticatedRequest')
    request.mockRejectedValueOnce(
      new ApiError({
        status: 409,
        code: 'APPLE_ID_ACCOUNT_UNAVAILABLE',
        message: 'Unavailable',
      }),
    )
    await expect(
      appleIdApi.reveal('token', account.username),
    ).rejects.toMatchObject({
      status: 409,
      code: 'APPLE_ID_ACCOUNT_UNAVAILABLE',
    })
    request.mockRejectedValueOnce(
      new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'Network' }),
    )
    await expect(appleIdApi.list('token')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    })
  })
})
