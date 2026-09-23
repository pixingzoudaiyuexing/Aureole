import { describe, expect, it, vi } from 'vitest'
import { supportWidgetApi } from '@/features/support-widget/support-widget-api'
import { createApiClient, apiClient } from '@/lib/api/client'

const validId = '12345678-1234-1234-1234-123456789abc'
const response = (data: unknown) => ({ ok: true, data, requestId: 'req-1' })

describe('support widget public contract', () => {
  it.each([
    [{ crisp: { enabled: false } }, { crisp: { enabled: false } }],
    [
      { crisp: { enabled: true, websiteId: validId } },
      { crisp: { enabled: true, websiteId: validId } },
    ],
  ])('accepts the exact Crisp DTO', async (data, expected) => {
    vi.spyOn(apiClient, 'strictPublicRequest').mockResolvedValueOnce(expected)
    await expect(supportWidgetApi.getConfig()).resolves.toEqual(expected)
    expect(data).toEqual(expected)
  })

  it.each([
    {},
    { crisp: { enabled: false, websiteId: validId } },
    { crisp: { enabled: true } },
    { crisp: { enabled: true, websiteId: 'not-an-id' } },
    { crisp: { enabled: true, websiteId: validId }, chatwoot: {} },
    {
      crisp: {
        enabled: true,
        websiteId: validId,
        scriptUrl: 'https://example.com',
      },
    },
    { crisp: { enabled: 'true', websiteId: validId } },
  ])('rejects invalid or additional provider data', async (data) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify(response(data)), { status: 200 }),
      )
    const client = createApiClient({
      baseUrl: window.location.origin,
      fetchImpl,
    })
    vi.spyOn(apiClient, 'strictPublicRequest').mockImplementationOnce(
      client.strictPublicRequest,
    )
    await expect(supportWidgetApi.getConfig()).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    })
  })

  it.each([
    { ok: true, data: { crisp: { enabled: false } } },
    { ...response({ crisp: { enabled: false } }), extra: 1 },
    { ...response({ crisp: { enabled: false } }), requestId: 1 },
  ])('rejects incomplete or extended envelopes', async (payload) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }))
    const client = createApiClient({
      baseUrl: window.location.origin,
      fetchImpl,
    })
    vi.spyOn(apiClient, 'strictPublicRequest').mockImplementationOnce(
      client.strictPublicRequest,
    )
    await expect(supportWidgetApi.getConfig()).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    })
  })

  it('sends no bearer and uses same-origin credentials for guest and signed-in state', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () =>
          new Response(
            JSON.stringify(response({ crisp: { enabled: false } })),
            { status: 200 },
          ),
      )
    const client = createApiClient({
      baseUrl: window.location.origin,
      fetchImpl,
    })
    vi.spyOn(apiClient, 'strictPublicRequest').mockImplementation(
      client.strictPublicRequest,
    )
    await supportWidgetApi.getConfig()
    await supportWidgetApi.getConfig()
    for (const [url, init] of fetchImpl.mock.calls) {
      expect(url).toEqual(
        new URL('/api/v1/config/support-widget', window.location.origin),
      )
      expect(new Headers(init?.headers).has('authorization')).toBe(false)
      expect(init?.credentials).toBe('same-origin')
    }
  })

  it('fails closed on public errors, network failures and malformed JSON', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: false,
            error: { code: 'UNAVAILABLE', message: 'Unavailable' },
          }),
          { status: 503 },
        ),
      )
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response('not json', { status: 200 }))
    const client = createApiClient({
      baseUrl: window.location.origin,
      fetchImpl,
    })
    vi.spyOn(apiClient, 'strictPublicRequest').mockImplementation(
      client.strictPublicRequest,
    )
    await expect(supportWidgetApi.getConfig()).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    })
    await expect(supportWidgetApi.getConfig()).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    })
    await expect(supportWidgetApi.getConfig()).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    })
  })
})
