import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import { onRequest } from '../../functions/api/v1/[[path]]'

describe('Cloudflare Pages API Adapter', () => {
  let globalFetch: Mock
  let consoleSpies: { [key: string]: Mock }

  beforeEach(() => {
    globalFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'req-1',
        },
      }),
    )
    vi.stubGlobal('fetch', globalFetch)

    consoleSpies = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const getEnv = () => ({
    SOLUTION_GATEWAY_ORIGIN: 'https://gateway.example.com',
  })

  it('forwards valid GET /api/v1/ route', async () => {
    const request = new Request('https://aureole.com/api/v1/me', {
      method: 'GET',
      headers: { authorization: 'Bearer token123', accept: 'application/json' },
    })

    const response = await onRequest({ request, env: getEnv() })

    expect(response.status).toBe(200)
    expect(globalFetch).toHaveBeenCalledTimes(1)

    const fetchArgs = globalFetch.mock.calls[0]
    if (!fetchArgs) throw new Error('Expected fetchArgs')
    expect(fetchArgs[0]).toBe('https://gateway.example.com/api/v1/me')
    expect(fetchArgs[1]?.method).toBe('GET')
    expect(fetchArgs[1]?.redirect).toBe('manual')
    expect(fetchArgs[1]?.headers?.get?.('authorization')).toBe(
      'Bearer token123',
    )
    expect(fetchArgs[1]?.headers?.get?.('accept')).toBe('application/json')
    expect(fetchArgs[1]?.body).toBeUndefined()
  })

  it('forwards valid POST with body', async () => {
    const request = new Request('https://aureole.com/api/v1/referrals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'test' }),
    })

    const response = await onRequest({ request, env: getEnv() })

    expect(response.status).toBe(200)
    expect(globalFetch).toHaveBeenCalledTimes(1)

    const fetchArgs = globalFetch.mock.calls[0]
    if (!fetchArgs) throw new Error('Expected fetchArgs')
    expect(fetchArgs[0]).toBe('https://gateway.example.com/api/v1/referrals')
    expect(fetchArgs[1]?.method).toBe('POST')
    expect(fetchArgs[1]?.headers?.get?.('content-type')).toBe(
      'application/json',
    )
    // We can't trivially assert fetchArgs[1].body directly on node Request stream without consuming,
    // but we can check if it is truthy and not undefined since it was forwarded.
    expect(fetchArgs[1]?.body).toBeDefined()
  })

  it('forwards valid PATCH', async () => {
    const request = new Request('https://aureole.com/api/v1/me/preferences', {
      method: 'PATCH',
    })

    const response = await onRequest({ request, env: getEnv() })
    expect(response.status).toBe(200)
    expect(globalFetch).toHaveBeenCalledTimes(1)

    const fetchArgs = globalFetch.mock.calls[0]
    if (!fetchArgs) throw new Error('Expected fetchArgs')
    expect(fetchArgs[0]).toBe(
      'https://gateway.example.com/api/v1/me/preferences',
    )
    expect(fetchArgs[1]?.method).toBe('PATCH')
  })

  it('preserves query string', async () => {
    const request = new Request(
      'https://aureole.com/api/v1/orders?page=2&status=active',
      {
        method: 'GET',
      },
    )

    const response = await onRequest({ request, env: getEnv() })
    expect(response.status).toBe(200)

    const fetchArgs = globalFetch.mock.calls[0]
    if (!fetchArgs) throw new Error('Expected fetchArgs')
    expect(fetchArgs[0]).toBe(
      'https://gateway.example.com/api/v1/orders?page=2&status=active',
    )
  })

  describe('Gateway Configuration Validation', () => {
    it('rejects missing configuration', async () => {
      const request = new Request('https://aureole.com/api/v1/me')
      const response = await onRequest({ request, env: {} })
      expect(response.status).toBe(500)
      expect(globalFetch).not.toHaveBeenCalled()
    })

    it('rejects invalid non-URL', async () => {
      const request = new Request('https://aureole.com/api/v1/me')
      const response = await onRequest({
        request,
        env: { SOLUTION_GATEWAY_ORIGIN: 'not-a-url' },
      })
      expect(response.status).toBe(500)
      expect(globalFetch).not.toHaveBeenCalled()
    })

    it('rejects http:// Gateway', async () => {
      const request = new Request('https://aureole.com/api/v1/me')
      const response = await onRequest({
        request,
        env: { SOLUTION_GATEWAY_ORIGIN: 'http://gateway.example.com' },
      })
      expect(response.status).toBe(500)
      expect(globalFetch).not.toHaveBeenCalled()
    })

    it('rejects credentials in configured origin', async () => {
      const request = new Request('https://aureole.com/api/v1/me')
      const response = await onRequest({
        request,
        env: {
          SOLUTION_GATEWAY_ORIGIN: 'https://user:pass@gateway.example.com',
        },
      })
      expect(response.status).toBe(500)
      expect(globalFetch).not.toHaveBeenCalled()
    })

    it('rejects configured origin path, query, and hash', async () => {
      const request = new Request('https://aureole.com/api/v1/me')

      const res1 = await onRequest({
        request,
        env: { SOLUTION_GATEWAY_ORIGIN: 'https://gateway.example.com/path' },
      })
      expect(res1.status).toBe(500)

      const res2 = await onRequest({
        request,
        env: { SOLUTION_GATEWAY_ORIGIN: 'https://gateway.example.com?q=1' },
      })
      expect(res2.status).toBe(500)

      const res3 = await onRequest({
        request,
        env: { SOLUTION_GATEWAY_ORIGIN: 'https://gateway.example.com#hash' },
      })
      expect(res3.status).toBe(500)

      expect(globalFetch).not.toHaveBeenCalled()
    })
  })

  describe('Method Policy Validation', () => {
    const unsupportedMethods = ['OPTIONS', 'HEAD', 'PUT', 'DELETE']

    for (const method of unsupportedMethods) {
      it(`rejects unsupported HTTP method: ${method}`, async () => {
        const request = new Request('https://aureole.com/api/v1/me', { method })
        const response = await onRequest({ request, env: getEnv() })

        expect(response.status).toBe(405)
        expect(globalFetch).not.toHaveBeenCalled()
      })
    }
  })

  describe('Header Policy Validation', () => {
    it('does not forward disallowed Request headers', async () => {
      const request = new Request('https://aureole.com/api/v1/me', {
        method: 'GET',
        headers: {
          authorization: 'Bearer token123',
          cookie: 'session=123',
          'proxy-authorization': 'Basic aaaa',
          'x-forwarded-for': '1.2.3.4',
          'cf-connecting-ip': '1.2.3.4',
        },
      })

      await onRequest({ request, env: getEnv() })

      const fetchArgs = globalFetch.mock.calls[0]
      if (!fetchArgs) throw new Error('Expected fetchArgs')
      expect(fetchArgs[1]?.headers?.has?.('cookie')).toBe(false)
      expect(fetchArgs[1]?.headers?.has?.('proxy-authorization')).toBe(false)
      expect(fetchArgs[1]?.headers?.has?.('x-forwarded-for')).toBe(false)
      expect(fetchArgs[1]?.headers?.has?.('cf-connecting-ip')).toBe(false)

      // Kept authorization
      expect(fetchArgs[1]?.headers?.has?.('authorization')).toBe(true)
    })

    it('preserves configured safe response headers only', async () => {
      globalFetch.mockResolvedValueOnce(
        new Response('{}', {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'cache-control': 'no-store',
            'x-request-id': 'req-1',
            'set-cookie': 'secret=123',
            server: 'nginx',
          },
        }),
      )

      const request = new Request('https://aureole.com/api/v1/me')
      const response = await onRequest({ request, env: getEnv() })

      expect(response.headers.get('content-type')).toBe('application/json')
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(response.headers.get('x-request-id')).toBe('req-1')
      expect(response.headers.has('set-cookie')).toBe(false)
      expect(response.headers.has('server')).toBe(false)
    })
  })

  describe('Open Proxy and Path Escapes', () => {
    const escapingUrls = [
      'https://aureole.com/api/v1/../x',
      'https://aureole.com/api/v1/../../secret',
      'https://aureole.com/api/v1/%2e%2e/x',
      'https://aureole.com/api/v1/%2E%2E/x',
      'https://aureole.com/api/v1/%2e%2e/%2e%2e/x',
      'https://aureole.com/api/v1',
    ]

    for (const url of escapingUrls) {
      it(`rejects path escape attempt: ${url}`, async () => {
        const request = new Request(url, { method: 'GET' })
        const response = await onRequest({ request, env: getEnv() })

        expect(response.status).toBe(400)
        expect(globalFetch).not.toHaveBeenCalled()
      })
    }

    const fakeEscapes = [
      'https://aureole.com/api/v1/http://evil.com',
      'https://aureole.com/api/v1///evil.com',
    ]

    for (const url of fakeEscapes) {
      it(`safely confines fake absolute escape attempt: ${url}`, async () => {
        const request = new Request(url, { method: 'GET' })
        const response = await onRequest({ request, env: getEnv() })

        // These don't escape URL normalization. We verify they stay on gateway origin.
        if (response.status === 200) {
          expect(globalFetch).toHaveBeenCalledTimes(1)
          const fetchArgs = globalFetch.mock.calls[0]
          if (!fetchArgs) throw new Error('Expected fetchArgs')

          const calledUrl = new URL(fetchArgs[0])
          expect(calledUrl.origin).toBe('https://gateway.example.com')
          expect(calledUrl.pathname.startsWith('/api/v1/')).toBe(true)
        } else {
          expect(response.status).toBe(400)
          expect(globalFetch).not.toHaveBeenCalled()
        }
      })
    }
  })

  it('does not automatically follow upstream redirects (Credential Safety)', async () => {
    globalFetch.mockResolvedValueOnce(
      new Response('', {
        status: 302,
        headers: { location: 'https://evil.example/steal' },
      }),
    )

    const request = new Request('https://aureole.com/api/v1/me', {
      method: 'GET',
      headers: { authorization: 'Bearer sentinel-token' },
    })

    const response = await onRequest({ request, env: getEnv() })

    expect(globalFetch).toHaveBeenCalledTimes(1)

    const fetchArgs = globalFetch.mock.calls[0]
    if (!fetchArgs) throw new Error('Expected fetchArgs')
    expect(fetchArgs[0]).toBe('https://gateway.example.com/api/v1/me')
    expect(fetchArgs[1]?.redirect).toBe('manual')

    expect(response.status).toBe(302)
    // Ensure no manual following behavior occurred
    expect(globalFetch).toHaveBeenCalledTimes(1)
  })

  it('does not log credentials or bodies', async () => {
    const request = new Request('https://aureole.com/api/v1/referrals', {
      method: 'POST',
      headers: {
        authorization: 'Bearer sentinel-secret-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ secretPayload: 'sentinel-secret-value' }),
    })

    await onRequest({ request, env: getEnv() })

    expect(consoleSpies.log).not.toHaveBeenCalled()
    expect(consoleSpies.info).not.toHaveBeenCalled()
    expect(consoleSpies.warn).not.toHaveBeenCalled()
    expect(consoleSpies.error).not.toHaveBeenCalled()
  })
})
