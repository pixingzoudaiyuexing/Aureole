import { Link } from '@tanstack/react-router'
import { ChevronRight, RefreshCw } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import type { CurrentUser } from '@/features/auth/auth-api'
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { useAuth } from '@/features/auth/auth-context'
import { ApiError } from '@/lib/api/errors'
import { useAuthSessionStore } from '@/lib/auth/session-store'
import type { AccountStats } from './account-api'
import { useAccountConfig, useAccountStats } from './account-queries'
import { PasswordChangeSection } from './password-change-section'
import { PreferencesSection } from './preferences-section'

const statusPresentation = {
  active: {
    label: '正常',
    className: 'border-primary/30 bg-primary/5 text-primary',
  },
  expired: {
    label: '已过期',
    className: 'border-border bg-muted text-muted-foreground',
  },
  disabled: {
    label: '已停用',
    className: 'border-destructive/30 bg-destructive/5 text-destructive',
  },
} as const

const statsRows: Array<{
  key: keyof AccountStats
  label: string
  to: '/orders' | '/support' | '/referrals'
}> = [
  { key: 'pendingOrders', label: '待处理订单', to: '/orders' },
  { key: 'openTickets', label: '开放工单', to: '/support' },
  { key: 'invitedUsers', label: '已邀请用户', to: '/referrals' },
]

function formatExpiry(value: string | null) {
  if (!value) return '无固定到期时间'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function AccountSection({
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

function QueryError({
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

export function AccountPage() {
  const { currentUser } = useAuth()
  const accessToken = useAuthSessionStore((state) => state.accessToken)

  if (!currentUser || !accessToken) return null
  return <AccountContent currentUser={currentUser} accessToken={accessToken} />
}

function AccountContent({
  currentUser,
  accessToken,
}: {
  currentUser: CurrentUser
  accessToken: string
}) {
  const { logout } = useAuth()
  const stats = useAccountStats(accessToken)
  const config = useAccountConfig(accessToken)
  const status = statusPresentation[currentUser.status]

  useEffect(() => {
    if (
      (stats.isError && isInvalidSessionError(stats.error)) ||
      (config.isError && isInvalidSessionError(config.error))
    ) {
      logout()
    }
  }, [config.error, config.isError, logout, stats.error, stats.isError])

  return (
    <div className="mx-auto max-w-5xl">
      <div className="pb-8">
        <p className="text-xs font-semibold uppercase text-primary">账户中心</p>
        <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">账户</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          查看账户状态，管理提醒与登录密码。
        </p>
      </div>

      <AccountSection
        id="account-details-title"
        title="基本信息"
        description="当前账户身份、状态与结算币种。"
      >
        <dl className="divide-y divide-border border-y border-border">
          <div className="grid gap-1 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center">
            <dt className="text-sm text-muted-foreground">邮箱</dt>
            <dd className="break-all text-sm font-medium">
              {currentUser.email}
            </dd>
          </div>
          <div className="grid gap-1 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center">
            <dt className="text-sm text-muted-foreground">账户状态</dt>
            <dd>
              <span
                className={`inline-flex rounded-sm border px-2 py-1 text-xs font-medium ${status.className}`}
              >
                {status.label}
              </span>
            </dd>
          </div>
          <div className="grid gap-1 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center">
            <dt className="text-sm text-muted-foreground">到期时间</dt>
            <dd className="text-sm font-medium">
              {formatExpiry(currentUser.expiresAt)}
            </dd>
          </div>
          <div className="grid gap-1 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center">
            <dt className="text-sm text-muted-foreground">结算币种</dt>
            <dd className="text-sm font-medium">
              {config.isPending ? (
                <span className="text-muted-foreground" role="status">
                  正在读取…
                </span>
              ) : config.isError ? (
                <QueryError
                  message="暂时无法读取结算币种。"
                  error={config.error}
                  retry={() => void config.refetch()}
                />
              ) : (
                `${config.data.currency} (${config.data.currencySymbol})`
              )}
            </dd>
          </div>
        </dl>
      </AccountSection>

      <AccountSection
        id="account-stats-title"
        title="账户概览"
        description="来自账户服务的当前数量。"
      >
        {stats.isPending ? (
          <p className="text-sm text-muted-foreground" role="status">
            正在读取账户概览…
          </p>
        ) : stats.isError ? (
          <QueryError
            message="暂时无法读取账户概览。"
            error={stats.error}
            retry={() => void stats.refetch()}
          />
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {statsRows.map(({ key, label, to }) => (
              <Link
                key={key}
                to={to}
                className="group flex min-h-14 items-center justify-between gap-5 py-3 outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`${label} ${stats.data[key]}，查看详情`}
              >
                <span className="text-sm font-medium">{label}</span>
                <span className="flex items-center gap-3">
                  <span className="font-mono text-sm tabular-nums">
                    {stats.data[key]}
                  </span>
                  <ChevronRight
                    className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            ))}
          </div>
        )}
      </AccountSection>

      <AccountSection
        id="account-preferences-title"
        title="偏好设置"
        description="选择需要启用的账户提醒与续费偏好。"
      >
        <PreferencesSection accessToken={accessToken} />
      </AccountSection>

      <AccountSection
        id="account-security-title"
        title="修改密码"
        description="修改后，所有设备都需要使用新密码重新登录。"
      >
        <PasswordChangeSection accessToken={accessToken} />
      </AccountSection>
    </div>
  )
}
