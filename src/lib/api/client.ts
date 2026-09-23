import { ApiError } from './errors'
import { isApiFailure, isApiSuccess } from './envelope'
import {
  captureAuthSessionIdentity,
  tagErrorWithAuthSession,
} from '@/lib/auth/session-store'

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
}

export interface StrictPublicResponse<T> {
  parse: (payload: unknown) => T
}

export interface ApiClientOptions {
  baseUrl?: string
  fetchImpl?: typeof fetch
}

export interface AuthenticatedApiRequestOptions extends ApiRequestOptions {
  accessToken: string
}

function getRequestId(response: Response) {
  return response.headers.get('x-request-id') ?? undefined
}

function assertPublicApiPath(path: string) {
  if (!path.startsWith('/api/v1/')) {
    throw new ApiError({
      status: 0,
      code: 'INVALID_API_PATH',
      message: 'API requests must use the solution /api/v1 contract',
    })
  }
}

function resolveApiOrigin(configuredUrl?: string): string | undefined {
  if (configuredUrl) {
    try {
      const parsed = new URL(configuredUrl)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return undefined
      }
      if (parsed.username || parsed.password) {
        return undefined
      }
      if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
        return undefined
      }
      if (parsed.protocol === 'http:') {
        if (
          parsed.hostname !== 'localhost' &&
          parsed.hostname !== '127.0.0.1' &&
          parsed.hostname !== '[::1]' &&
          parsed.hostname !== '::1'
        ) {
          return undefined
        }
      }
      return parsed.origin
    } catch {
      return undefined
    }
  }
  if (
    typeof window !== 'undefined' &&
    window.location &&
    window.location.origin
  ) {
    return window.location.origin
  }
  return undefined
}

export function createApiClient({
  baseUrl = import.meta.env.VITE_API_BASE_URL,
  fetchImpl = fetch,
}: ApiClientOptions = {}) {
  const resolvedBaseUrl = resolveApiOrigin(baseUrl)
  async function executeRequest<T>(
    path: string,
    options: ApiRequestOptions,
    accessToken?: string,
    strictResponse?: StrictPublicResponse<T>,
  ) {
    assertPublicApiPath(path)

    if (
      !resolvedBaseUrl ||
      (typeof window !== 'undefined' &&
        resolvedBaseUrl !== window.location.origin)
    ) {
      throw new ApiError({
        status: 0,
        code: 'API_BASE_URL_MISSING',
        message: 'The public API origin is not configured',
      })
    }

    // Resolve WHATWG URL
    let finalUrl: URL
    try {
      finalUrl = new URL(path, resolvedBaseUrl)
    } catch {
      throw new ApiError({
        status: 0,
        code: 'INVALID_API_PATH',
        message: 'The requested API path is malformed',
      })
    }

    if (finalUrl.origin !== resolvedBaseUrl) {
      throw new ApiError({
        status: 0,
        code: 'INVALID_API_PATH',
        message: 'API requests must not escape the origin',
      })
    }

    if (!finalUrl.pathname.startsWith('/api/v1/')) {
      throw new ApiError({
        status: 0,
        code: 'INVALID_API_PATH',
        message: 'API requests must use the solution /api/v1 contract',
      })
    }

    const { body: requestBody, ...requestInit } = options
    const headers = new Headers(requestInit.headers)
    if (headers.has('authorization')) {
      throw new ApiError({
        status: 0,
        code: 'INVALID_AUTH_HEADER',
        message: 'Use the authenticated API request boundary for credentials',
      })
    }

    if (accessToken !== undefined) {
      if (accessToken.length === 0) {
        throw new ApiError({
          status: 0,
          code: 'AUTH_REQUIRED',
          message: 'Authentication required',
        })
      }
    }

    let body: BodyInit | undefined
    if (requestBody !== undefined) {
      headers.set('content-type', 'application/json')
      body = JSON.stringify(requestBody)
    }

    let response: Response
    try {
      response = await fetchImpl(finalUrl, {
        ...requestInit,
        headers,
        body,
        redirect: 'error',
        credentials: 'same-origin',
      })
    } catch (cause) {
      throw new ApiError({
        status: 0,
        code: 'NETWORK_ERROR',
        message: 'Unable to reach the public API',
        cause,
      })
    }

    const requestId = getRequestId(response)
    let payload: unknown
    try {
      payload = JSON.parse(await response.text())
    } catch (cause) {
      throw new ApiError({
        status: response.status,
        code: 'MALFORMED_RESPONSE',
        message: 'The public API returned an invalid response',
        requestId,
        cause,
      })
    }

    if (isApiFailure(payload)) {
      throw new ApiError({
        status: response.status,
        code: payload.error.code,
        message: payload.error.message,
        requestId: payload.error.requestId ?? requestId,
      })
    }

    if (!response.ok || !isApiSuccess(payload)) {
      throw new ApiError({
        status: response.status,
        code: 'MALFORMED_RESPONSE',
        message: 'The public API returned an invalid response',
        requestId,
      })
    }

    if (strictResponse) {
      try {
        return strictResponse.parse(payload)
      } catch {
        throw new ApiError({
          status: response.status,
          code: 'MALFORMED_RESPONSE',
          message: 'The public API returned an invalid response',
        })
      }
    }

    return payload.data as T
  }

  function request<T>(path: string, options: ApiRequestOptions = {}) {
    return executeRequest<T>(path, options)
  }

  function strictPublicRequest<T>(
    path: string,
    response: StrictPublicResponse<T>,
  ) {
    return executeRequest<T>(path, { method: 'GET' }, undefined, response)
  }

  function authenticatedRequest<T>(
    path: string,
    { accessToken, ...options }: AuthenticatedApiRequestOptions,
  ) {
    const identity = {
      ...captureAuthSessionIdentity(),
      accessToken,
    }
    const assertCurrent = () => {
      const current = captureAuthSessionIdentity()
      if (
        identity.generation !== current.generation ||
        identity.accessToken !== current.accessToken
      ) {
        const stale = new ApiError({
          status: 0,
          code: 'STALE_SESSION',
          message: 'Session changed during request',
        })
        tagErrorWithAuthSession(stale, identity)
        throw stale
      }
    }
    return executeRequest<T>(path, options, accessToken).then(
      (data) => {
        assertCurrent()
        return data
      },
      (error) => {
        assertCurrent()
        tagErrorWithAuthSession(error, identity)
        throw error
      },
    )
  }

  return { authenticatedRequest, request, strictPublicRequest }
}

export const apiClient = createApiClient()
