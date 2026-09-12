export interface ApiSuccess<T> {
  ok: true
  data: T
  requestId?: string
}

export interface ApiFailure {
  ok: false
  error: {
    code: string
    message: string
    requestId?: string
  }
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure

export function isApiSuccess(value: unknown): value is ApiSuccess<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ok' in value &&
    value.ok === true &&
    'data' in value &&
    (!('requestId' in value) || typeof value.requestId === 'string')
  )
}

export function isApiFailure(value: unknown): value is ApiFailure {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('ok' in value) ||
    value.ok !== false ||
    !('error' in value) ||
    typeof value.error !== 'object' ||
    value.error === null
  ) {
    return false
  }

  const error = value.error
  return (
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string' &&
    (!('requestId' in error) || typeof error.requestId === 'string')
  )
}
