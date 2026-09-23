import { describe, expect, it, vi } from 'vitest'
import { onRequest } from '../../functions/api/v1/[[path]]'

const env = { SOLUTION_GATEWAY_ORIGIN: 'https://gateway.example.com' }

describe('support widget Pages allowlist', () => {
  it('allows only the exact anonymous GET and never forwards browser credentials', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            data: { crisp: { enabled: false } },
            requestId: 'req-1',
          }),
          {
            headers: {
              'content-type': 'application/json',
              'set-cookie': 'not-forwarded',
            },
          },
        ),
    )
    vi.stubGlobal('fetch', fetchImpl)
    try {
      for (const cookie of ['', 'aureole-session=fake']) {
        const response = await onRequest({
          request: new Request(
            'https://site.example/api/v1/config/support-widget',
            {
              headers: cookie ? { cookie } : {},
            },
          ),
          env,
        })
        expect(response.status).toBe(200)
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(response.headers.has('set-cookie')).toBe(false)
      }
      expect(fetchImpl).toHaveBeenCalledTimes(2)
      for (const [url, init] of fetchImpl.mock.calls) {
        expect(url).toEqual(
          new URL('/api/v1/config/support-widget', env.SOLUTION_GATEWAY_ORIGIN),
        )
        expect(new Headers(init?.headers).has('authorization')).toBe(false)
        expect(new Headers(init?.headers).has('cookie')).toBe(false)
      }
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it.each([
    ['GET', '/api/v1/config/support-widget/'],
    ['GET', '/api/v1/config/other'],
    ['POST', '/api/v1/config/support-widget'],
    ['GET', '/api/v1/me'],
  ])(
    'does not open adjacent or protected endpoints: %s %s',
    async (method, path) => {
      const fetchImpl = vi.fn<typeof fetch>()
      vi.stubGlobal('fetch', fetchImpl)
      try {
        const response = await onRequest({
          request: new Request(`https://site.example${path}`, { method }),
          env,
        })
        expect(response.status).toBe(
          method === 'GET' && path === '/api/v1/me'
            ? 401
            : method === 'POST'
              ? 403
              : 404,
        )
        expect(fetchImpl).not.toHaveBeenCalled()
      } finally {
        vi.unstubAllGlobals()
      }
    },
  )

  it('rejects manually supplied Authorization on the public path', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchImpl)
    try {
      const response = await onRequest({
        request: new Request(
          'https://site.example/api/v1/config/support-widget',
          {
            headers: { authorization: 'Bearer forbidden' },
          },
        ),
        env,
      })
      expect(response.status).toBe(401)
      expect(fetchImpl).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
