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

  it.each([
    [401, 'AUTH_REQUIRED', 'Authentication required', 'req-auth'],
    [422, 'VALIDATION_ERROR', 'Invalid request', 'req-validation'],
    [500, 'UPSTREAM_ERROR', 'Upstream service failed', 'req-upstream'],
  ])(
    'exposes stable boundary fields for a %i solution error',
    async (status, code, message, requestId) => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            error: { code, message, requestId },
          }),
          { status },
        ),
      )
      const client = createApiClient({ baseUrl, fetchImpl })

      await expect(client.request('/api/v1/me')).rejects.toMatchObject({
        status,
        code,
        message,
        requestId,
      } satisfies Partial<ApiError>)
    },
  )

  it('rejects malformed JSON through the API boundary', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('<html>upstream error</html>', {
        status: 502,
        headers: { 'x-request-id': 'req-malformed' },
      }),
    )
    const client = createApiClient({ baseUrl, fetchImpl })

    await expect(client.request('/api/v1/products')).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ApiError &&
        error.status === 502 &&
        error.code === 'MALFORMED_RESPONSE' &&
        error.requestId === 'req-malformed' &&
        error.message !== 'Unexpected token < in JSON at position 0',
    )
  })

  it('rejects valid JSON that is not a solution envelope', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ foo: 'bar' }), { status: 200 }),
      )
    const client = createApiClient({ baseUrl, fetchImpl })

    await expect(client.request('/api/v1/products')).rejects.toMatchObject({
      status: 200,
      code: 'MALFORMED_RESPONSE',
      message: 'The public API returned an invalid response',
    } satisfies Partial<ApiError>)
  })

  it('converts a network rejection into a distinguishable ApiError', async () => {
    const networkFailure = new TypeError('Failed to fetch')
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(networkFailure)
    const client = createApiClient({ baseUrl, fetchImpl })

    await expect(client.request('/api/v1/products')).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Unable to reach the public API',
      cause: networkFailure,
    } satisfies Partial<ApiError>)
  })
})
