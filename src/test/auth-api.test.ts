import { describe, expect, it, vi } from 'vitest'
import { authApi } from '@/features/auth/auth-api'
import { apiClient } from '@/lib/api/client'

const user = {
  email: 'member@example.com',
  expiresAt: '2030-01-01T00:00:00.000Z',
  status: 'active',
  sessionVersion: '11111111-1111-4111-8111-111111111111',
}

describe('browser session auth API', () => {
  it('initializes the browser then parses only safe login fields', async () => {
    const request = vi
      .spyOn(apiClient, 'request')
      .mockResolvedValueOnce({ ready: true })
      .mockResolvedValueOnce({ ...user, futureField: true })
    await expect(
      authApi.login({ email: user.email, password: 'password123' }),
    ).resolves.toEqual(user)
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      '/api/v1/auth/browser',
      '/api/v1/auth/login',
    ])
    expect(request.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      body: { email: user.email, password: 'password123' },
    })
  })

  it('restores through the same-origin session endpoint without a bearer', async () => {
    const request = vi
      .spyOn(apiClient, 'request')
      .mockResolvedValue({ ...user, futureField: true })
    await expect(authApi.getCurrentUser('')).resolves.toEqual(user)
    expect(request).toHaveBeenCalledWith('/api/v1/auth/session')
  })

  it.each([
    { ...user, status: 'unknown' },
    { ...user, expiresAt: 'not-a-date' },
    { email: user.email, expiresAt: user.expiresAt, status: user.status },
    { accessToken: 'unexpected-upstream-bearer', tokenType: 'Bearer' },
  ])('rejects malformed safe user data', async (payload) => {
    vi.spyOn(apiClient, 'request').mockResolvedValue(payload)
    await expect(authApi.getCurrentUser('')).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    })
  })

  it('requests server-side revocation on logout', async () => {
    const request = vi
      .spyOn(apiClient, 'request')
      .mockResolvedValue({ loggedOut: true })
    await authApi.logout?.()
    expect(request).toHaveBeenCalledWith('/api/v1/auth/logout', {
      method: 'POST',
    })
  })
})
