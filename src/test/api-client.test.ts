import { createApiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'
import { describe, expect, it, vi } from 'vitest'

const baseUrl = 'https://gateway.example.com'

describe('API client', () => {
  it('falls back to window.location.origin when baseUrl is absent', async () => {
    const originalWindow = globalThis.window;
    globalThis.window = { location: { origin: 'https://same-origin.example.com' } } as any;

    try {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            data: { email: 'user@example.com' },
          }),
          { status: 200 },
        ),
      );
      // Pass explicitly undefined to trigger fallback
      const client = createApiClient({ baseUrl: undefined, fetchImpl });

      await expect(client.request<{ email: string }>('/api/v1/me')).resolves.toEqual({ email: 'user@example.com' });
      expect(fetchImpl).toHaveBeenCalledWith(
        new URL('https://same-origin.example.com/api/v1/me'),
        expect.objectContaining({ headers: expect.any(Headers) }),
      );
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it.each([
    ['invalid-url', undefined],
    ['ftp://example.com', undefined],
    ['https://user:pass@example.com', undefined],
    ['/api/v1', undefined],
  ])('rejects invalid or unsafe baseUrl overrides: %s', async (invalidUrl) => {
    const fetchImpl = vi.fn<typeof fetch>();
    const client = createApiClient({ baseUrl: invalidUrl, fetchImpl });

    await expect(client.request('/api/v1/me')).rejects.toMatchObject({
      code: 'API_BASE_URL_MISSING',
      status: 0,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

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
    const headers = new Headers(fetchImpl.mock.calls[0]?.[1]?.headers)
    expect(headers.has('authorization')).toBe(false)
    expect(fetchImpl.mock.calls[0]?.[1]?.redirect).toBe('error')
  })

  it('adds a bearer only through the authenticated request boundary', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: { status: 'active' } }), {
        status: 200,
      }),
    )
    const client = createApiClient({ baseUrl, fetchImpl })

    await client.authenticatedRequest('/api/v1/me', {
      accessToken: 'opaque-session-token',
    })

    const [url, init] = fetchImpl.mock.calls[0] ?? []
    const headers = new Headers(init?.headers)
    expect(url).toEqual(new URL('https://gateway.example.com/api/v1/me'))
    expect(headers.get('authorization')).toBe('Bearer opaque-session-token')
    expect(init?.redirect).toBe('error')
  })

  it('rejects manually supplied authorization headers', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const client = createApiClient({ baseUrl, fetchImpl })

    await expect(
      client.request('/api/v1/me', {
        headers: { authorization: 'Bearer bypass' },
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_AUTH_HEADER',
      status: 0,
    } satisfies Partial<ApiError>)
    expect(fetchImpl).not.toHaveBeenCalled()
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
