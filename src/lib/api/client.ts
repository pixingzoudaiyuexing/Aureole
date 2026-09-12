import { ApiError } from './errors'
import { isApiFailure, isApiSuccess } from './envelope'

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
}

export interface ApiClientOptions {
  baseUrl?: string
  fetchImpl?: typeof fetch
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
  async function request<T>(path: string, options: ApiRequestOptions = {}) {
    assertPublicApiPath(path)

    if (!baseUrl) {
      throw new ApiError({
        status: 0,
        code: 'API_BASE_URL_MISSING',
        message: 'The public API origin is not configured',
      })
    }

    const headers = new Headers(options.headers)
    let body: BodyInit | undefined
    if (options.body !== undefined) {
      headers.set('content-type', 'application/json')
      body = JSON.stringify(options.body)
    }

    let response: Response
    try {
      response = await fetchImpl(new URL(path, baseUrl), {
        ...options,
        headers,
        body,
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

  return { request }
}

export const apiClient = createApiClient()
