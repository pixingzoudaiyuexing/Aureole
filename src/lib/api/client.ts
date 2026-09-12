import { ApiError } from './errors'
import { isApiFailure, isApiSuccess } from './envelope'

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
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

export function createApiClient({
  baseUrl = import.meta.env.VITE_API_BASE_URL,
  fetchImpl = fetch,
}: ApiClientOptions = {}) {
  async function executeRequest<T>(
    path: string,
    options: ApiRequestOptions,
    accessToken?: string,
  ) {
    assertPublicApiPath(path)

    if (!baseUrl) {
      throw new ApiError({
        status: 0,
        code: 'API_BASE_URL_MISSING',
        message: 'The public API origin is not configured',
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
      headers.set('authorization', `Bearer ${accessToken}`)
    }

    let body: BodyInit | undefined
    if (requestBody !== undefined) {
      headers.set('content-type', 'application/json')
      body = JSON.stringify(requestBody)
    }

    let response: Response
    try {
      response = await fetchImpl(new URL(path, baseUrl), {
        ...requestInit,
        headers,
        body,
        redirect: 'error',
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

    return payload.data as T
  }

  function request<T>(path: string, options: ApiRequestOptions = {}) {
    return executeRequest<T>(path, options)
  }

  function authenticatedRequest<T>(
    path: string,
    { accessToken, ...options }: AuthenticatedApiRequestOptions,
  ) {
    return executeRequest<T>(path, options, accessToken)
  }

  return { authenticatedRequest, request }
}

export const apiClient = createApiClient()
