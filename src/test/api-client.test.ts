import { createApiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'
import { describe, expect, it, vi } from 'vitest'

const baseUrl = 'https://gateway.example.com'

describe('API client', () => {
  it('returns data from a success envelope', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: { email: 'user@example.com' },
          requestId: 'req-success',
        }),
        { status: 200 },
      ),
    )
    const client = createApiClient({ baseUrl, fetchImpl })

    await expect(
      client.request<{ email: string }>('/api/v1/me'),
    ).resolves.toEqual({ email: 'user@example.com' })
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL('https://gateway.example.com/api/v1/me'),
      expect.objectContaining({ headers: expect.any(Headers) }),
    )
  })

  it('exposes stable error code and requestId from an error envelope', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: 'AUTH_REQUIRED',
            message: 'Authentication required',
            requestId: 'req-error',
          },
        }),
        { status: 401 },
      ),
    )
    const client = createApiClient({ baseUrl, fetchImpl })

    await expect(client.request('/api/v1/me')).rejects.toMatchObject({
      status: 401,
      code: 'AUTH_REQUIRED',
      requestId: 'req-error',
    } satisfies Partial<ApiError>)
  })

  it('rejects malformed responses without leaking their body', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('<html>upstream error</html>', {
        status: 502,
        headers: { 'x-request-id': 'req-malformed' },
      }),
    )
    const client = createApiClient({ baseUrl, fetchImpl })

    await expect(client.request('/api/v1/products')).rejects.toMatchObject({
      status: 502,
      code: 'MALFORMED_RESPONSE',
      requestId: 'req-malformed',
    } satisfies Partial<ApiError>)
  })
})
