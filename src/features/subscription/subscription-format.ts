export function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  )
  const value = bytes / 1024 ** unitIndex
  return `${new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 2,
  }).format(value)} ${units[unitIndex]}`
}

export function formatSubscriptionExpiry(value: string | null) {
  if (!value) return '无固定到期时间'
  return formatAbsoluteDateTime(value)
}

export function formatAbsoluteDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
