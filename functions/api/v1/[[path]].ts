export interface Env {
  SOLUTION_GATEWAY_ORIGIN?: string
}

export type PagesFunctionContext<Env = unknown> = {
  request: Request
  env: Env
}

export type PagesFunction<Env = unknown> = (
  context: PagesFunctionContext<Env>,
) => Promise<Response> | Response

const ALLOWED_METHODS = ['GET', 'POST', 'PATCH']
const ALLOWED_REQUEST_HEADERS = [
  'authorization',
  'content-type',
  'accept',
  'user-agent',
]
const ALLOWED_RESPONSE_HEADERS = [
  'content-type',
  'cache-control',
  'x-request-id',
]

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  if (!ALLOWED_METHODS.includes(request.method)) {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const gatewayOrigin = env.SOLUTION_GATEWAY_ORIGIN
  if (!gatewayOrigin) {
    return new Response('Gateway origin not configured', { status: 500 })
  }

  let gatewayUrl: URL
  try {
    gatewayUrl = new URL(gatewayOrigin)
    if (
      gatewayUrl.protocol !== 'https:' ||
      gatewayUrl.pathname !== '/' ||
      gatewayUrl.search !== '' ||
      gatewayUrl.hash !== '' ||
      gatewayUrl.username !== '' ||
      gatewayUrl.password !== ''
    ) {
      throw new Error('Invalid gateway origin')
    }
  } catch {
    return new Response('Invalid gateway origin configuration', { status: 500 })
  }

  const requestUrl = new URL(request.url)
  const normalizedPathname = new URL(requestUrl.pathname, 'https://example.com')
    .pathname

  if (!normalizedPathname.startsWith('/api/v1/')) {
    return new Response('Invalid path namespace', { status: 400 })
  }

  let finalUrl: URL
  try {
    finalUrl = new URL(normalizedPathname + requestUrl.search, gatewayOrigin)
  } catch {
    return new Response('Invalid URL construction', { status: 500 })
  }

  // Revalidate the constructed URL to ensure it has not escaped the intended origin or path
  if (finalUrl.origin !== gatewayUrl.origin) {
    return new Response('Origin escape detected', { status: 400 })
  }
  if (!finalUrl.pathname.startsWith('/api/v1/')) {
    return new Response('Path namespace escape detected', { status: 400 })
  }

  const headers = new Headers()
  for (const [key, value] of request.headers.entries()) {
    if (ALLOWED_REQUEST_HEADERS.includes(key.toLowerCase())) {
      headers.set(key, value)
    }
  }
  if (requestUrl.protocol === 'https:') {
    headers.set('origin', requestUrl.origin)
  }

  const fetchOptions: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    fetchOptions.body = request.body
  }

  const response = await fetch(finalUrl.toString(), fetchOptions)

  const responseHeaders = new Headers()
  for (const [key, value] of response.headers.entries()) {
    if (ALLOWED_RESPONSE_HEADERS.includes(key.toLowerCase())) {
      responseHeaders.set(key, value)
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  })
}
