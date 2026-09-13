import { useRef, useState } from 'react'
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { useExitOnInvalidSessionError } from '@/features/auth/use-exit-on-invalid-session-error'
import type { AccountConfig } from '@/features/account/account-api'
import { useAccountConfig } from '@/features/account/account-queries'
import { ReadError } from '@/components/shared/read-error'
import { Button } from '@/components/ui/button'
import { OrderCreateDialog } from '@/features/orders/order-create-dialog'
import { useAuthSessionStore } from '@/lib/auth/session-store'
import type { Product } from './catalog-api'
import { billingPeriodLabels } from './billing-periods'
import { useProducts } from './catalog-queries'
import { formatMinorMoney } from './money-format'

export function PlansPage() {
  const accessToken = useAuthSessionStore((state) => state.accessToken)
  if (!accessToken) return null
  return <PlansContent accessToken={accessToken} />
}

function PlansContent({ accessToken }: { accessToken: string }) {
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null,
  )
  const [uncertainProductIds, setUncertainProductIds] = useState<Set<string>>(
    () => new Set(),
  )
  const selectedTriggerRef = useRef<HTMLButtonElement | null>(null)
  const products = useProducts(accessToken)
  const config = useAccountConfig(accessToken)
  const invalidSessionError = isInvalidSessionError(products.error)
    ? products.error
    : isInvalidSessionError(config.error)
      ? config.error
      : null
  useExitOnInvalidSessionError(invalidSessionError)

  if (invalidSessionError) return null

  return (
    <div className="mx-auto max-w-5xl">
      <div className="pb-8">
        <p className="text-xs font-semibold uppercase text-primary">套餐目录</p>
        <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">套餐</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          查看套餐规格、容量状态和周期价格。
        </p>
      </div>

      <section
        className="border-t border-border py-8"
        aria-labelledby="plans-list-title"
      >
        <div className="mb-6">
          <h3 id="plans-list-title" className="text-base font-semibold">
            套餐列表
          </h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            按服务返回顺序展示。
          </p>
        </div>

        {config.isError ? (
          <div className="mb-6 border-y border-border py-4">
            <ReadError
              message="暂时无法读取结算币种，套餐价格无法安全格式化。"
              error={config.error}
              retry={() => void config.refetch()}
            />
          </div>
        ) : null}

        {products.isPending ? (
          <p className="text-sm text-muted-foreground" role="status">
            正在读取套餐…
          </p>
        ) : products.isError ? (
          <ReadError
            message="暂时无法读取套餐。"
            error={products.error}
            retry={() => void products.refetch()}
          />
        ) : products.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            当前没有可展示的套餐。
          </p>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {products.data.map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                config={config.isSuccess ? config.data : null}
                configPending={config.isPending}
                onCreate={(productId, trigger) => {
                  selectedTriggerRef.current = trigger
                  setSelectedProductId(productId)
                }}
              />
            ))}
          </div>
        )}
      </section>
      {selectedProductId ? (
        <OrderCreateDialog
          accessToken={accessToken}
          productId={selectedProductId}
          requiresUnknownAcknowledgement={uncertainProductIds.has(
            selectedProductId,
          )}
          onUnknownResultChange={(uncertain) => {
            setUncertainProductIds((current) => {
              const next = new Set(current)
              if (uncertain) next.add(selectedProductId)
              else next.delete(selectedProductId)
              return next
            })
          }}
          restoreFocus={() => {
            selectedTriggerRef.current?.focus()
            selectedTriggerRef.current = null
          }}
          onClosed={() => setSelectedProductId(null)}
        />
      ) : null}
    </div>
  )
}

function ProductRow({
  product,
  config,
  configPending,
  onCreate,
}: {
  product: Product
  config: AccountConfig | null
  configPending: boolean
  onCreate: (productId: string, trigger: HTMLButtonElement) => void
}) {
  return (
    <article className="grid gap-5 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.85fr)] lg:gap-10">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h4 className="break-words text-base font-semibold">
            {product.name}
          </h4>
          <span
            className={
              product.available
                ? 'rounded-sm border border-primary/30 bg-primary/5 px-2 py-1 text-xs font-medium text-primary'
                : 'rounded-sm border border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground'
            }
          >
            容量状态：{product.available ? '可用' : '暂不可用'}
          </span>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">流量额度</dt>
            <dd className="mt-1 font-medium">{product.dataAllowanceGb} GB</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">速度限制</dt>
            <dd className="mt-1 font-medium">
              {product.speedLimitMbps === null
                ? '未提供'
                : `${product.speedLimitMbps} Mbps`}
            </dd>
          </div>
        </dl>
      </div>

      <div className="min-w-0">
        <p className="text-sm font-medium">周期价格</p>
        {product.prices.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">暂无周期价格。</p>
        ) : (
          <dl className="mt-2 divide-y divide-border border-y border-border">
            {product.prices.map((price, index) => {
              const formatted = config
                ? formatMinorMoney(price.amountMinor, config)
                : null
              return (
                <div
                  className="flex min-h-11 items-center justify-between gap-4 py-2 text-sm"
                  key={`${price.billingPeriod}-${index}`}
                >
                  <dt className="text-muted-foreground">
                    {billingPeriodLabels[price.billingPeriod]}
                  </dt>
                  <dd className="break-all text-right font-medium">
                    {configPending
                      ? '正在读取币种…'
                      : (formatted ?? '价格暂无法安全格式化')}
                  </dd>
                </div>
              )
            })}
          </dl>
        )}
        {product.prices.length ? (
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={(event) => onCreate(product.id, event.currentTarget)}
          >
            创建订单
          </Button>
        ) : null}
      </div>
    </article>
  )
}
