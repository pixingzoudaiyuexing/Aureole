import { ApiError } from '@/lib/api/errors'

export function MutationFeedback({
  error,
  message,
}: {
  error: unknown
  message: string
}) {
  const requestId = error instanceof ApiError ? error.requestId : undefined

  return (
    <div
      className="border-l-2 border-destructive bg-destructive/5 px-4 py-3"
      role="alert"
    >
      <p className="text-sm text-foreground">{message}</p>
      {requestId ? (
        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
          请求编号：{requestId}
        </p>
      ) : null}
    </div>
  )
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  )
}
