import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { AccountConfig } from '@/features/account/account-api'
import { useAccountConfig } from '@/features/account/account-queries'
import { formatMinorMoney } from '@/features/catalog/money-format'
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { useExitOnInvalidSessionError } from '@/features/auth/use-exit-on-invalid-session-error'
import { formatAbsoluteDateTime } from '@/features/subscription/subscription-format'
import { ReadError } from '@/components/shared/read-error'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuthSessionStore } from '@/lib/auth/session-store'
import { ApiError } from '@/lib/api/errors'
import type { Order, OrderStatus } from './orders-api'
import { useOrderDetail, useOrders } from './orders-queries'

const statusLabels: Record<OrderStatus, string> = {
  pending: '待支付',
  processing: '已支付，开通处理中',
  cancelled: '已取消',
  completed: '已完成',
  adjusted: '已用于套餐变更折抵',
}

function OrderStatusLabel({ status }: { status: OrderStatus }) {
  return (
    <span className="inline-flex max-w-full rounded-sm border border-border bg-muted px-2 py-1 text-xs font-medium text-foreground">
      {statusLabels[status]}
    </span>
  )
}

function OrderAmount({
  order,
  config,
  configPending,
}: {
  order: Order
  config: AccountConfig | null
  configPending: boolean
}) {
  const formatted = config ? formatMinorMoney(order.amountMinor, config) : null
  return (
    <span className="break-all">
      {configPending ? '正在读取币种…' : (formatted ?? '金额暂无法安全格式化')}
    </span>
  )
}

function DetailField({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm font-medium">{children}</dd>
    </div>
  )
}

export function OrdersPage() {
  const accessToken = useAuthSessionStore((state) => state.accessToken)
  if (!accessToken) return null
  return <OrdersContent accessToken={accessToken} />
}

function OrdersContent({ accessToken }: { accessToken: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedTriggerRef = useRef<HTMLButtonElement | null>(null)
  const orders = useOrders(accessToken)
  const detail = useOrderDetail(accessToken, selectedId)
  const config = useAccountConfig(accessToken)
  const invalid = isInvalidSessionError(orders.error)
    ? orders.error
    : isInvalidSessionError(detail.error)
      ? detail.error
      : isInvalidSessionError(config.error)
        ? config.error
        : null
  useExitOnInvalidSessionError(invalid)

  if (invalid) return null

  const accountConfig = config.isSuccess ? config.data : null

  return (
    <div className="mx-auto max-w-5xl">
      <div className="pb-8">
        <p className="text-xs font-semibold uppercase text-primary">订单记录</p>
        <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">订单</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          查看订单状态、金额和时间。
        </p>
      </div>

      <section
        className="border-t border-border py-8"
        aria-labelledby="orders-list-title"
      >
        <div className="mb-6">
          <h3 id="orders-list-title" className="text-base font-semibold">
            订单列表
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            按服务返回顺序展示。
          </p>
        </div>

        {config.isError ? (
          <div className="mb-6 border-y border-border py-4">
            <ReadError
              message="暂时无法读取结算币种，订单金额无法安全格式化。"
              error={config.error}
              retry={() => void config.refetch()}
            />
          </div>
        ) : null}

        {orders.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">
            正在读取订单…
          </p>
        ) : orders.isError ? (
          <ReadError
            message="暂时无法读取订单。"
            error={orders.error}
            retry={() => void orders.refetch()}
          />
        ) : orders.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">当前没有订单。</p>
        ) : (
          <div className="border-y border-border">
            <div
              className="hidden grid-cols-[minmax(10rem,1.2fr)_minmax(9rem,0.8fr)_minmax(10rem,0.8fr)_minmax(10rem,0.8fr)] gap-5 border-b border-border py-3 text-xs font-medium text-muted-foreground sm:grid"
              aria-hidden="true"
            >
              <span>订单编号</span>
              <span>状态</span>
              <span>金额</span>
              <span>创建时间</span>
            </div>
            <div className="divide-y divide-border">
              {orders.data.map((order) => (
                <button
                  type="button"
                  className="grid min-h-20 w-full gap-3 py-4 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(10rem,1.2fr)_minmax(9rem,0.8fr)_minmax(10rem,0.8fr)_minmax(10rem,0.8fr)] sm:items-center sm:gap-5"
                  key={order.id}
                  onClick={(event) => {
                    selectedTriggerRef.current = event.currentTarget
                    setSelectedId(order.id)
                  }}
                >
                  <span className="min-w-0 break-all font-mono text-sm font-medium">
                    {order.id}
                  </span>
                  <span>
                    <span className="mr-2 text-xs text-muted-foreground sm:hidden">
                      状态
                    </span>
                    <OrderStatusLabel status={order.status} />
                  </span>
                  <span className="text-sm font-medium">
                    <span className="mr-2 text-xs font-normal text-muted-foreground sm:hidden">
                      金额
                    </span>
                    <OrderAmount
                      order={order}
                      config={accountConfig}
                      configPending={config.isPending}
                    />
                  </span>
                  <span className="text-sm">
                    <span className="mr-2 text-xs text-muted-foreground sm:hidden">
                      创建时间
                    </span>
                    {formatAbsoluteDateTime(order.createdAt)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <Dialog
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null)
        }}
      >
        <DialogContent
          closeLabel="关闭订单详情"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            selectedTriggerRef.current?.focus()
            selectedTriggerRef.current = null
          }}
        >
          <div className="border-b border-border px-6 py-5 pr-16">
            <DialogTitle className="break-all text-lg font-semibold">
              {detail.data ? `订单 ${detail.data.id}` : '订单详情'}
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-muted-foreground">
              查看订单的权威状态、金额和时间。
            </DialogDescription>
          </div>
          <div className="min-h-0 overflow-y-auto px-6 py-5">
            {detail.isPending ? (
              <p role="status" className="text-sm text-muted-foreground">
                正在读取订单详情…
              </p>
            ) : detail.isError ? (
              detail.error instanceof ApiError &&
              detail.error.code === 'ORDER_NOT_FOUND' ? (
                <p role="alert" className="text-sm">
                  该订单不存在或已不可用。
                </p>
              ) : (
                <ReadError
                  message="暂时无法读取订单详情。"
                  error={detail.error}
                  retry={() => void detail.refetch()}
                />
              )
            ) : detail.data ? (
              <dl className="divide-y divide-border border-y border-border">
                <DetailField label="订单编号">
                  <span className="break-all font-mono">{detail.data.id}</span>
                </DetailField>
                <DetailField label="状态">
                  <OrderStatusLabel status={detail.data.status} />
                </DetailField>
                <DetailField label="金额">
                  <OrderAmount
                    order={detail.data}
                    config={accountConfig}
                    configPending={config.isPending}
                  />
                </DetailField>
                <DetailField label="创建时间">
                  {formatAbsoluteDateTime(detail.data.createdAt)}
                </DetailField>
                <DetailField label="更新时间">
                  {detail.data.updatedAt === null
                    ? '暂无更新时间'
                    : formatAbsoluteDateTime(detail.data.updatedAt)}
                </DetailField>
                <DetailField label="订单过期时间">
                  {detail.data.expiresAt === null
                    ? '未提供订单过期时间'
                    : formatAbsoluteDateTime(detail.data.expiresAt)}
                </DetailField>
              </dl>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
