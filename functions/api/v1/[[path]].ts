import {
  beginSessionIntent,
  createSession,
  loadSession,
  newFamilyId,
  readCookie,
  readFamilyCookie,
  revokeSession,
  SESSION_SECONDS,
  SessionChanged,
  SessionUnavailable,
  setCookie,
  setFamilyCookie,
  type SessionEnv,
} from './session'

export interface Env extends SessionEnv {
  SOLUTION_GATEWAY_ORIGIN?: string
}

export type PagesFunctionContext<Env = unknown> = {
  request: Request
  env: Env
}

export type PagesFunction<Env = unknown> = (
  context: PagesFunctionContext<Env>,
) => Promise<Response> | Response

const PUBLIC_GET = new Set([
  '/api/v1/config/onboarding',
  '/api/v1/config/runtime',
])
const PUBLIC_POST = new Set([
  '/api/v1/auth/email-code',
  '/api/v1/auth/password/reset',
])
const SESSION_POST = new Set(['/api/v1/auth/login', '/api/v1/auth/register'])
const OPTIONAL_GET = new Set(['/api/v1/announcements'])
const PROTECTED: Record<string, RegExp[]> = {
  GET: [
    /^\/api\/v1\/(?:me|me\/preferences|me\/stats|wallet|products|products\/[A-Za-z0-9_-]+|orders|orders\/[A-Za-z0-9_-]+|orders\/[A-Za-z0-9_-]+\/status|billing\/methods|subscription|subscription\/(?:overview|entries|delivery-options)|resources|tickets|tickets\/[A-Za-z0-9_-]+|notices|notices\/[A-Za-z0-9_-]+|custom-pages|traffic\/logs|referrals|referrals\/commissions|referrals\/withdrawal-options|config\/account)$/,
  ],
  POST: [
    /^\/api\/v1\/(?:me\/password|wallet\/deposits|orders|orders\/[A-Za-z0-9_-]+\/(?:checkout|cancel)|promotions\/validate|subscription\/(?:entry-access|rotate-access|advance-period|access-link)|tickets|tickets\/[A-Za-z0-9_-]+\/(?:reply|close)|referrals\/codes|referrals\/commissions\/transfer|referrals\/withdrawal-requests|gift-cards\/redeem)$/,
  ],
  PATCH: [/^\/api\/v1\/me\/preferences$/],
}

function failure(status: number, code: string) {
  return new Response(
    JSON.stringify({ ok: false, error: { code, message: code } }),
    {
      status,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
    },
  )
}

function safeResponse(response: Response, cookie?: string) {
  const headers = new Headers({ 'cache-control': 'no-store' })
  for (const name of ['content-type', 'x-request-id']) {
    const value = response.headers.get(name)
    if (value) headers.set(name, value)
  }
  if (cookie) headers.set('set-cookie', cookie)
  return new Response(response.body, { status: response.status, headers })
}

function subscriptionResponse(response: Response) {
  const headers = new Headers({ 'cache-control': 'no-store' })
  for (const name of [
    'content-type',
    'content-disposition',
    'subscription-userinfo',
    'profile-update-interval',
    'profile-title',
  ]) {
    const value = response.headers.get(name)
    if (value) headers.set(name, value)
  }
  return new Response(response.body, { status: response.status, headers })
}

function sessionResponse(data: unknown, cookies: string[] = []) {
  const headers = new Headers({
    'content-type': 'application/json',
    'cache-control': 'no-store',
  })
  for (const cookie of cookies) headers.append('set-cookie', cookie)
  return new Response(JSON.stringify({ ok: true, data }), { headers })
}

function csrfAllowed(request: Request, url: URL) {
  if (request.method === 'GET') return true
  if (
    url.protocol !== 'https:' &&
    url.hostname !== 'localhost' &&
    url.hostname !== '127.0.0.1'
  )
    return false
  if (request.headers.get('origin') !== url.origin) return false
  const site = request.headers.get('sec-fetch-site')
  return !site || site === 'same-origin'
}

function upstreamUrl(origin: string | undefined, url: URL) {
  if (!origin) return null
  try {
    const base = new URL(origin)
    if (
      base.protocol !== 'https:' ||
      base.pathname !== '/' ||
      base.search ||
      base.hash ||
      base.username ||
      base.password
    )
      return null
    const target = new URL(url.pathname + url.search, base)
    return target.origin === base.origin &&
      target.pathname.startsWith('/api/v1/')
      ? target
      : null
  } catch {
    return null
  }
}

async function upstream(request: Request, target: URL, token?: string) {
  const headers = new Headers()
  for (const name of ['content-type', 'accept', 'user-agent']) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  if (token) headers.set('authorization', `Bearer ${token}`)
  return fetch(target, {
    method: request.method,
    headers,
    body: request.method === 'GET' ? undefined : request.body,
    redirect: 'manual',
  })
}

async function upstreamMe(origin: string, token: string) {
  return fetch(new URL('/api/v1/me', origin), {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    redirect: 'manual',
  })
}

function safeUser(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null
  const data = (payload as { data?: unknown }).data
  if (!data || typeof data !== 'object') return null
  const user = data as Record<string, unknown>
  if (
    typeof user.email !== 'string' ||
    !['active', 'expired', 'disabled'].includes(String(user.status)) ||
    (user.expiresAt !== null && typeof user.expiresAt !== 'string')
  )
    return null
  return { email: user.email, expiresAt: user.expiresAt, status: user.status }
}

async function confirmedAuthFailure(response: Response) {
  if (response.status !== 401) return false
  try {
    const payload = (await response.clone().json()) as {
      error?: { code?: unknown }
    }
    return (
      payload.error?.code === 'AUTH_REQUIRED' ||
      payload.error?.code === 'AUTH_FAILED'
    )
  } catch {
    return false
  }
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (!['GET', 'POST', 'PATCH'].includes(request.method))
    return failure(405, 'METHOD_NOT_ALLOWED')
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/api/v1/') || /%2f|%5c|%2e/i.test(url.pathname))
    return failure(404, 'NOT_FOUND')
  const target = upstreamUrl(env.SOLUTION_GATEWAY_ORIGIN, url)
  if (!target) return failure(500, 'SESSION_UNAVAILABLE')
  if (request.headers.has('authorization')) return failure(401, 'AUTH_REQUIRED')
  if (!csrfAllowed(request, url)) return failure(403, 'FORBIDDEN')

  const path = url.pathname
  if (request.method === 'GET' && path === '/api/v1/access/subscription') {
    return subscriptionResponse(await upstream(request, target))
  }
  const isPublic =
    request.method === 'GET' ? PUBLIC_GET.has(path) : PUBLIC_POST.has(path)
  const isSessionCreation = request.method === 'POST' && SESSION_POST.has(path)
  const isOptional = request.method === 'GET' && OPTIONAL_GET.has(path)
  const isLogout = request.method === 'POST' && path === '/api/v1/auth/logout'
  const isRestore = request.method === 'GET' && path === '/api/v1/auth/session'
  const isFamily = request.method === 'GET' && path === '/api/v1/auth/browser'
  const isProtected =
    PROTECTED[request.method]?.some((pattern) => pattern.test(path)) ?? false
  if (
    !isPublic &&
    !isSessionCreation &&
    !isOptional &&
    !isLogout &&
    !isRestore &&
    !isFamily &&
    !isProtected
  )
    return failure(404, 'NOT_FOUND')
  if (isPublic) return safeResponse(await upstream(request, target))

  const oldId = readCookie(request)
  const familyId = readFamilyCookie(request)
  try {
    if (isFamily)
      return sessionResponse(
        { ready: true },
        familyId ? [] : [setFamilyCookie(newFamilyId())],
      )
    if (isSessionCreation) {
      if (!familyId) return failure(428, 'BROWSER_SESSION_REQUIRED')
      const intentEpoch = await beginSessionIntent(env, familyId)
      const response = await upstream(request, target)
      if (!response.ok) return safeResponse(response)
      const payload = (await response.json()) as {
        ok?: boolean
        data?: { accessToken?: string }
      }
      const token = payload.ok && payload.data?.accessToken
      if (!token) return failure(502, 'UPSTREAM_ERROR')
      const me = await upstreamMe(env.SOLUTION_GATEWAY_ORIGIN!, token)
      if (!me.ok) return safeResponse(me)
      const user = safeUser(await me.json())
      if (!user) return failure(502, 'UPSTREAM_ERROR')
      const now = Math.floor(Date.now() / 1000)
      const expiry = now + SESSION_SECONDS
      const { id, publicVersion } = await createSession(
        env,
        token,
        expiry,
        familyId,
        intentEpoch,
      )
      return sessionResponse({ ...user, sessionVersion: publicVersion }, [
        setCookie(id, expiry - now),
      ])
    }
    if (isLogout) {
      if (oldId && familyId) await revokeSession(env, oldId, familyId)
      // Clearing a fixed-name cookie here could erase a newer login when this response arrives late.
      return sessionResponse({ loggedOut: true })
    }
    if (!oldId || !familyId) {
      if (isOptional) return safeResponse(await upstream(request, target))
      return failure(401, 'AUTH_REQUIRED')
    }
    const session = await loadSession(env, oldId, familyId)
    if (!session) return failure(401, 'AUTH_FAILED')
    if (isRestore) {
      const me = await upstreamMe(env.SOLUTION_GATEWAY_ORIGIN!, session.token)
      if (!me.ok) {
        if (await confirmedAuthFailure(me))
          await revokeSession(env, oldId, familyId)
        return safeResponse(me)
      }
      const user = safeUser(await me.json())
      if (!user) return failure(502, 'UPSTREAM_ERROR')
      if (!(await loadSession(env, oldId, familyId)))
        return failure(401, 'AUTH_FAILED')
      return sessionResponse({ ...user, sessionVersion: session.publicVersion })
    }
    const response = await upstream(request, target, session.token)
    if (await confirmedAuthFailure(response))
      await revokeSession(env, oldId, familyId)
    if (!(await loadSession(env, oldId, familyId)))
      return failure(401, 'AUTH_FAILED')
    return safeResponse(response)
  } catch (error) {
    if (error instanceof SessionChanged) return failure(409, 'SESSION_CHANGED')
    if (error instanceof SessionUnavailable)
      return failure(503, 'SESSION_UNAVAILABLE')
    return failure(502, 'UPSTREAM_ERROR')
  }
}
