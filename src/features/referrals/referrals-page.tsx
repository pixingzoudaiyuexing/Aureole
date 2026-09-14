import { useState, type ReactNode } from 'react'
import { Check, ChevronLeft, ChevronRight, Copy } from 'lucide-react'
import { useAccountConfig } from '@/features/account/account-queries'
import type { AccountConfig } from '@/features/account/account-api'
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { useExitOnInvalidSessionError } from '@/features/auth/use-exit-on-invalid-session-error'
import { formatMinorMoney } from '@/features/catalog/money-format'
import { formatAbsoluteDateTime } from '@/features/subscription/subscription-format'
import { ReadError } from '@/components/shared/read-error'
import { Button } from '@/components/ui/button'
import { useAuthSessionStore } from '@/lib/auth/session-store'
import type { CommissionPage, ReferralOverview } from './referrals-api'
import { ReferralCreateControl } from './referral-create-control'
import { CommissionTransferControl } from './commission-transfer-control'
import { WithdrawalRequestControl } from './withdrawal-request-control'
import {
  useReferralCommissions,
  useReferralOverview,
  useReferralWithdrawalOptions,
} from './referrals-queries'

function formatInteger(value: number) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(
    value,
  )
}

function MoneyValue({
  value,
  config,
}: {
  value: number
  config: AccountConfig | null
}) {
  const formatted = config ? formatMinorMoney(value, config) : null
  return (
    <span className="break-words tabular-nums [overflow-wrap:anywhere]">
      {formatted ?? `${formatInteger(value)} 最小货币单位`}
    </span>
  )
}

function SummaryItem({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="min-w-0 py-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-2 min-w-0 text-lg font-semibold">{children}</dd>
    </div>
  )
}

function ReferralSummary({
  overview,
  config,
}: {
  overview: ReferralOverview
  config: AccountConfig | null
}) {
  return (
    <dl className="mt-5 grid grid-cols-1 gap-x-8 divide-y divide-border border-y border-border sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-3">
      <SummaryItem label="已注册用户">
        <span className="break-all tabular-nums">
          {formatInteger(overview.stats.registeredUsers)}
        </span>
      </SummaryItem>
      <SummaryItem label="佣金比例">
        <span className="break-all tabular-nums">
          {overview.stats.commissionRatePercent}%
        </span>
      </SummaryItem>
      <SummaryItem label="累计佣金">
        <MoneyValue
          value={overview.stats.earnedCommissionMinor}
          config={config}
        />
      </SummaryItem>
      <SummaryItem label="待处理佣金">
        <MoneyValue
          value={overview.stats.pendingCommissionMinor}
          config={config}
        />
      </SummaryItem>
      <SummaryItem label="可用佣金">
        <MoneyValue
          value={overview.stats.availableCommissionMinor}
          config={config}
        />
      </SummaryItem>
    </dl>
  )
}

function ReferralCodes({ codes }: { codes: ReferralOverview['codes'] }) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [copyFailedIndex, setCopyFailedIndex] = useState<number | null>(null)

  async function copyCode(code: string, index: number) {
    setCopiedIndex(null)
    setCopyFailedIndex(null)
    try {
      await navigator.clipboard.writeText(code)
      setCopiedIndex(index)
    } catch {
      setCopyFailedIndex(index)
    }
  }

  return (
    <div className="mt-8" aria-labelledby="referral-codes-title">
      <h4 id="referral-codes-title" className="text-sm font-semibold">
        邀请码
      </h4>
      {codes.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">暂无邀请码。</p>
      ) : (
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {codes.map((item, index) => (
            <li
              key={`${item.code}-${index}`}
              className="flex min-w-0 flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="break-all font-mono text-sm font-semibold">
                  {item.code}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  创建于 {formatAbsoluteDateTime(item.createdAt)}
                </p>
                {copyFailedIndex === index ? (
                  <p className="mt-2 text-xs text-destructive" role="alert">
                    无法复制邀请码，请重试或手动复制。
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 self-start sm:self-auto"
                aria-label={`${copiedIndex === index ? '已复制' : '复制邀请码'} ${item.code}`}
                onClick={() => void copyCode(item.code, index)}
              >
                {copiedIndex === index ? (
                  <Check className="size-4" aria-hidden="true" />
                ) : (
                  <Copy className="size-4" aria-hidden="true" />
                )}
                {copiedIndex === index ? '已复制' : '复制'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CommissionHistory({
  data,
  config,
}: {
  data: CommissionPage
  config: AccountConfig | null
}) {
  if (data.items.length === 0 && data.total === 0) {
    return <p className="text-sm text-muted-foreground">暂无佣金记录。</p>
  }

  return (
    <div className="border-y border-border">
      <div
        className="hidden grid-cols-[minmax(10rem,1fr)_minmax(10rem,1fr)_minmax(12rem,1fr)] gap-5 border-b border-border py-3 text-xs font-medium text-muted-foreground sm:grid"
        aria-hidden="true"
      >
        <span>订单金额</span>
        <span>佣金金额</span>
        <span>产生时间</span>
      </div>
      <div className="divide-y divide-border">
        {data.items.map((item, index) => (
          <article
            key={`${item.createdAt}-${index}`}
            className="grid min-w-0 gap-3 py-4 sm:grid-cols-[minmax(10rem,1fr)_minmax(10rem,1fr)_minmax(12rem,1fr)] sm:items-center sm:gap-5"
          >
            <p className="min-w-0 text-sm">
              <span className="mr-2 text-xs text-muted-foreground sm:hidden">
                订单金额
              </span>
              <MoneyValue value={item.orderAmountMinor} config={config} />
            </p>
            <p className="min-w-0 text-sm font-semibold">
              <span className="mr-2 text-xs font-normal text-muted-foreground sm:hidden">
                佣金金额
              </span>
              <MoneyValue value={item.commissionAmountMinor} config={config} />
            </p>
            <time className="min-w-0 text-sm">
              <span className="mr-2 text-xs text-muted-foreground sm:hidden">
                产生时间
              </span>
              {formatAbsoluteDateTime(item.createdAt)}
            </time>
          </article>
        ))}
      </div>
    </div>
  )
}

export function ReferralsPage() {
  const accessToken = useAuthSessionStore((state) => state.accessToken)
  if (!accessToken) return null
  return <ReferralsContent accessToken={accessToken} />
}

function ReferralsContent({ accessToken }: { accessToken: string }) {
  const [page, setPage] = useState(1)
  const overview = useReferralOverview(accessToken)
  const commissions = useReferralCommissions(accessToken, page)
  const withdrawal = useReferralWithdrawalOptions(accessToken)
  const config = useAccountConfig(accessToken)
  const invalid = [
    overview.error,
    commissions.error,
    withdrawal.error,
    config.error,
  ].find(isInvalidSessionError)
  useExitOnInvalidSessionError(invalid)

  if (invalid) return null
  const overviewAuthorityReady = overview.isSuccess && !overview.isFetching

  return (
    <div className="mx-auto max-w-5xl">
      <div className="pb-8">
        <p className="text-xs font-semibold uppercase text-primary">
          推荐与佣金
        </p>
        <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">Referrals</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          查看邀请码、佣金记录和当前提现状态。
        </p>
      </div>

      <section
        className="border-t border-border py-8"
        aria-labelledby="referral-overview-title"
      >
        <h3 id="referral-overview-title" className="text-base font-semibold">
          推荐概览
        </h3>
        <div className="mt-5" aria-labelledby="referral-codes-action-title">
          <h4
            id="referral-codes-action-title"
            className="text-sm font-semibold"
          >
            邀请码操作
          </h4>
          <ReferralCreateControl
            accessToken={accessToken}
            overviewAuthorityReady={overviewAuthorityReady}
          />
        </div>
        <div className="mt-5 min-h-40" aria-live="polite">
          {overview.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              正在读取推荐概览…
            </p>
          ) : overview.isError ? (
            <ReadError
              message="暂时无法读取推荐概览和邀请码。"
              error={overview.error}
              retry={() => void overview.refetch()}
            />
          ) : (
            <>
              {config.isPending ? (
                <p role="status" className="text-xs text-muted-foreground">
                  正在读取结算币种；金额暂以最小货币单位显示。
                </p>
              ) : config.isError ? (
                <div className="mb-5">
                  <ReadError
                    message="暂时无法读取结算币种；金额仍以最小货币单位显示。"
                    error={config.error}
                    retry={() => void config.refetch()}
                  />
                </div>
              ) : null}
              <ReferralSummary
                overview={overview.data}
                config={config.data ?? null}
              />
              <ReferralCodes codes={overview.data.codes} />
            </>
          )}
        </div>
      </section>

      <CommissionTransferControl accessToken={accessToken} />

      <section
        className="border-t border-border py-8"
        aria-labelledby="commission-history-title"
      >
        <div className="mb-6">
          <h3 id="commission-history-title" className="text-base font-semibold">
            佣金记录
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            按服务端返回顺序展示订单金额、佣金金额和产生时间。
          </p>
        </div>
        <div className="min-h-28" aria-live="polite">
          {commissions.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              正在读取佣金记录…
            </p>
          ) : commissions.isError ? (
            <ReadError
              message="暂时无法读取佣金记录。"
              error={commissions.error}
              retry={() => void commissions.refetch()}
            />
          ) : (
            <>
              <CommissionHistory
                data={commissions.data}
                config={config.data ?? null}
              />
              <nav
                className="mt-5 flex items-center justify-between gap-4"
                aria-label="佣金记录分页"
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || commissions.isFetching}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                  上一页
                </Button>
                <p className="text-sm tabular-nums text-muted-foreground">
                  第 {commissions.data.page} 页
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    commissions.data.page * commissions.data.pageSize >=
                      commissions.data.total || commissions.isFetching
                  }
                  onClick={() => setPage((current) => current + 1)}
                >
                  下一页
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Button>
              </nav>
            </>
          )}
        </div>
      </section>

      <WithdrawalRequestControl
        accessToken={accessToken}
        options={withdrawal}
      />
    </div>
  )
}
