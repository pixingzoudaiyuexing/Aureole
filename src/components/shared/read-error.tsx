import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api/errors'

export function ReadError({
  message,
  error,
  retry,
}: {
  message: string
  error: unknown
  retry: () => void
}) {
  const requestId = error instanceof ApiError ? error.requestId : undefined
  return (
    <div className="space-y-3" role="alert">
      <div>
        <p className="text-sm text-foreground">{message}</p>
        {requestId ? (
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
            请求编号：{requestId}
          </p>
        ) : null}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={retry}>
        <RefreshCw className="size-4" aria-hidden="true" />
        重试
      </Button>
    </div>
  )
}
