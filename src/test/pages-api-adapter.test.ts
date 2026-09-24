import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onRequest } from '../../functions/api/v1/[[path]]'

const env = { SOLUTION_GATEWAY_ORIGIN: 'https://gateway.example.com' }
const origin = 'https://aureole.example'

function request(path: string, options: RequestInit = {}) {
  return new Request(`${origin}/api/v1/${path}`, options)
}

describe('Cloudflare Pages same-origin API boundary', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{}', {
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'req-1',
            'set-cookie': 'upstream-secret=untrusted',
            server: 'upstream',
          },
        }),
      ),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('forwards only allowlisted public reads and query parameters', async () => {
    const response = await onRequest({
      request: request('config/runtime?locale=en', {
        headers: {
          accept: 'application/json',
          cookie: 'private=secret',
          'x-test-secret': 'secret',
        },
      }),
      env,
    })
    expect(response.status).toBe(200)
    const fetchMock = vi.mocked(fetch)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [target, init] = fetchMock.mock.calls[0]!
    expect(String(target)).toBe(
      'https://gateway.example.com/api/v1/config/runtime?locale=en',
    )
    expect(init?.redirect).toBe('manual')
    expect(new Headers(init?.headers).get('accept')).toBe('application/json')
    expect(new Headers(init?.headers).has('cookie')).toBe(false)
    expect(new Headers(init?.headers).has('x-test-secret')).toBe(false)
    expect(new Headers(init?.headers).has('authorization')).toBe(false)
    expect(response.headers.get('x-request-id')).toBe('req-1')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.has('set-cookie')).toBe(false)
    expect(response.headers.has('server')).toBe(false)
  })

  it('forwards public POST body only with exact same-origin CSRF signals', async () => {
    const response = await onRequest({
      request: request('auth/email-code', {
        method: 'POST',
        headers: {
          origin,
          'content-type': 'application/json',
          'sec-fetch-site': 'same-origin',
        },
        body: JSON.stringify({ email: 'member@example.com' }),
      }),
      env,
    })
    expect(response.status).toBe(200)
    const [, init] = vi.mocked(fetch).mock.calls[0]!
    expect(init?.method).toBe('POST')
    expect(init?.body).toBeDefined()
    expect(new Headers(init?.headers).has('origin')).toBe(false)
  })

  it.each([
    {},
    { origin: 'https://evil.example' },
    { origin, 'sec-fetch-site': 'cross-site' },
  ])('rejects missing or conflicting CSRF signals', async (headers) => {
    const response = await onRequest({
      request: request('auth/email-code', {
        method: 'POST',
        headers: new Headers(headers as Record<string, string>),
      }),
      env,
    })
    expect(response.status).toBe(403)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects a legacy bearer on public and protected routes', async () => {
    for (const path of ['me', 'config/runtime']) {
      const response = await onRequest({
        request: request(path, { headers: { authorization: 'Bearer legacy' } }),
        env,
      })
      expect(response.status).toBe(401)
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('requires a server session for private routes', async () => {
    for (const path of [
      'me',
      'wallet',
      'orders?page=2',
      'tickets',
      'subscription/overview',
    ]) {
      const response = await onRequest({
        request: request(path, { headers: { cookie: 'legacy=untrusted' } }),
        env,
      })
      expect(response.status).toBe(401)
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('permits optional announcements without a session', async () => {
    expect(
      (await onRequest({ request: request('announcements'), env })).status,
    ).toBe(200)
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('does not forward unknown or disallowed methods', async () => {
    for (const method of ['HEAD', 'OPTIONS', 'PUT', 'DELETE']) {
      expect(
        (await onRequest({ request: request('me', { method }), env })).status,
      ).toBe(405)
    }
    expect(
      (await onRequest({ request: request('unlisted'), env })).status,
    ).toBe(404)
    expect(
      (
        await onRequest({
          request: request('config/support-widget'),
          env,
        })
      ).status,
    ).toBe(404)
    expect(
      (
        await onRequest({
          request: request('referrals', {
            method: 'POST',
            headers: { origin },
          }),
          env,
        })
      ).status,
    ).toBe(404)
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    'https://aureole.example/api/v1/../x',
    'https://aureole.example/api/v1/%2e%2e/x',
    'https://aureole.example/api/v1/http://evil.example',
    'https://aureole.example/api/v1///evil.example',
    'https://aureole.example/api/v1/%2fme',
  ])('rejects path escapes or unsupported paths: %s', async (url) => {
    expect((await onRequest({ request: new Request(url), env })).status).toBe(
      404,
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    undefined,
    'not-a-url',
    'http://gateway.example.com',
    'https://user:pass@gateway.example.com',
    'https://gateway.example.com/path',
    'https://gateway.example.com/?q=1',
  ])(
    'fails closed for a missing or invalid gateway origin',
    async (configured) => {
      expect(
        (
          await onRequest({
            request: request('config/runtime'),
            env: { SOLUTION_GATEWAY_ORIGIN: configured },
          })
        ).status,
      ).toBe(500)
      expect(fetch).not.toHaveBeenCalled()
    },
  )

  it('does not follow or expose an upstream redirect', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: 'https://evil.example/' },
      }),
    )
    const response = await onRequest({
      request: request('config/runtime'),
      env,
    })
    expect(response.status).toBe(302)
    expect(response.headers.has('location')).toBe(false)
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.redirect).toBe('manual')
    expect(fetch).toHaveBeenCalledOnce()
  })
})
