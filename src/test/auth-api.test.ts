import { describe, expect, it, vi } from 'vitest'
import { authApi } from '@/features/auth/auth-api'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

describe('Auth response compatibility', () => {
  it('accepts and strips additive Login response fields', async () => {
    vi.spyOn(apiClient, 'request').mockResolvedValue({
      accessToken: 'opaque-session-token',
      tokenType: 'Bearer',
      futureUnknownField: { enabled: true },
    })

    await expect(
      authApi.login({
        email: 'member@example.com',
        password: 'password123',
      }),
    ).resolves.toEqual({
      accessToken: 'opaque-session-token',
      tokenType: 'Bearer',
    })
  })

  it('accepts and strips additive /me response fields', async () => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue({
      email: 'member@example.com',
      expiresAt: '2030-01-01T00:00:00.000Z',
      status: 'active',
      futureUnknownField: 'ignored',
    })

    await expect(
      authApi.getCurrentUser('opaque-session-token'),
    ).resolves.toEqual({
      email: 'member@example.com',
      expiresAt: '2030-01-01T00:00:00.000Z',
      status: 'active',
    })
  })

  it('still rejects an invalid known Login token type', async () => {
    vi.spyOn(apiClient, 'request').mockResolvedValue({
      accessToken: 'opaque-session-token',
      tokenType: 'Basic',
      futureUnknownField: 'ignored',
    })

    await expect(
      authApi.login({
        email: 'member@example.com',
        password: 'password123',
      }),
    ).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })

  it.each([
    ['status', 'unknown', '2030-01-01T00:00:00.000Z'],
    ['expiresAt', 'active', 'not-a-date'],
  ])('still rejects an invalid known /me %s', async (_, status, expiresAt) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue({
      email: 'member@example.com',
      expiresAt,
      status,
      futureUnknownField: 'ignored',
    })

    await expect(
      authApi.getCurrentUser('opaque-session-token'),
    ).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })
})
