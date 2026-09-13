import { ReadError } from '@/components/shared/read-error'
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { useExitOnInvalidSessionError } from '@/features/auth/use-exit-on-invalid-session-error'
import { TrafficHistory } from '@/features/traffic/traffic-history'
import { useTrafficLogs } from '@/features/traffic/traffic-queries'
import { useAuthSessionStore } from '@/lib/auth/session-store'
import { SubscriptionCredential } from './subscription-access'
import {
  CurrentSubscriptionDetails,
  DeviceAndPeriodDetails,
  TrafficDetails,
} from './subscription-overview'
import {
  useSubscriptionAccess,
  useSubscriptionOverview,
} from './subscription-queries'
import { SubscriptionSection } from './subscription-state'

export function SubscriptionPage() {
  const accessToken = useAuthSessionStore((state) => state.accessToken)
  if (!accessToken) return null
  return <SubscriptionContent accessToken={accessToken} />
}

function SubscriptionContent({ accessToken }: { accessToken: string }) {
  const overview = useSubscriptionOverview(accessToken)
  const access = useSubscriptionAccess(accessToken)
  const traffic = useTrafficLogs(accessToken)
  const invalidSessionError = isInvalidSessionError(overview.error)
    ? overview.error
    : isInvalidSessionError(access.error)
      ? access.error
      : isInvalidSessionError(traffic.error)
        ? traffic.error
        : null
  useExitOnInvalidSessionError(invalidSessionError)

  if (invalidSessionError) return null

  return (
    <div className="mx-auto max-w-5xl">
      <div className="pb-8">
        <p className="text-xs font-semibold uppercase text-primary">订阅中心</p>
        <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">订阅</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          查看当前套餐、流量、设备信息和订阅地址。
        </p>
      </div>

      {overview.isPending ? (
        <section className="border-t border-border py-8" aria-live="polite">
          <p className="text-sm text-muted-foreground">正在读取订阅概览…</p>
        </section>
      ) : overview.isError ? (
        <SubscriptionSection
          id="subscription-overview-error"
          title="订阅概览"
          description="当前套餐与使用情况。"
        >
          <ReadError
            message="暂时无法读取订阅概览。"
            error={overview.error}
            retry={() => void overview.refetch()}
          />
        </SubscriptionSection>
      ) : (
        <>
          <SubscriptionSection
            id="current-subscription-title"
            title="当前订阅"
            description="当前套餐和到期时间。"
          >
            <CurrentSubscriptionDetails overview={overview.data} />
          </SubscriptionSection>
          <SubscriptionSection
            id="subscription-traffic-title"
            title="流量"
            description="分别查看上传、下载与流量额度。"
          >
            <TrafficDetails overview={overview.data} />
          </SubscriptionSection>
          <SubscriptionSection
            id="subscription-device-title"
            title="设备与周期"
            description="设备数量与当前功能配置。"
          >
            <DeviceAndPeriodDetails overview={overview.data} />
          </SubscriptionSection>
        </>
      )}

      <SubscriptionSection
        id="subscription-access-title"
        title="订阅地址"
        description="此地址包含访问凭据，请仅复制到可信客户端。"
      >
        {access.isPending ? (
          <p className="text-sm text-muted-foreground" role="status">
            正在读取订阅地址…
          </p>
        ) : access.isError ? (
          <ReadError
            message="暂时无法读取订阅地址。"
            error={access.error}
            retry={() => void access.refetch()}
          />
        ) : access.data.eligible ? (
          <SubscriptionCredential
            key={access.data.accessUrl}
            accessUrl={access.data.accessUrl}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            当前没有可展示的订阅地址。
          </p>
        )}
      </SubscriptionSection>

      <SubscriptionSection
        id="traffic-history-title"
        title="流量历史"
        description="按服务返回顺序查看本期流量记录。"
      >
        <TrafficHistory
          entries={traffic.data}
          pending={traffic.isPending}
          error={traffic.isError ? traffic.error : null}
          retry={() => void traffic.refetch()}
        />
      </SubscriptionSection>
    </div>
  )
}
