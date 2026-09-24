import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onRequest } from '../../functions/api/v1/[[path]]'
import {
  COOKIE_NAME,
  FAMILY_COOKIE_NAME,
  type SessionDatabase,
} from '../../functions/api/v1/session'

type Row = Record<string, unknown>

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function database(
  options: { failSessionInsert?: boolean } = {},
): SessionDatabase {
  const rows = new Map<string, Row>()
  const families = new Map<
    string,
    { intent_epoch: number; current_session_id_hash: string | null }
  >()
  const db: SessionDatabase = {
    withSession: () => db,
    async batch(statements) {
      const results = []
      for (const statement of statements)
        results.push(
          await (
            statement as {
              run(): Promise<{ success: boolean; meta?: { changes?: number } }>
            }
          ).run(),
        )
      return results
    },
    prepare(query) {
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              if (query.startsWith('UPDATE auth_families')) {
                const family = families.get(values[0] as string)
                if (!family) return null
                family.intent_epoch++
                return { intent_epoch: family.intent_epoch } as T
              }
              const row = rows.get(values[0] as string)
              const family = families.get(row?.family_id as string)
              return (
                row && family?.current_session_id_hash === values[0]
                  ? row
                  : null
              ) as T | null
            },
            async run() {
              let changes = 0
              if (query.startsWith('INSERT INTO auth_sessions')) {
                if (options.failSessionInsert)
                  throw new Error('simulated insert failure')
                const family = families.get(values[7] as string)
                if (family?.current_session_id_hash === values[8]) {
                  rows.set(values[0] as string, {
                    encrypted_upstream_token: values[1],
                    encryption_nonce: values[2],
                    encryption_key_version: 1,
                    expires_at: values[4],
                    revoked_at: null,
                    family_id: values[5],
                    public_version: values[6],
                  })
                  changes = 1
                }
              } else if (
                query.startsWith('INSERT OR IGNORE INTO auth_families')
              ) {
                if (!families.has(values[0] as string)) {
                  families.set(values[0] as string, {
                    intent_epoch: 0,
                    current_session_id_hash: null,
                  })
                  changes = 1
                }
              } else if (
                query.startsWith(
                  'UPDATE auth_families SET current_session_id_hash = ?',
                )
              ) {
                const family = families.get(values[1] as string)
                if (family && family.intent_epoch === values[2]) {
                  family.current_session_id_hash = values[0] as string
                  changes = 1
                }
              } else if (
                query.startsWith(
                  'UPDATE auth_families SET current_session_id_hash = NULL',
                )
              ) {
                const family = families.get(values[0] as string)
                if (family && family.current_session_id_hash === values[1]) {
                  family.current_session_id_hash = null
                  family.intent_epoch++
                  changes = 1
                }
              } else if (query.startsWith('UPDATE auth_sessions')) {
                const row = rows.get(values[1] as string)
                if (
                  row &&
                  row.family_id === values[2] &&
                  row.revoked_at === null
                ) {
                  row.revoked_at = values[0]
                  changes = 1
                }
              }
              return { success: true, meta: { changes } }
            },
          }
        },
      }
    },
  }
  return db
}

function applyResponse(jar: Map<string, string>, response: Response) {
  for (const header of response.headers.getSetCookie()) {
    const [pair, ...attributes] = header.split(';').map((part) => part.trim())
    const separator = pair!.indexOf('=')
    const name = pair!.slice(0, separator)
    if (attributes.some((part) => part.toLowerCase() === 'max-age=0'))
      jar.delete(name)
    else jar.set(name, pair!.slice(separator + 1))
  }
}

function cookieHeader(jar: Map<string, string>) {
  return Array.from(jar, ([name, value]) => `${name}=${value}`).join('; ')
}

function request(path: string, jar: Map<string, string>, method = 'GET') {
  return new Request(`https://cc-aureole-stg.pages.dev/api/v1/${path}`, {
    method,
    headers: {
      ...(method !== 'GET'
        ? { origin: 'https://cc-aureole-stg.pages.dev' }
        : {}),
      ...(jar.size ? { cookie: cookieHeader(jar) } : {}),
    },
  })
}

const loginResponse = (token: string) =>
  new Response(
    JSON.stringify({
      ok: true,
      data: { accessToken: token, tokenType: 'Bearer' },
    }),
  )
const userResponse = (token: string) =>
  new Response(
    JSON.stringify({
      ok: true,
      data: {
        email: `${token}@example.com`,
        expiresAt: null,
        status: 'active',
      },
    }),
  )

describe('fixed-cookie server session protocol', () => {
  const env = {
    SOLUTION_GATEWAY_ORIGIN: 'https://gateway.example.com',
    AUREOLE_SESSION_ENCRYPTION_KEY: '',
    AUREOLE_SESSION_DB: database(),
  }

  beforeEach(() => {
    env.AUREOLE_SESSION_DB = database()
    env.AUREOLE_SESSION_ENCRYPTION_KEY = btoa(
      String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  })
  afterEach(() => vi.unstubAllGlobals())

  it.each([
    ['微信', '3', 'qrcode'],
    ['支付宝', '4', 'redirect'],
  ] as const)(
    'forwards the trusted checkout origin and preserves the %s payment action',
    async (_channel, paymentMethodId, actionType) => {
      const site = 'https://cc-aureole-stg.pages.dev'
      const paymentData =
        actionType === 'qrcode' ? 'opaque-payment-qr' : 'https://pay.example'
      let forwardedBody: unknown
      const fetchImpl = vi.fn().mockImplementation((target: URL) => {
        const path = new URL(String(target)).pathname
        if (path.endsWith('/auth/login')) return loginResponse('session-token')
        if (path.endsWith('/me')) return userResponse('session-token')
        if (path.endsWith('/orders'))
          return new Response(JSON.stringify({ ok: true, data: [] }))
        if (path.endsWith('/checkout')) {
          const requestInit = fetchImpl.mock.calls.at(-1)?.[1] as RequestInit
          const body = requestInit.body
          if (typeof body === 'string') forwardedBody = JSON.parse(body)
          else if (body instanceof ReadableStream)
            void new Response(body)
              .text()
              .then((value) => (forwardedBody = JSON.parse(value)))
          return new Response(
            JSON.stringify({
              ok: true,
              data:
                actionType === 'qrcode'
                  ? { type: actionType, data: paymentData }
                  : { type: actionType, target: paymentData },
            }),
            {
              headers: {
                'content-type': 'application/json',
                'x-request-id': 'checkout-request',
              },
            },
          )
        }
        throw new Error('Unexpected upstream request')
      })
      vi.stubGlobal('fetch', fetchImpl)
      const jar = new Map<string, string>()
      applyResponse(
        jar,
        await onRequest({ request: request('auth/browser', jar), env }),
      )
      applyResponse(
        jar,
        await onRequest({ request: request('auth/login', jar, 'POST'), env }),
      )

      const checkout = () =>
        new Request(`${site}/api/v1/orders/order-1/checkout`, {
          method: 'POST',
          headers: {
            origin: site,
            'sec-fetch-site': 'same-origin',
            'user-agent': 'Test browser',
            cookie: cookieHeader(jar),
            'content-type': 'application/json',
          },
          body: JSON.stringify({ paymentMethodId }),
        })
      const response = await onRequest({ request: checkout(), env })
      expect(response.status).toBe(200)
      expect(response.headers.get('x-request-id')).toBe('checkout-request')
      expect(await response.json()).toEqual({
        ok: true,
        data:
          actionType === 'qrcode'
            ? { type: actionType, data: paymentData }
            : { type: actionType, target: paymentData },
      })
      const [, init] = fetchImpl.mock.calls.at(-1)!
      const headers = new Headers(init.headers)
      await vi.waitFor(() => expect(forwardedBody).toEqual({ paymentMethodId }))
      expect(headers.get('origin')).toBe(site)
      expect(headers.get('authorization')).toBe('Bearer session-token')
      expect(headers.get('user-agent')).toBe('Test browser')
      expect(headers.has('cookie')).toBe(false)
      expect(init.redirect).toBe('manual')

      const ordinaryOrder = await onRequest({
        request: request('orders', jar),
        env,
      })
      expect(ordinaryOrder.status).toBe(200)
      const ordinaryHeaders = new Headers(
        fetchImpl.mock.calls.at(-1)![1].headers,
      )
      expect(ordinaryHeaders.has('origin')).toBe(false)
      expect(ordinaryHeaders.get('authorization')).toBe('Bearer session-token')

      for (const headers of [
        { origin: 'https://evil.example', 'sec-fetch-site': 'same-origin' },
        { origin: site, 'sec-fetch-site': 'cross-site' },
        { 'sec-fetch-site': 'same-origin' },
        { origin: site, authorization: 'Bearer browser-token' },
      ]) {
        const rejected = await onRequest({
          request: new Request(`${site}/api/v1/orders/order-1/checkout`, {
            method: 'POST',
            headers: new Headers([
              ...Object.entries(headers).filter(
                (entry): entry is [string, string] => entry[1] !== undefined,
              ),
              ['cookie', cookieHeader(jar)],
            ]),
          }),
          env,
        })
        expect([401, 403]).toContain(rejected.status)
      }
      expect(fetchImpl).toHaveBeenCalledTimes(4)

      const insecure = await onRequest({
        request: new Request(
          'http://aureole.example/api/v1/orders/order-1/checkout',
          {
            method: 'POST',
            headers: {
              origin: 'http://aureole.example',
              cookie: cookieHeader(jar),
            },
          },
        ),
        env,
      })
      expect(insecure.status).toBe(403)
      expect(fetchImpl).toHaveBeenCalledTimes(4)
    },
  )

  it('caps the browser and D1 session at seven days independently of subscription expiry', async () => {
    const expiry = new Date(Date.now() + 90_000).toISOString()
    const fetchImpl = vi.fn().mockImplementation((url: URL) =>
      new URL(String(url)).pathname.endsWith('/auth/login')
        ? loginResponse('short-lived')
        : new Response(
            JSON.stringify({
              ok: true,
              data: {
                email: 'short-lived@example.com',
                expiresAt: expiry,
                status: 'active',
              },
            }),
          ),
    )
    vi.stubGlobal('fetch', fetchImpl)
    const jar = new Map<string, string>()
    applyResponse(
      jar,
      await onRequest({ request: request('auth/browser', jar), env }),
    )
    const response = await onRequest({
      request: request('auth/login', jar, 'POST'),
      env,
    })
    expect(response.status).toBe(200)
    const sessionCookie = response.headers
      .getSetCookie()
      .find((value) => value.startsWith(`${COOKIE_NAME}=`))
    const maxAge = Number(sessionCookie?.match(/Max-Age=(\d+)/)?.[1])
    expect(maxAge).toBe(7 * 24 * 60 * 60)
    applyResponse(jar, response)
    vi.useFakeTimers()
    try {
      vi.setSystemTime(Date.now() + (7 * 24 * 60 * 60 + 1) * 1_000)
      expect(
        (await onRequest({ request: request('wallet', jar), env })).status,
      ).toBe(401)
      expect(fetchImpl).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('normally switches accounts and rejects replay of the previous cookie', async () => {
    let index = 0
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation((url: URL, init: RequestInit) =>
          new URL(String(url)).pathname.endsWith('/auth/login')
            ? loginResponse(`user-${++index}`)
            : userResponse(
                new Headers(init.headers).get('authorization')!.slice(7),
              ),
        ),
    )
    const jar = new Map<string, string>()
    applyResponse(
      jar,
      await onRequest({ request: request('auth/browser', jar), env }),
    )
    const first = await onRequest({
      request: request('auth/login', jar, 'POST'),
      env,
    })
    applyResponse(jar, first)
    const oldJar = new Map(jar)
    const second = await onRequest({
      request: request('auth/login', jar, 'POST'),
      env,
    })
    expect(
      (await onRequest({ request: request('wallet', oldJar), env })).status,
    ).toBe(401)
    applyResponse(jar, second)
    expect(
      (
        await (
          await onRequest({ request: request('auth/session', jar), env })
        ).json()
      ).data.email,
    ).toBe('user-2@example.com')
    expect(
      (await onRequest({ request: request('wallet', oldJar), env })).status,
    ).toBe(401)
    expect(
      (await onRequest({ request: request('auth/session', oldJar), env }))
        .status,
    ).toBe(401)
  })

  it('does not issue a cookie when session storage fails during creation', async () => {
    env.AUREOLE_SESSION_DB = database({ failSessionInsert: true })
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation((url: URL, init: RequestInit) =>
          new URL(String(url)).pathname.endsWith('/auth/login')
            ? loginResponse('member')
            : userResponse(
                new Headers(init.headers).get('authorization')!.slice(7),
              ),
        ),
    )
    const jar = new Map<string, string>()
    applyResponse(
      jar,
      await onRequest({ request: request('auth/browser', jar), env }),
    )
    const response = await onRequest({
      request: request('auth/login', jar, 'POST'),
      env,
    })
    expect(response.status).toBe(502)
    expect(response.headers.getSetCookie()).toEqual([])
    applyResponse(jar, response)
    expect(
      (await onRequest({ request: request('auth/session', jar), env })).status,
    ).toBe(401)
  })

  it('rejects an old login response applied after a newer response', async () => {
    const old = deferred<Response>()
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: URL, init: RequestInit) => {
        if (new URL(String(url)).pathname.endsWith('/auth/login'))
          return ++calls === 1 ? old.promise : loginResponse('new')
        return userResponse(
          new Headers(init.headers).get('authorization')!.slice(7),
        )
      }),
    )
    const jar = new Map<string, string>()
    applyResponse(
      jar,
      await onRequest({ request: request('auth/browser', jar), env }),
    )
    const pendingOld = onRequest({
      request: request('auth/login', jar, 'POST'),
      env,
    })
    const newer = await onRequest({
      request: request('auth/login', jar, 'POST'),
      env,
    })
    applyResponse(jar, newer)
    const newJar = new Map(jar)
    old.resolve(loginResponse('old'))
    const stale = await pendingOld
    expect(stale.status).toBe(409)
    expect(stale.headers.getSetCookie()).toEqual([])
    applyResponse(jar, stale)
    expect(jar).toEqual(newJar)
    expect(
      (await onRequest({ request: request('wallet', jar), env })).status,
    ).toBe(200)
    expect(
      (
        await (
          await onRequest({ request: request('auth/session', jar), env })
        ).json()
      ).data.email,
    ).toBe('new@example.com')
  })

  it('fails closed when an already committed old login response overwrites the newer cookie', async () => {
    let index = 0
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation((url: URL, init: RequestInit) =>
          new URL(String(url)).pathname.endsWith('/auth/login')
            ? loginResponse(`user-${++index}`)
            : userResponse(
                new Headers(init.headers).get('authorization')!.slice(7),
              ),
        ),
    )
    const jar = new Map<string, string>()
    applyResponse(
      jar,
      await onRequest({ request: request('auth/browser', jar), env }),
    )
    const old = await onRequest({
      request: request('auth/login', jar, 'POST'),
      env,
    })
    const newer = await onRequest({
      request: request('auth/login', jar, 'POST'),
      env,
    })
    expect(old.status).toBe(200)
    expect(newer.status).toBe(200)
    applyResponse(jar, newer)
    const newJar = new Map(jar)
    expect(
      (await onRequest({ request: request('auth/session', jar), env })).status,
    ).toBe(200)
    applyResponse(jar, old)
    expect(jar.get(COOKIE_NAME)).not.toBe(newJar.get(COOKIE_NAME))
    expect(
      (await onRequest({ request: request('auth/session', jar), env })).status,
    ).toBe(401)
    expect(
      (await onRequest({ request: request('wallet', jar), env })).status,
    ).toBe(401)
  })

  it('discards a private response that arrives after the browser switches accounts', async () => {
    const oldRead = deferred<Response>()
    let loginCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: URL, init: RequestInit) => {
        const path = new URL(String(url)).pathname
        if (path.endsWith('/auth/login'))
          return loginResponse(`user-${++loginCount}`)
        if (path.endsWith('/wallet')) return oldRead.promise
        return userResponse(
          new Headers(init.headers).get('authorization')!.slice(7),
        )
      }),
    )
    const jar = new Map<string, string>()
    applyResponse(
      jar,
      await onRequest({ request: request('auth/browser', jar), env }),
    )
    applyResponse(
      jar,
      await onRequest({ request: request('auth/login', jar, 'POST'), env }),
    )
    const oldJar = new Map(jar)
    const pendingOldRead = onRequest({
      request: request('wallet', oldJar),
      env,
    })
    applyResponse(
      jar,
      await onRequest({ request: request('auth/login', jar, 'POST'), env }),
    )
    oldRead.resolve(
      new Response(JSON.stringify({ ok: true, data: { balanceMinor: 9000 } })),
    )
    const staleResponse = await pendingOldRead
    expect(staleResponse.status).toBe(401)
    expect(
      (await onRequest({ request: request('auth/session', oldJar), env }))
        .status,
    ).toBe(401)
    expect(
      (
        await (
          await onRequest({ request: request('auth/session', jar), env })
        ).json()
      ).data.email,
    ).toBe('user-2@example.com')
  })

  it('rejects a delayed logout clearing the newer session cookie', async () => {
    let index = 0
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation((url: URL, init: RequestInit) =>
          new URL(String(url)).pathname.endsWith('/auth/login')
            ? loginResponse(`user-${++index}`)
            : userResponse(
                new Headers(init.headers).get('authorization')!.slice(7),
              ),
        ),
    )
    const jar = new Map<string, string>()
    applyResponse(
      jar,
      await onRequest({ request: request('auth/browser', jar), env }),
    )
    applyResponse(
      jar,
      await onRequest({ request: request('auth/login', jar, 'POST'), env }),
    )
    const oldJar = new Map(jar)
    const logout = await onRequest({
      request: request('auth/logout', oldJar, 'POST'),
      env,
    })
    applyResponse(
      jar,
      await onRequest({ request: request('auth/login', jar, 'POST'), env }),
    )
    expect(
      (await onRequest({ request: request('wallet', jar), env })).status,
    ).toBe(200)
    applyResponse(jar, logout)
    expect(logout.headers.getSetCookie()).toEqual([])
    expect(jar.has(COOKIE_NAME)).toBe(true)
    expect(
      (
        await (
          await onRequest({ request: request('auth/session', jar), env })
        ).json()
      ).data.email,
    ).toBe('user-2@example.com')
    expect(
      (await onRequest({ request: request('wallet', oldJar), env })).status,
    ).toBe(401)
  })

  it('does not let an old logout revoke a newer login started before it completes', async () => {
    const newerLogin = deferred<Response>()
    let loginCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: URL, init: RequestInit) => {
        if (new URL(String(url)).pathname.endsWith('/auth/login'))
          return ++loginCount === 1 ? loginResponse('old') : newerLogin.promise
        return userResponse(
          new Headers(init.headers).get('authorization')!.slice(7),
        )
      }),
    )
    const jar = new Map<string, string>()
    applyResponse(
      jar,
      await onRequest({ request: request('auth/browser', jar), env }),
    )
    applyResponse(
      jar,
      await onRequest({ request: request('auth/login', jar, 'POST'), env }),
    )
    const oldJar = new Map(jar)
    const pendingLogin = onRequest({
      request: request('auth/login', jar, 'POST'),
      env,
    })
    await vi.waitFor(() => expect(loginCount).toBe(2))
    const logout = await onRequest({
      request: request('auth/logout', oldJar, 'POST'),
      env,
    })
    newerLogin.resolve(loginResponse('new'))
    const newer = await pendingLogin
    expect(logout.status).toBe(200)
    expect(newer.status).toBe(409)
    expect(newer.headers.getSetCookie()).toEqual([])
    applyResponse(jar, logout)
    applyResponse(jar, newer)
    expect(
      (await onRequest({ request: request('auth/session', jar), env })).status,
    ).toBe(401)
    expect(
      (await onRequest({ request: request('wallet', oldJar), env })).status,
    ).toBe(401)
  })

  it('rejects a logged-out cookie on subsequent private requests without relying on browser deletion', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation((url: URL, init: RequestInit) =>
          new URL(String(url)).pathname.endsWith('/auth/login')
            ? loginResponse('member')
            : userResponse(
                new Headers(init.headers).get('authorization')!.slice(7),
              ),
        ),
    )
    const jar = new Map<string, string>()
    applyResponse(
      jar,
      await onRequest({ request: request('auth/browser', jar), env }),
    )
    applyResponse(
      jar,
      await onRequest({ request: request('auth/login', jar, 'POST'), env }),
    )
    const logout = await onRequest({
      request: request('auth/logout', jar, 'POST'),
      env,
    })
    expect(logout.status).toBe(200)
    expect(logout.headers.getSetCookie()).toEqual([])
    expect(
      (await onRequest({ request: request('wallet', jar), env })).status,
    ).toBe(401)
    expect(
      (await onRequest({ request: request('auth/session', jar), env })).status,
    ).toBe(401)
  })

  it('fails closed if competing first-tab family cookies leave a mismatched pair', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation((url: URL, init: RequestInit) =>
          new URL(String(url)).pathname.endsWith('/auth/login')
            ? loginResponse('new')
            : userResponse(
                new Headers(init.headers).get('authorization')!.slice(7),
              ),
        ),
    )
    const jar = new Map<string, string>()
    const firstFamily = await onRequest({
      request: request('auth/browser', jar),
      env,
    })
    const lateFamily = await onRequest({
      request: request('auth/browser', jar),
      env,
    })
    applyResponse(jar, firstFamily)
    applyResponse(
      jar,
      await onRequest({ request: request('auth/login', jar, 'POST'), env }),
    )
    applyResponse(jar, lateFamily)
    expect(
      (await onRequest({ request: request('wallet', jar), env })).status,
    ).toBe(401)
    expect(
      (await onRequest({ request: request('auth/session', jar), env })).status,
    ).toBe(401)
  })

  it('keeps the browser cookie on transient upstream /me failure', async () => {
    let unavailable = false
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: URL, init: RequestInit) => {
        if (new URL(String(url)).pathname.endsWith('/auth/login'))
          return loginResponse('member')
        if (unavailable)
          return new Response(
            JSON.stringify({
              ok: false,
              error: { code: 'UPSTREAM_TIMEOUT', message: 'Unavailable' },
            }),
            { status: 504 },
          )
        return userResponse(
          new Headers(init.headers).get('authorization')!.slice(7),
        )
      }),
    )
    const jar = new Map<string, string>()
    applyResponse(
      jar,
      await onRequest({ request: request('auth/browser', jar), env }),
    )
    applyResponse(
      jar,
      await onRequest({ request: request('auth/login', jar, 'POST'), env }),
    )
    const retained = new Map(jar)
    unavailable = true
    const failed = await onRequest({
      request: request('auth/session', jar),
      env,
    })
    expect(failed.status).toBe(504)
    expect(failed.headers.getSetCookie()).toEqual([])
    applyResponse(jar, failed)
    expect(jar).toEqual(retained)
    unavailable = false
    expect(
      (await onRequest({ request: request('auth/session', jar), env })).status,
    ).toBe(200)
  })

  it('revokes the server session when upstream /me confirms credential invalidity', async () => {
    let invalid = false
    const upstreamFetch = vi
      .fn()
      .mockImplementation((url: URL, init: RequestInit) => {
        if (new URL(String(url)).pathname.endsWith('/auth/login'))
          return loginResponse('member')
        if (invalid)
          return new Response(
            JSON.stringify({
              ok: false,
              error: { code: 'AUTH_FAILED', message: 'Authentication failed' },
            }),
            { status: 401 },
          )
        return userResponse(
          new Headers(init.headers).get('authorization')!.slice(7),
        )
      })
    vi.stubGlobal('fetch', upstreamFetch)
    const jar = new Map<string, string>()
    applyResponse(
      jar,
      await onRequest({ request: request('auth/browser', jar), env }),
    )
    applyResponse(
      jar,
      await onRequest({ request: request('auth/login', jar, 'POST'), env }),
    )
    invalid = true
    expect(
      (await onRequest({ request: request('auth/session', jar), env })).status,
    ).toBe(401)
    invalid = false
    expect(
      (await onRequest({ request: request('wallet', jar), env })).status,
    ).toBe(401)
    expect(upstreamFetch).toHaveBeenCalledTimes(3)
  })

  it('rejects browser-supplied authorization, cross-site writes, and unlisted routes', async () => {
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const url = 'https://cc-aureole-stg.pages.dev/api/v1/'
    const legacy = await onRequest({
      request: new Request(`${url}me`, {
        headers: { authorization: 'Bearer old-browser-token' },
      }),
      env,
    })
    expect(legacy.status).toBe(401)
    const crossSite = await onRequest({
      request: new Request(`${url}auth/login`, {
        method: 'POST',
        headers: { origin: 'https://other.example' },
      }),
      env,
    })
    expect(crossSite.status).toBe(403)
    const missingOrigin = await onRequest({
      request: new Request(`${url}auth/login`, { method: 'POST' }),
      env,
    })
    expect(missingOrigin.status).toBe(403)
    const unknown = await onRequest({
      request: request('wallet/unlisted', new Map()),
      env,
    })
    expect(unknown.status).toBe(404)
    const wrongMethod = await onRequest({
      request: request('wallet', new Map(), 'POST'),
      env,
    })
    expect(wrongMethod.status).toBe(404)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('keeps public announcements available after logout without restoring old private access', async () => {
    const upstreamFetch = vi
      .fn()
      .mockImplementation((url: URL, init: RequestInit) => {
        const path = new URL(String(url)).pathname
        if (path.endsWith('/auth/login')) return loginResponse('member')
        if (path.endsWith('/announcements')) {
          const authorization = new Headers(init.headers).get('authorization')
          return new Response(
            JSON.stringify({
              ok: true,
              data: {
                items: [
                  {
                    id: authorization ? 'private' : 'public',
                    title: 'Notice',
                    body: 'Safe',
                  },
                ],
              },
            }),
          )
        }
        return userResponse(
          new Headers(init.headers).get('authorization')!.slice(7),
        )
      })
    vi.stubGlobal('fetch', upstreamFetch)
    const jar = new Map<string, string>()
    const anonymous = await onRequest({
      request: request('announcements', jar),
      env,
    })
    expect((await anonymous.json()).data.items[0].id).toBe('public')
    applyResponse(
      jar,
      await onRequest({ request: request('auth/browser', jar), env }),
    )
    applyResponse(
      jar,
      await onRequest({ request: request('auth/login', jar, 'POST'), env }),
    )
    const oldJar = new Map(jar)
    const authenticated = await onRequest({
      request: request('announcements', jar),
      env,
    })
    expect((await authenticated.json()).data.items[0].id).toBe('private')
    const logout = await onRequest({
      request: request('auth/logout', jar, 'POST'),
      env,
    })
    applyResponse(jar, logout)
    expect(logout.headers.getSetCookie()).toEqual([])
    expect(jar.get(COOKIE_NAME)).toBe(oldJar.get(COOKIE_NAME))
    const loggedOut = await onRequest({
      request: request('announcements', jar),
      env,
    })
    expect(loggedOut.status).toBe(200)
    expect((await loggedOut.json()).data.items[0].id).toBe('public')
    expect(
      (await onRequest({ request: request('wallet', oldJar), env })).status,
    ).toBe(401)
    expect(
      (await onRequest({ request: request('auth/session', oldJar), env }))
        .status,
    ).toBe(401)
    const announcementCalls = upstreamFetch.mock.calls.filter(([url]) =>
      new URL(String(url)).pathname.endsWith('/announcements'),
    )
    expect(
      announcementCalls.map(([, init]) =>
        new Headers(init.headers).get('authorization'),
      ),
    ).toEqual([null, 'Bearer member', null])
  })

  it('does not downgrade optional reads when session storage is unavailable', async () => {
    const upstreamFetch = vi.fn()
    vi.stubGlobal('fetch', upstreamFetch)
    const unavailableEnv = {
      ...env,
      AUREOLE_SESSION_DB: undefined,
    }
    const staleJar = new Map([
      [COOKIE_NAME, 'a'.repeat(43)],
      [FAMILY_COOKIE_NAME, 'b'.repeat(43)],
    ])
    const response = await onRequest({
      request: request('announcements', staleJar),
      env: unavailableEnv,
    })
    expect(response.status).toBe(503)
    expect((await response.json()).error.code).toBe('SESSION_UNAVAILABLE')
    expect(upstreamFetch).not.toHaveBeenCalled()
  })

  it('keeps a newer account after a delayed logout while isolating the old announcement identity', async () => {
    let logins = 0
    const upstreamFetch = vi
      .fn()
      .mockImplementation((url: URL, init: RequestInit) => {
        const path = new URL(String(url)).pathname
        if (path.endsWith('/auth/login'))
          return loginResponse(`user-${++logins}`)
        const authorization = new Headers(init.headers).get('authorization')
        if (path.endsWith('/announcements'))
          return new Response(
            JSON.stringify({
              ok: true,
              data: {
                items: [
                  {
                    id: authorization ?? 'public',
                    title: 'Notice',
                    body: 'Safe',
                  },
                ],
              },
            }),
          )
        return userResponse(authorization!.slice(7))
      })
    vi.stubGlobal('fetch', upstreamFetch)
    const jar = new Map<string, string>()
    applyResponse(
      jar,
      await onRequest({ request: request('auth/browser', jar), env }),
    )
    applyResponse(
      jar,
      await onRequest({ request: request('auth/login', jar, 'POST'), env }),
    )
    const oldJar = new Map(jar)
    const logout = await onRequest({
      request: request('auth/logout', oldJar, 'POST'),
      env,
    })
    applyResponse(
      jar,
      await onRequest({ request: request('auth/login', jar, 'POST'), env }),
    )
    applyResponse(jar, logout)
    const current = await onRequest({
      request: request('announcements', jar),
      env,
    })
    expect((await current.json()).data.items[0].id).toBe('Bearer user-2')
    const replay = await onRequest({
      request: request('announcements', oldJar),
      env,
    })
    expect((await replay.json()).data.items[0].id).toBe('public')
    expect(
      (await onRequest({ request: request('wallet', oldJar), env })).status,
    ).toBe(401)
    expect(logout.headers.getSetCookie()).toEqual([])
  })

  it('passes subscription URL credentials through without browser session authorization', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('subscription-body', {
        headers: {
          'content-type': 'text/plain',
          'subscription-userinfo': 'upload=0; download=0',
          'set-cookie': 'upstream=secret',
        },
      }),
    )
    vi.stubGlobal('fetch', fetchImpl)
    const jar = new Map([[COOKIE_NAME, 'old-cookie']])
    const response = await onRequest({
      request: request('access/subscription?token=credential', jar),
      env,
    })
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('subscription-body')
    expect(response.headers.get('subscription-userinfo')).toBe(
      'upload=0; download=0',
    )
    expect(response.headers.has('set-cookie')).toBe(false)
    const [target, init] = fetchImpl.mock.calls[0]!
    expect(String(target)).toContain(
      '/api/v1/access/subscription?token=credential',
    )
    expect(new Headers(init.headers).has('authorization')).toBe(false)
    expect(new Headers(init.headers).has('cookie')).toBe(false)
  })
})
