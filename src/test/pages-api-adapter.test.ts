import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import { onRequest } from '../../functions/api/v1/[[path]]'

describe('Cloudflare Pages API Adapter', () => {
  let globalFetch: Mock

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
  })

  afterEach(() => {
    vi.unstubAllGlobals()
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

  it('requires configured HTTPS origin', async () => {
    const request = new Request('https://aureole.com/api/v1/me')

    // HTTP
    const response1 = await onRequest({
      request,
      env: { SOLUTION_GATEWAY_ORIGIN: 'http://gateway.com' },
    })
    expect(response1.status).toBe(500)
    expect(globalFetch).not.toHaveBeenCalled()

    // Missing
    const response2 = await onRequest({ request, env: {} })
    expect(response2.status).toBe(500)

    // Invalid format
    const response3 = await onRequest({
      request,
      env: { SOLUTION_GATEWAY_ORIGIN: 'not-a-url' },
    })
    expect(response3.status).toBe(500)
  })

  it('rejects credentials in configured origin', async () => {
    const request = new Request('https://aureole.com/api/v1/me')
    const response = await onRequest({
      request,
      env: { SOLUTION_GATEWAY_ORIGIN: 'https://user:pass@gateway.com' },
    })
    expect(response.status).toBe(500)
    expect(globalFetch).not.toHaveBeenCalled()
  })

  it('rejects configured origin path, query, and hash', async () => {
    const request = new Request('https://aureole.com/api/v1/me')

    const res1 = await onRequest({
      request,
      env: { SOLUTION_GATEWAY_ORIGIN: 'https://gateway.com/path' },
    })
    expect(res1.status).toBe(500)

    const res2 = await onRequest({
      request,
      env: { SOLUTION_GATEWAY_ORIGIN: 'https://gateway.com?q=1' },
    })
    expect(res2.status).toBe(500)

    const res3 = await onRequest({
      request,
      env: { SOLUTION_GATEWAY_ORIGIN: 'https://gateway.com#hash' },
    })
    expect(res3.status).toBe(500)

    expect(globalFetch).not.toHaveBeenCalled()
  })

  it('dot-segment/path normalization cannot escape /api/v1/', async () => {
    const request = new Request('https://aureole.com/api/v1/../../secret', {
      method: 'GET',
    })
    const response = await onRequest({ request, env: getEnv() })

    expect(response.status).toBe(400)
    expect(globalFetch).not.toHaveBeenCalled()
  })

  it('rejects unsupported HTTP method', async () => {
    const request = new Request('https://aureole.com/api/v1/me', {
      method: 'DELETE',
    })
    const response = await onRequest({ request, env: getEnv() })

    expect(response.status).toBe(405)
    expect(globalFetch).not.toHaveBeenCalled()
  })

  it('does not forward unrelated Cookie header', async () => {
    const request = new Request('https://aureole.com/api/v1/me', {
      method: 'GET',
      headers: { cookie: 'session=123', authorization: 'Bearer 123' },
    })

    await onRequest({ request, env: getEnv() })

    const fetchArgs = globalFetch.mock.calls[0]
    if (!fetchArgs) throw new Error('Expected fetchArgs')
    expect(fetchArgs[1]?.headers?.has?.('cookie')).toBe(false)
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
