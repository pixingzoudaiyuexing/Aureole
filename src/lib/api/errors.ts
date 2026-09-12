export interface ApiErrorOptions {
  status: number
  code: string
  message: string
  requestId?: string
  cause?: unknown
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId?: string

  constructor({ status, code, message, requestId, cause }: ApiErrorOptions) {
    super(message, { cause })
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}
