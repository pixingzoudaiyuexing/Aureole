import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CreditCard, LoaderCircle } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AccountConfig } from '@/features/account/account-api'
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { useExitOnInvalidSessionError } from '@/features/auth/use-exit-on-invalid-session-error'
import { useSynchronousActionLock } from '@/features/auth/use-synchronous-action-lock'
import { formatMinorMoney } from '@/features/catalog/money-format'
import { isAmbiguousCommerceMutationError } from '@/features/orders/commerce-errors'
import type { Order, OrderStatus } from '@/features/orders/orders-api'
import {
  orderDetailOptions,
  ordersListOptions,
  ordersQueryKeys,
  orderStatusOptions,
} from '@/features/orders/orders-queries'
import { orderStatusLabels } from '@/features/orders/order-status'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api/errors'
import type { CheckoutAction, PaymentMethod } from './payment-api'
import {
  checkoutMutationOptions,
  paymentMethodsOptions,
  paymentQueryKeys,
  usePaymentMethods,
} from './payment-queries'
import { paymentNavigation } from './payment-navigation'
import {
  PAYMENT_STATUS_POLL_CAP_MS,
  PAYMENT_STATUS_POLL_INTERVAL_MS,
} from './payment-constants'

type PaymentFeedback =
  | { kind: 'finished-pending' }
  | { kind: 'status-updated'; latestStatus: Exclude<OrderStatus, 'pending'> }
  | { kind: 'unknown'; latestStatus: OrderStatus | null }
  | { kind: 'method-unavailable'; latestStatus: OrderStatus | null }
  | { kind: 'expired'; latestStatus: OrderStatus | null }
  | { kind: 'create-failed'; latestStatus: OrderStatus | null }
  | { kind: 'validation'; latestStatus: OrderStatus | null }
  | { kind: 'failed'; latestStatus: OrderStatus | null }

interface RecoverySelection {
  detail?: boolean
  list?: boolean
  methods?: boolean
  status?: boolean
}

interface RecoveryResult {
  latestStatus: OrderStatus | null
}

export function OrderPaymentControl({
  accessToken,
  accountConfig,
  configPending,
  disabled = false,
  order,
  onFlowOpenChange,
  releaseSharedAction,
  tryAcquireSharedAction,
}: {
  accessToken: string
  accountConfig: AccountConfig | null
  configPending: boolean
  disabled?: boolean
  order: Order
  onFlowOpenChange: (open: boolean) => void
  releaseSharedAction: () => void
  tryAcquireSharedAction: () => boolean
}) {
  const queryClient = useQueryClient()
  const checkoutLock = useSynchronousActionLock()
  const [flowOpen, setFlowOpen] = useState(false)
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null)
  const [action, setAction] = useState<CheckoutAction | null>(null)
  const [feedback, setFeedback] = useState<PaymentFeedback | null>(null)
  const [unknownAcknowledged, setUnknownAcknowledged] = useState(false)
  const [polling, setPolling] = useState(false)
  const [pollCapped, setPollCapped] = useState(false)
  const [manualRefreshPending, setManualRefreshPending] = useState(false)
  const [sessionError, setSessionError] = useState<unknown>(null)
  const pollStartedAtRef = useRef<number | null>(null)
  const handledStatusRef = useRef<string | null>(null)

  const methods = usePaymentMethods(accessToken, flowOpen)
  const status = useQuery({
    ...orderStatusOptions(accessToken, order.id),
    enabled: polling,
    refetchInterval: polling ? PAYMENT_STATUS_POLL_INTERVAL_MS : false,
  })
  const checkout = useMutation(checkoutMutationOptions(accessToken, order.id))

  const invalidSessionError = isInvalidSessionError(methods.error)
    ? methods.error
    : isInvalidSessionError(status.error)
      ? status.error
      : isInvalidSessionError(checkout.error)
        ? checkout.error
        : isInvalidSessionError(sessionError)
          ? sessionError
          : null
  useExitOnInvalidSessionError(invalidSessionError)

  const recover = useCallback(
    async (selection: RecoverySelection): Promise<RecoveryResult> => {
      const invalidations: Promise<void>[] = []
      if (selection.detail) {
        invalidations.push(
          queryClient.invalidateQueries({
            queryKey: ordersQueryKeys.detail(order.id),
            refetchType: 'none',
          }),
        )
      }
      if (selection.list) {
        invalidations.push(
          queryClient.invalidateQueries({
            queryKey: ordersQueryKeys.list,
            refetchType: 'none',
          }),
        )
      }
      if (selection.methods) {
        invalidations.push(
          queryClient.invalidateQueries({
            queryKey: paymentQueryKeys.methods,
            refetchType: 'none',
          }),
        )
      }
      if (selection.status) {
        invalidations.push(
          queryClient.invalidateQueries({
            queryKey: ordersQueryKeys.status(order.id),
            refetchType: 'none',
          }),
        )
      }
      await Promise.all(invalidations)

      const reads: Array<{
        kind: keyof RecoverySelection
        promise: Promise<unknown>
      }> = []
      if (selection.status) {
        reads.push({
          kind: 'status',
          promise: queryClient.fetchQuery({
            ...orderStatusOptions(accessToken, order.id),
            staleTime: 0,
          }),
        })
      }
      if (selection.detail) {
        reads.push({
          kind: 'detail',
          promise: queryClient.fetchQuery({
            ...orderDetailOptions(accessToken, order.id),
            staleTime: 0,
          }),
        })
      }
      if (selection.list) {
        reads.push({
          kind: 'list',
          promise: queryClient.fetchQuery({
            ...ordersListOptions(accessToken),
            staleTime: 0,
          }),
        })
      }
      if (selection.methods) {
        reads.push({
          kind: 'methods',
          promise: queryClient.fetchQuery({
            ...paymentMethodsOptions(accessToken),
            staleTime: 0,
          }),
        })
      }

      const results = await Promise.allSettled(
        reads.map(({ promise }) => promise),
      )
      let latestStatus: OrderStatus | null = null
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          if (isInvalidSessionError(result.reason))
            setSessionError(result.reason)
          return
        }
        if (reads[index]?.kind === 'status') {
          latestStatus = (result.value as { status: OrderStatus }).status
        }
      })
      return { latestStatus }
    },
    [accessToken, order.id, queryClient],
  )

  const refreshDetailAndList = useCallback(async () => {
    await recover({ detail: true, list: true })
  }, [recover])

  useEffect(() => {
    if (!polling) return
    const startedAt = pollStartedAtRef.current ?? Date.now()
    pollStartedAtRef.current = startedAt
    const remaining = Math.max(
      0,
      PAYMENT_STATUS_POLL_CAP_MS - (Date.now() - startedAt),
    )
    const timeout = window.setTimeout(() => {
      setPolling(false)
      setPollCapped(true)
    }, remaining)
    return () => window.clearTimeout(timeout)
  }, [polling])

  useEffect(() => {
    if (!polling || !status.data || status.data.status === 'pending') return
    const transitionKey = `${status.data.id}:${status.data.status}`
    if (handledStatusRef.current === transitionKey) return
    handledStatusRef.current = transitionKey
    setPolling(false)
    setPollCapped(false)
    setAction(null)
    setFeedback({ kind: 'status-updated', latestStatus: status.data.status })
    void refreshDetailAndList()
  }, [polling, refreshDetailAndList, status.data])

  useEffect(
    () => () => {
      onFlowOpenChange(false)
    },
    [onFlowOpenChange],
  )

  if (invalidSessionError) return null

  const startPolling = () => {
    pollStartedAtRef.current = Date.now()
    handledStatusRef.current = null
    setPollCapped(false)
    setPolling(true)
  }

  const resetTransientFlow = () => {
    setSelectedMethodId(null)
    setAction(null)
    setFeedback(null)
    setUnknownAcknowledged(false)
    setPolling(false)
    setPollCapped(false)
    setManualRefreshPending(false)
    pollStartedAtRef.current = null
    handledStatusRef.current = null
    checkout.reset()
  }

  const setOpen = (open: boolean) => {
    if (!open) resetTransientFlow()
    setFlowOpen(open)
    onFlowOpenChange(open)
  }

  const runCheckout = async () => {
    const selectedMethod = methods.data?.find(
      (method) => method.id === selectedMethodId,
    )
    if (
      !selectedMethod ||
      (feedback?.kind === 'unknown' && !unknownAcknowledged)
    ) {
      return
    }
    if (!checkoutLock.tryAcquire()) return
    if (!tryAcquireSharedAction()) {
      checkoutLock.release()
      return
    }

    setAction(null)
    setFeedback(null)
    setPolling(false)
    setPollCapped(false)
    checkout.reset()
    try {
      const nextAction = await checkout.mutateAsync(selectedMethod.id)
      setUnknownAcknowledged(false)
      if (nextAction.type === 'qrcode') {
        setAction(nextAction)
        startPolling()
      } else if (nextAction.type === 'redirect') {
        setAction(nextAction)
      } else {
        const recovery = await recover({
          status: true,
          detail: true,
          list: true,
        })
        if (
          recovery.latestStatus === 'pending' ||
          recovery.latestStatus === null
        ) {
          setFeedback({ kind: 'finished-pending' })
          startPolling()
        } else {
          setFeedback({
            kind: 'status-updated',
            latestStatus: recovery.latestStatus,
          })
        }
      }
    } catch (error) {
      setAction(null)
      if (isInvalidSessionError(error)) {
        setSessionError(error)
        return
      }
      if (isAmbiguousCommerceMutationError(error)) {
        const recovery = await recover({
          status: true,
          detail: true,
          list: true,
        })
        setUnknownAcknowledged(false)
        setFeedback({ kind: 'unknown', latestStatus: recovery.latestStatus })
      } else if (
        error instanceof ApiError &&
        error.code === 'PAYMENT_METHOD_UNAVAILABLE'
      ) {
        setSelectedMethodId(null)
        const recovery = await recover({ methods: true, status: true })
        setFeedback({
          kind: 'method-unavailable',
          latestStatus: recovery.latestStatus,
        })
      } else if (error instanceof ApiError && error.code === 'ORDER_EXPIRED') {
        const recovery = await recover({
          status: true,
          detail: true,
          list: true,
        })
        setFeedback({ kind: 'expired', latestStatus: recovery.latestStatus })
      } else if (
        error instanceof ApiError &&
        error.code === 'PAYMENT_CREATE_FAILED'
      ) {
        const recovery = await recover({ status: true, detail: true })
        setFeedback({
          kind: 'create-failed',
          latestStatus: recovery.latestStatus,
        })
      } else if (
        error instanceof ApiError &&
        error.code === 'VALIDATION_ERROR'
      ) {
        setSelectedMethodId(null)
        const recovery = await recover({ methods: true, status: true })
        setFeedback({ kind: 'validation', latestStatus: recovery.latestStatus })
      } else {
        const recovery = await recover({ status: true, detail: true })
        setFeedback({ kind: 'failed', latestStatus: recovery.latestStatus })
      }
    } finally {
      releaseSharedAction()
      checkoutLock.release()
    }
  }

  const manualRefreshStatus = async () => {
    if (manualRefreshPending) return
    setManualRefreshPending(true)
    try {
      const recovery = await recover({ status: true })
      if (recovery.latestStatus && recovery.latestStatus !== 'pending') {
        setAction(null)
        setFeedback({
          kind: 'status-updated',
          latestStatus: recovery.latestStatus,
        })
        await refreshDetailAndList()
      }
    } finally {
      setManualRefreshPending(false)
    }
  }

  if (!flowOpen) {
    return (
      <div className="border-t border-border pt-5">
        <Button type="button" disabled={disabled} onClick={() => setOpen(true)}>
          支付订单
        </Button>
      </div>
    )
  }

  const selectedMethod = methods.data?.find(
    (method) => method.id === selectedMethodId,
  )
  const latestStatus = status.data?.status ?? order.status
  const feedbackStatus =
    feedback && 'latestStatus' in feedback ? feedback.latestStatus : null
  const flowStopped =
    feedback?.kind === 'expired' ||
    (feedbackStatus !== null && feedbackStatus !== 'pending')

  return (
    <section
      className="space-y-5 border-t border-border pt-5"
      aria-labelledby="payment-flow-title"
    >
      <div>
        <h3 id="payment-flow-title" className="text-base font-semibold">
          支付订单
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          选择支付方式后，由服务端准备支付流程。
        </p>
      </div>

      {methods.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          正在读取支付方式…
        </p>
      ) : methods.isError ? (
        <div className="space-y-3" role="alert">
          <p className="text-sm">暂时无法读取支付方式。</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void methods.refetch()}
          >
            重试
          </Button>
        </div>
      ) : methods.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          当前没有可用的支付方式。
        </p>
      ) : (
        <fieldset
          className="space-y-3"
          disabled={checkout.isPending || flowStopped}
        >
          <legend className="text-sm font-semibold">选择支付方式</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {methods.data.map((method) => (
              <PaymentMethodOption
                key={method.id}
                method={method}
                checked={selectedMethodId === method.id}
                accountConfig={accountConfig}
                configPending={configPending}
                onSelect={() => {
                  setSelectedMethodId(method.id)
                  setAction(null)
                  setFeedback((current) =>
                    current?.kind === 'unknown' ? current : null,
                  )
                  checkout.reset()
                }}
              />
            ))}
          </div>
        </fieldset>
      )}

      {action?.type === 'qrcode' && selectedMethod ? (
        <div className="space-y-4 border-y border-border py-5">
          <div className="mx-auto w-fit max-w-full bg-white p-3">
            <div role="img" aria-label="支付二维码">
              <QRCodeSVG
                value={action.data}
                size={208}
                level="M"
                marginSize={1}
                aria-hidden="true"
              />
            </div>
          </div>
          <div className="space-y-1 text-center">
            <p className="break-words text-sm font-semibold">
              {selectedMethod.name}
            </p>
            <p className="break-all font-mono text-xs text-muted-foreground">
              订单编号：{order.id}
            </p>
            <p className="text-sm text-muted-foreground">
              请使用对应支付方式扫码完成支付。
            </p>
          </div>
        </div>
      ) : null}

      {action?.type === 'redirect' ? (
        <div
          className="space-y-3 border-l-2 border-primary bg-primary/5 px-4 py-3"
          role="status"
        >
          <div>
            <p className="text-sm font-semibold">支付页面已准备好</p>
            <p className="mt-1 text-sm text-muted-foreground">
              前往支付后，返回 Aureole 时请重新核对订单状态。
            </p>
          </div>
          <Button
            type="button"
            onClick={() => paymentNavigation.goTo(action.target)}
          >
            前往支付
          </Button>
        </div>
      ) : null}

      {feedback ? <PaymentFeedbackMessage feedback={feedback} /> : null}

      {feedback?.kind === 'unknown' ? (
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-5 shrink-0 accent-primary"
            checked={unknownAcknowledged}
            disabled={checkout.isPending}
            onChange={(event) => setUnknownAcknowledged(event.target.checked)}
          />
          <span>我已检查订单状态，仍要重新发起支付</span>
        </label>
      ) : null}

      {polling || pollCapped || status.isError ? (
        <div className="space-y-3 border-y border-border py-4">
          <p className="text-sm">
            订单状态：
            <span className="font-medium">
              {orderStatusLabels[latestStatus]}
            </span>
          </p>
          {polling ? (
            <p role="status" className="text-sm text-muted-foreground">
              正在确认订单状态…
            </p>
          ) : null}
          {status.isError && !isInvalidSessionError(status.error) ? (
            <p role="alert" className="text-sm text-muted-foreground">
              暂时无法读取最新订单状态。
            </p>
          ) : null}
          {pollCapped ? (
            <p role="alert" className="text-sm text-muted-foreground">
              暂未确认支付状态，请稍后手动刷新订单状态。
            </p>
          ) : null}
          {!polling ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={manualRefreshPending}
              onClick={() => void manualRefreshStatus()}
            >
              {manualRefreshPending ? (
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              {manualRefreshPending ? '正在刷新…' : '刷新状态'}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {methods.isSuccess &&
        methods.data.length > 0 &&
        !action &&
        !flowStopped ? (
          <Button
            type="button"
            disabled={
              disabled ||
              !selectedMethod ||
              checkout.isPending ||
              (feedback?.kind === 'unknown' && !unknownAcknowledged)
            }
            onClick={() => void runCheckout()}
          >
            {checkout.isPending ? (
              <LoaderCircle
                className="size-4 animate-spin"
                aria-hidden="true"
              />
            ) : null}
            {checkout.isPending ? '正在提交…' : '确认支付'}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          disabled={checkout.isPending}
          onClick={() => setOpen(false)}
        >
          关闭支付
        </Button>
      </div>
    </section>
  )
}

function PaymentMethodOption({
  accountConfig,
  checked,
  configPending,
  method,
  onSelect,
}: {
  accountConfig: AccountConfig | null
  checked: boolean
  configPending: boolean
  method: PaymentMethod
  onSelect: () => void
}) {
  const [iconFailed, setIconFailed] = useState(false)
  const fixedFee = accountConfig
    ? formatMinorMoney(method.fee.fixedMinor, accountConfig)
    : null
  const feeParts = [
    configPending
      ? '固定手续费正在读取币种…'
      : (fixedFee ?? '固定手续费暂无法安全格式化'),
    `${method.fee.percent}%`,
  ]

  return (
    <label className="flex min-h-20 cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-background">
        {method.icon && !iconFailed ? (
          <img
            src={method.icon}
            alt=""
            className="size-8 object-contain"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setIconFailed(true)}
          />
        ) : (
          <CreditCard
            className="size-5 text-muted-foreground"
            aria-hidden="true"
          />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm font-medium">
          {method.name}
        </span>
        <span className="mt-1 block break-words text-xs leading-5 text-muted-foreground">
          手续费：{feeParts.join(' + ')}
        </span>
      </span>
      <input
        type="radio"
        className="size-5 shrink-0 accent-primary"
        name="payment-method"
        value={method.id}
        checked={checked}
        onChange={onSelect}
      />
    </label>
  )
}

function PaymentFeedbackMessage({ feedback }: { feedback: PaymentFeedback }) {
  if (feedback.kind === 'finished-pending') {
    return (
      <div
        className="border-l-2 border-primary bg-primary/5 px-4 py-3"
        role="status"
      >
        <p className="text-sm">支付流程已提交，正在确认订单状态。</p>
      </div>
    )
  }
  const latest = feedback.latestStatus
    ? ` 当前订单状态：${orderStatusLabels[feedback.latestStatus]}。`
    : ''
  if (feedback.kind === 'status-updated') {
    return (
      <div
        className="border-l-2 border-primary bg-primary/5 px-4 py-3"
        role="status"
      >
        <p className="text-sm">
          订单状态已更新：{orderStatusLabels[feedback.latestStatus]}。
        </p>
      </div>
    )
  }
  if (feedback.kind === 'unknown') {
    return (
      <div
        className="border-l-2 border-foreground/40 bg-muted px-4 py-3"
        role="alert"
      >
        <p className="text-sm font-semibold">支付请求结果暂时无法确认。</p>
        <p className="mt-1 text-sm text-muted-foreground">
          请先核对订单状态，避免重复发起支付。{latest}
        </p>
      </div>
    )
  }
  if (feedback.kind === 'method-unavailable') {
    return (
      <div
        className="border-l-2 border-foreground/40 bg-muted px-4 py-3"
        role="alert"
      >
        <p className="text-sm">当前支付方式已不可用，请重新选择。{latest}</p>
      </div>
    )
  }
  if (feedback.kind === 'expired') {
    return (
      <div
        className="border-l-2 border-foreground/40 bg-muted px-4 py-3"
        role="alert"
      >
        <p className="text-sm">订单已过期，支付流程已停止。{latest}</p>
      </div>
    )
  }
  if (feedback.kind === 'create-failed') {
    return (
      <div
        className="border-l-2 border-foreground/40 bg-muted px-4 py-3"
        role="alert"
      >
        <p className="text-sm">
          支付流程未能创建。已重新读取订单状态，请核对后再决定是否重试。{latest}
        </p>
      </div>
    )
  }
  if (feedback.kind === 'validation') {
    return (
      <div
        className="border-l-2 border-foreground/40 bg-muted px-4 py-3"
        role="alert"
      >
        <p className="text-sm">支付信息已失效，请重新选择支付方式。{latest}</p>
      </div>
    )
  }
  return (
    <div
      className="border-l-2 border-foreground/40 bg-muted px-4 py-3"
      role="alert"
    >
      <p className="text-sm">
        暂时无法继续支付。已重新读取订单状态，请核对后再试。{latest}
      </p>
    </div>
  )
}
