import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { LoaderCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { useAccountConfig } from '@/features/account/account-queries'
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { MutationFeedback } from '@/features/auth/form-feedback'
import { useExitOnInvalidSessionError } from '@/features/auth/use-exit-on-invalid-session-error'
import { useSynchronousActionLock } from '@/features/auth/use-synchronous-action-lock'
import { billingPeriodLabels } from '@/features/catalog/billing-periods'
import {
  toNumericProductId,
  type BillingPeriod,
} from '@/features/catalog/catalog-api'
import { useProductDetail } from '@/features/catalog/catalog-queries'
import { formatMinorMoney } from '@/features/catalog/money-format'
import { ReadError } from '@/components/shared/read-error'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api/errors'
import {
  getCreateOrderErrorMessage,
  getPromotionErrorMessage,
  isAmbiguousCommerceMutationError,
} from './commerce-errors'
import { ordersApi } from './orders-api'
import { ordersListOptions, ordersQueryKeys } from './orders-queries'
import { promotionsApi, type PromotionPreview } from './promotions-api'

type CreateFeedback =
  | { kind: 'error'; error: unknown }
  | { kind: 'unknown'; error: unknown; ordersRefreshed: boolean }

export function OrderCreateDialog({
  accessToken,
  productId,
  requiresUnknownAcknowledgement,
  onUnknownResultChange,
  onClosed,
  restoreFocus,
}: {
  accessToken: string
  productId: string
  requiresUnknownAcknowledgement: boolean
  onUnknownResultChange: (uncertain: boolean) => void
  onClosed: () => void
  restoreFocus: () => void
}) {
  const queryClient = useQueryClient()
  const product = useProductDetail(accessToken, productId)
  const config = useAccountConfig(accessToken)
  const promotionLock = useSynchronousActionLock()
  const createLock = useSynchronousActionLock()
  const validationVersionRef = useRef(0)
  const [open, setOpen] = useState(true)
  const [selectedPeriod, setSelectedPeriod] = useState<BillingPeriod | null>(
    null,
  )
  const [promotionCode, setPromotionCode] = useState('')
  const [promotionPreview, setPromotionPreview] =
    useState<PromotionPreview | null>(null)
  const [promotionError, setPromotionError] = useState<unknown>(null)
  const [promotionFieldError, setPromotionFieldError] = useState<string | null>(
    null,
  )
  const [createFeedback, setCreateFeedback] = useState<CreateFeedback | null>(
    null,
  )
  const [createdOrder, setCreatedOrder] = useState<{
    id: string
    ordersRefreshed: boolean
  } | null>(null)
  const [unknownAcknowledged, setUnknownAcknowledged] = useState(false)
  const [sessionError, setSessionError] = useState<unknown>(null)

  const promotionMutation = useMutation({
    mutationFn: (input: { code: string; productId: number }) =>
      promotionsApi.validate(accessToken, input),
    retry: false,
  })
  const createMutation = useMutation({
    mutationFn: (input: {
      productId: string
      billingPeriod: BillingPeriod
      promotionCode?: string
    }) => ordersApi.create(accessToken, input),
    retry: false,
  })

  const invalidSessionError = isInvalidSessionError(product.error)
    ? product.error
    : isInvalidSessionError(config.error)
      ? config.error
      : isInvalidSessionError(promotionMutation.error)
        ? promotionMutation.error
        : isInvalidSessionError(createMutation.error)
          ? createMutation.error
          : isInvalidSessionError(sessionError)
            ? sessionError
            : null
  useExitOnInvalidSessionError(invalidSessionError)

  if (invalidSessionError) return null

  const selectedPrice = product.data?.prices.find(
    (price) => price.billingPeriod === selectedPeriod,
  )
  const formattedStickerPrice =
    selectedPrice && config.data
      ? formatMinorMoney(selectedPrice.amountMinor, config.data)
      : null
  const normalizedPromotionCode = promotionCode.trim()
  const promotionCodeValid =
    normalizedPromotionCode.length === 0 ||
    normalizedPromotionCode.length <= 255
  const requiresGuard =
    requiresUnknownAcknowledgement || createFeedback?.kind === 'unknown'

  const refreshOrders = async () => {
    await queryClient.invalidateQueries({
      queryKey: ordersQueryKeys.list,
      refetchType: 'none',
    })
    try {
      await queryClient.fetchQuery({
        ...ordersListOptions(accessToken),
        staleTime: 0,
      })
      return true
    } catch (error) {
      if (isInvalidSessionError(error)) setSessionError(error)
      return false
    }
  }

  const validatePromotion = async () => {
    if (!promotionLock.tryAcquire()) return
    const code = promotionCode.trim()
    if (!code) {
      setPromotionFieldError('请输入优惠码后再验证。')
      promotionLock.release()
      return
    }
    if (code.length > 255) {
      setPromotionFieldError('优惠码不能超过 255 个字符。')
      promotionLock.release()
      return
    }

    const version = ++validationVersionRef.current
    setPromotionFieldError(null)
    setPromotionError(null)
    setPromotionPreview(null)
    promotionMutation.reset()
    try {
      const preview = await promotionMutation.mutateAsync({
        code,
        productId: toNumericProductId(productId),
      })
      if (validationVersionRef.current === version) {
        setPromotionPreview(preview)
      }
    } catch (error) {
      if (isInvalidSessionError(error)) {
        setSessionError(error)
      } else if (validationVersionRef.current === version) {
        setPromotionError(error)
      }
    } finally {
      promotionLock.release()
    }
  }

  const createOrder = async () => {
    if (!selectedPeriod || !formattedStickerPrice || !promotionCodeValid) return
    if (requiresGuard && !unknownAcknowledged) return
    if (!createLock.tryAcquire()) return

    setCreateFeedback(null)
    setCreatedOrder(null)
    createMutation.reset()
    try {
      const result = await createMutation.mutateAsync({
        productId,
        billingPeriod: selectedPeriod,
        ...(normalizedPromotionCode
          ? { promotionCode: normalizedPromotionCode }
          : {}),
      })
      onUnknownResultChange(false)
      const ordersRefreshed = await refreshOrders()
      setCreatedOrder({ id: result.id, ordersRefreshed })
    } catch (error) {
      if (isInvalidSessionError(error)) {
        setSessionError(error)
        return
      }
      if (isAmbiguousCommerceMutationError(error)) {
        onUnknownResultChange(true)
        const ordersRefreshed = await refreshOrders()
        setUnknownAcknowledged(false)
        setCreateFeedback({
          kind: 'unknown',
          error,
          ordersRefreshed,
        })
      } else {
        onUnknownResultChange(false)
        if (error instanceof ApiError && error.code === 'PROMOTION_INVALID') {
          setPromotionPreview(null)
        }
        setCreateFeedback({ kind: 'error', error })
      }
    } finally {
      createLock.release()
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setOpen(false)
      }}
    >
      <DialogContent
        closeLabel="关闭创建订单"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          restoreFocus()
          onClosed()
        }}
      >
        <div className="border-b border-border px-6 py-5 pr-16">
          <DialogTitle className="break-words text-lg font-semibold">
            {product.data?.name ?? '创建订单'}
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm text-muted-foreground">
            选择下单周期并确认套餐标价。
          </DialogDescription>
        </div>

        <div className="min-h-0 overflow-y-auto px-6 py-5">
          {product.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              正在读取套餐详情…
            </p>
          ) : product.isError ? (
            product.error instanceof ApiError &&
            product.error.code === 'PRODUCT_NOT_FOUND' ? (
              <p role="alert" className="text-sm">
                该套餐当前不存在或不可用于此账户。
              </p>
            ) : (
              <ReadError
                message="暂时无法读取套餐详情。"
                error={product.error}
                retry={() => void product.refetch()}
              />
            )
          ) : createdOrder ? (
            <div className="space-y-5" aria-live="polite">
              <div className="border-l-2 border-primary bg-primary/5 px-4 py-3">
                <p className="text-sm font-semibold">订单已创建</p>
                <p className="mt-2 break-all font-mono text-sm">
                  订单编号：{createdOrder.id}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {createdOrder.ordersRefreshed
                    ? '订单列表已重新读取，请以订单详情中的状态和金额为准。'
                    : '订单列表暂时无法重新读取，请前往订单页面手动检查。'}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild>
                  <Link to="/orders">查看订单</Link>
                </Button>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    关闭
                  </Button>
                </DialogClose>
              </div>
            </div>
          ) : product.data ? (
            <div className="space-y-6">
              <dl className="grid gap-4 border-y border-border py-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">容量状态</dt>
                  <dd className="mt-1 font-medium">
                    {product.data.available ? '可用' : '暂不可用'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">流量额度</dt>
                  <dd className="mt-1 font-medium">
                    {product.data.dataAllowanceGb} GB
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">速度限制</dt>
                  <dd className="mt-1 font-medium">
                    {product.data.speedLimitMbps === null
                      ? '未提供'
                      : `${product.data.speedLimitMbps} Mbps`}
                  </dd>
                </div>
              </dl>

              {config.isError ? (
                <ReadError
                  message="暂时无法读取结算币种，不能安全确认套餐标价。"
                  error={config.error}
                  retry={() => void config.refetch()}
                />
              ) : null}

              {product.data.prices.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  当前套餐没有可选的下单周期。
                </p>
              ) : (
                <fieldset className="space-y-3">
                  <legend className="text-sm font-semibold">选择周期</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {product.data.prices.map((price, index) => {
                      const formatted = config.data
                        ? formatMinorMoney(price.amountMinor, config.data)
                        : null
                      return (
                        <label
                          className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-md border border-border px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                          key={`${price.billingPeriod}-${index}`}
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-medium">
                              {billingPeriodLabels[price.billingPeriod]}
                            </span>
                            <span className="mt-1 block break-all text-xs text-muted-foreground">
                              套餐标价：
                              {config.isPending
                                ? '正在读取币种…'
                                : (formatted ?? '无法安全格式化')}
                            </span>
                          </span>
                          <input
                            type="radio"
                            className="size-5 shrink-0 accent-primary"
                            name={`billing-period-${productId}`}
                            value={price.billingPeriod}
                            checked={selectedPeriod === price.billingPeriod}
                            disabled={createMutation.isPending}
                            onChange={() => {
                              setSelectedPeriod(price.billingPeriod)
                              setCreateFeedback((current) =>
                                current?.kind === 'unknown' ? current : null,
                              )
                              createMutation.reset()
                            }}
                          />
                        </label>
                      )
                    })}
                  </div>
                </fieldset>
              )}

              <div className="space-y-3">
                <label
                  className="text-sm font-semibold"
                  htmlFor="promotion-code"
                >
                  优惠码（可选）
                </label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Input
                    id="promotion-code"
                    value={promotionCode}
                    autoComplete="off"
                    aria-invalid={Boolean(promotionFieldError)}
                    aria-describedby={
                      promotionFieldError ? 'promotion-code-error' : undefined
                    }
                    onChange={(event) => {
                      const nextCode = event.target.value
                      validationVersionRef.current += 1
                      setPromotionCode(nextCode)
                      setPromotionPreview(null)
                      setPromotionError(null)
                      setPromotionFieldError(
                        nextCode.trim().length > 255
                          ? '优惠码不能超过 255 个字符。'
                          : null,
                      )
                      setCreateFeedback((current) =>
                        current?.kind === 'unknown' ? current : null,
                      )
                      promotionMutation.reset()
                      createMutation.reset()
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="sm:w-auto"
                    disabled={promotionMutation.isPending}
                    onClick={() => void validatePromotion()}
                  >
                    {promotionMutation.isPending ? (
                      <LoaderCircle
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : null}
                    {promotionMutation.isPending ? '正在验证…' : '验证优惠码'}
                  </Button>
                </div>
                {promotionFieldError ? (
                  <p
                    id="promotion-code-error"
                    className="text-sm text-destructive"
                  >
                    {promotionFieldError}
                  </p>
                ) : null}
                {promotionError ? (
                  <MutationFeedback
                    error={promotionError}
                    message={getPromotionErrorMessage(promotionError)}
                  />
                ) : promotionPreview ? (
                  <div
                    className="border-l-2 border-primary bg-primary/5 px-4 py-3"
                    role="status"
                  >
                    <p className="text-sm font-medium">
                      {promotionPreview.discount.type === 'fixed'
                        ? `优惠预览：固定金额优惠 ${
                            config.data
                              ? (formatMinorMoney(
                                  promotionPreview.discount.amountMinor,
                                  config.data,
                                ) ?? '暂无法安全格式化')
                              : '暂无法安全格式化'
                          }`
                        : `优惠预览：${promotionPreview.discount.percent}%`}
                    </p>
                  </div>
                ) : null}
                <p className="text-xs leading-5 text-muted-foreground">
                  优惠验证仅供预览；具体能否应用及最终订单金额以下单结果为准。
                </p>
              </div>

              <div className="border-l-2 border-foreground/40 bg-muted px-4 py-3">
                <p className="text-sm leading-6">
                  套餐标价不是最终应付金额。实际订单金额由服务端最终计算，可能受到优惠券、余额、VIP
                  折扣等影响。创建成功后以订单详情为准。
                </p>
              </div>

              {createFeedback?.kind === 'error' ? (
                <MutationFeedback
                  error={createFeedback.error}
                  message={getCreateOrderErrorMessage(createFeedback.error)}
                />
              ) : createFeedback?.kind === 'unknown' ? (
                <div
                  className="space-y-3 border-l-2 border-foreground/40 bg-muted px-4 py-3"
                  role="alert"
                >
                  <p className="text-sm font-semibold">
                    订单提交结果暂时无法确认。
                  </p>
                  <p className="text-sm leading-6">
                    {createFeedback.ordersRefreshed
                      ? '系统已重新读取订单列表。请先检查是否出现新订单，避免重复下单。'
                      : '系统暂时无法重新读取订单列表。请前往订单页面手动检查，避免重复下单。'}
                  </p>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/orders">查看订单</Link>
                  </Button>
                </div>
              ) : null}

              {requiresGuard ? (
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-5 shrink-0 accent-primary"
                    checked={unknownAcknowledged}
                    disabled={createMutation.isPending}
                    onChange={(event) =>
                      setUnknownAcknowledged(event.target.checked)
                    }
                  />
                  <span>我已检查订单列表，仍要重新提交</span>
                </label>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  disabled={
                    !selectedPeriod ||
                    !formattedStickerPrice ||
                    !promotionCodeValid ||
                    createMutation.isPending ||
                    (requiresGuard && !unknownAcknowledged)
                  }
                  onClick={() => void createOrder()}
                >
                  {createMutation.isPending ? (
                    <LoaderCircle
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : null}
                  {createMutation.isPending ? '正在创建订单…' : '确认创建订单'}
                </Button>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    关闭
                  </Button>
                </DialogClose>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
