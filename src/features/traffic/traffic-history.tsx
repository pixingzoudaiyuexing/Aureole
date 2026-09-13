import { ReadError } from '@/components/shared/read-error'
import {
  formatAbsoluteDateTime,
  formatBytes,
} from '@/features/subscription/subscription-format'
import type { TrafficLogEntry } from './traffic-api'

export function TrafficHistory({
  entries,
  pending,
  error,
  retry,
}: {
  entries: TrafficLogEntry[] | undefined
  pending: boolean
  error: unknown
  retry: () => void
}) {
  if (pending) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        正在读取流量历史…
      </p>
    )
  }
  if (error) {
    return (
      <ReadError message="暂时无法读取流量历史。" error={error} retry={retry} />
    )
  }
  if (!entries || entries.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无流量记录。</p>
  }

  return (
    <ol className="divide-y divide-border border-y border-border">
      {entries.map((entry, index) => (
        <li
          className="grid gap-3 py-4 sm:grid-cols-[minmax(10rem,1fr)_repeat(3,minmax(6rem,0.55fr))] sm:items-center sm:gap-5"
          key={`${entry.recordedAt}-${index}`}
        >
          <p className="text-sm font-medium">
            {formatAbsoluteDateTime(entry.recordedAt)}
          </p>
          <p className="text-sm">
            <span className="text-muted-foreground">上传 </span>
            {formatBytes(entry.uploadedBytes)}
          </p>
          <p className="text-sm">
            <span className="text-muted-foreground">下载 </span>
            {formatBytes(entry.downloadedBytes)}
          </p>
          <p className="text-sm">
            <span className="text-muted-foreground">倍率 </span>×
            {entry.rateMultiplier}
          </p>
        </li>
      ))}
    </ol>
  )
}
