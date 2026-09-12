import type { ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api/errors'

export function SubscriptionReadError({
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

export function SubscriptionSection({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section
      className="grid gap-5 border-t border-border py-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10"
      aria-labelledby={id}
    >
      <div>
        <h3 id={id} className="text-base font-semibold">
          {title}
        </h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}
