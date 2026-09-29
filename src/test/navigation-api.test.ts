import { beforeEach, describe, expect, it, vi } from 'vitest'
import { navigationApi } from '@/features/navigation/navigation-api'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const core = { kind: 'core', targetId: 'dashboard', label: 'Overview' }
const custom = { kind: 'custom-page', itemId: 'test-page', label: 'TEST Page' }

describe('Navigation API', () => {
  beforeEach(() => vi.mocked(navigationApi.getList).mockRestore())
  it('uses the existing authenticated request and accepts known and future semantic targets', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({
        items: [
          core,
          custom,
          { kind: 'core', targetId: 'future-target', label: 'Future' },
        ],
      })
    await expect(navigationApi.getList('session')).resolves.toEqual({
      items: [
        core,
        custom,
        { kind: 'core', targetId: 'future-target', label: 'Future' },
      ],
    })
    expect(request).toHaveBeenCalledWith('/api/v1/navigation', {
      method: 'GET',
      accessToken: 'session',
    })
    expect(vi.spyOn(apiClient, 'request')).not.toHaveBeenCalled()
  })

  it.each([
    null,
    {},
    { items: 'not-array' },
    { items: [{ ...core, label: '' }] },
    { items: [{ ...core, label: ' Overview' }] },
    { items: [{ ...core, label: 'x'.repeat(121) }] },
    { items: [{ ...core, label: '<Overview>' }] },
    { items: [{ ...core, label: 'Overview\n' }] },
    { items: [{ ...core, label: 'Over\u0085view' }] },
    { items: [{ kind: 'core', label: 'Missing ID' }] },
    { items: [{ ...custom, itemId: 'Bad_ID' }] },
    { items: [{ ...custom, itemId: 'bad--id' }] },
    { items: [{ ...custom, label: '  TEST Page' }] },
    { items: [core, core] },
    { items: [custom, custom] },
    { items: [{ ...core, route: '/support' }] },
    { items: [{ ...core, path: '/settings' }] },
    { items: [{ ...core, href: 'https://evil.example' }] },
    { items: [{ ...custom, mode: 'external', url: 'https://evil.example' }] },
  ])('rejects malformed or ambiguous successful DTO %#', async (payload) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(payload)
    await expect(navigationApi.getList('session')).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    })
  })

  it('preserves auth and transient API failures for the shared session handler', async () => {
    const request = vi.spyOn(apiClient, 'authenticatedRequest')
    for (const error of [
      new ApiError({ status: 401, code: 'AUTH_FAILED', message: 'Expired' }),
      new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'Offline' }),
    ]) {
      request.mockRejectedValueOnce(error)
      await expect(navigationApi.getList('session')).rejects.toBe(error)
    }
  })
})
