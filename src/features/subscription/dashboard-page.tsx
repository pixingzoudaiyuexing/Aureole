import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { useAuthSessionStore } from '@/lib/auth/session-store'
import { DashboardSubscriptionDetails } from './subscription-overview'
import { useSubscriptionOverview } from './subscription-queries'
import { SubscriptionReadError } from './subscription-state'
import { useExitOnInvalidSubscriptionError } from './use-subscription-auth-failure'

export function DashboardPage() {
  const accessToken = useAuthSessionStore((state) => state.accessToken)
  if (!accessToken) return null
  return <DashboardContent accessToken={accessToken} />
}

function DashboardContent({ accessToken }: { accessToken: string }) {
  const overview = useSubscriptionOverview(accessToken)
  useExitOnInvalidSubscriptionError(overview.error)

  if (isInvalidSessionError(overview.error)) return null

  return (
    <div className="mx-auto max-w-5xl">
      <div className="pb-8">
        <p className="text-xs font-semibold uppercase text-primary">账户概览</p>
        <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">概览</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          先查看当前订阅状态，再进入订阅页面查看访问地址。
        </p>
      </div>

      <section
        className="border-t border-border py-8"
        aria-labelledby="dashboard-subscription-title"
      >
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3
              id="dashboard-subscription-title"
              className="text-base font-semibold"
            >
              当前订阅
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              套餐、到期时间和权威流量数据。
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/subscription">
              查看订阅详情
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>

        {overview.isPending ? (
          <p className="text-sm text-muted-foreground" role="status">
            正在读取订阅概览…
          </p>
        ) : overview.isError ? (
          <SubscriptionReadError
            message="暂时无法读取订阅概览。"
            error={overview.error}
            retry={() => void overview.refetch()}
          />
        ) : (
          <DashboardSubscriptionDetails overview={overview.data} />
        )}
      </section>
    </div>
  )
}
