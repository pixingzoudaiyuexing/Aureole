import type { SubscriptionOverview } from './subscription-api'
import { formatBytes, formatSubscriptionExpiry } from './subscription-format'

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-center">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm font-medium">{value}</dd>
    </div>
  )
}

export function CurrentSubscriptionDetails({
  overview,
}: {
  overview: SubscriptionOverview
}) {
  return (
    <dl className="divide-y divide-border border-y border-border">
      <DataRow
        label="当前套餐"
        value={overview.product?.name ?? '暂无当前套餐'}
      />
      <DataRow
        label="到期时间"
        value={formatSubscriptionExpiry(overview.expiresAt)}
      />
    </dl>
  )
}

export function TrafficDetails({
  overview,
}: {
  overview: SubscriptionOverview
}) {
  return (
    <dl className="divide-y divide-border border-y border-border">
      <DataRow
        label="已上传"
        value={formatBytes(overview.traffic.uploadedBytes)}
      />
      <DataRow
        label="已下载"
        value={formatBytes(overview.traffic.downloadedBytes)}
      />
      <DataRow
        label="流量额度"
        value={formatBytes(overview.traffic.allowanceBytes)}
      />
    </dl>
  )
}

export function DeviceAndPeriodDetails({
  overview,
}: {
  overview: SubscriptionOverview
}) {
  return (
    <dl className="divide-y divide-border border-y border-border">
      <DataRow label="活跃设备" value={String(overview.activeDevices)} />
      <DataRow
        label="设备限制"
        value={
          overview.deviceLimit === null
            ? '未提供'
            : String(overview.deviceLimit)
        }
      />
      <DataRow
        label="重置日"
        value={
          overview.resetDay === null ? '未提供' : String(overview.resetDay)
        }
      />
      <DataRow
        label="新周期功能"
        value={overview.renewalAllowed ? '已启用' : '未启用'}
      />
    </dl>
  )
}

export function DashboardSubscriptionDetails({
  overview,
}: {
  overview: SubscriptionOverview
}) {
  return (
    <dl className="divide-y divide-border border-y border-border">
      <DataRow
        label="当前套餐"
        value={overview.product?.name ?? '暂无当前套餐'}
      />
      <DataRow
        label="到期时间"
        value={formatSubscriptionExpiry(overview.expiresAt)}
      />
      <DataRow
        label="已上传"
        value={formatBytes(overview.traffic.uploadedBytes)}
      />
      <DataRow
        label="已下载"
        value={formatBytes(overview.traffic.downloadedBytes)}
      />
      <DataRow
        label="流量额度"
        value={formatBytes(overview.traffic.allowanceBytes)}
      />
    </dl>
  )
}
