import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { useExitOnInvalidSessionError } from '@/features/auth/use-exit-on-invalid-session-error'
import { useSynchronousActionLock } from '@/features/auth/use-synchronous-action-lock'
import { ApiError } from '@/lib/api/errors'
import { isAmbiguousCommerceMutationError } from './commerce-errors'
import { ordersApi, type Order, type OrderStatus } from './orders-api'
import {
  orderDetailOptions,
  ordersListOptions,
  ordersQueryKeys,
} from './orders-queries'
import { orderStatusLabels } from './order-status'

type CancelFeedback =
  | {
      kind: 'success'
      latestStatus: OrderStatus | null
      detailRefreshed: boolean
      listRefreshed: boolean
    }
  | {
      kind: 'not-cancellable'
      latestStatus: OrderStatus | null
      detailRefreshed: boolean
      listRefreshed: boolean
    }
  | { kind: 'not-found'; listRefreshed: boolean }
  | { kind: 'failed'; error: unknown; detailRefreshed: boolean }
  | {
      kind: 'unknown'
      error: unknown
      latestStatus: OrderStatus | null
      detailRefreshed: boolean
      listRefreshed: boolean
    }

export function OrderCancelControl({
  accessToken,
  disabled = false,
  onConfirmingChange,
  order,
  releaseSharedAction,
  tryAcquireSharedAction,
}: {
  accessToken: string
  disabled?: boolean
  onConfirmingChange: (confirming: boolean) => void
  order: Order
  releaseSharedAction: () => void
  tryAcquireSharedAction: () => boolean
}) {
  const queryClient = useQueryClient()
  const actionLock = useSynchronousActionLock()
  const [confirming, setConfirming] = useState(false)
  const [feedback, setFeedback] = useState<CancelFeedback | null>(null)
  const [sessionError, setSessionError] = useState<unknown>(null)
  const mutation = useMutation({
    mutationFn: () => ordersApi.cancel(accessToken, order.id),
    retry: false,
  })

  const invalidSessionError = isInvalidSessionError(mutation.error)
    ? mutation.error
    : isInvalidSessionError(sessionError)
      ? sessionError
      : null
  useExitOnInvalidSessionError(invalidSessionError)

  if (invalidSessionError) return null

  const refreshList = async () => {
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

  const refreshDetail = async () => {
    await queryClient.invalidateQueries({
      queryKey: ordersQueryKeys.detail(order.id),
      refetchType: 'none',
    })
    try {
      const latest = await queryClient.fetchQuery({
        ...orderDetailOptions(accessToken, order.id),
        staleTime: 0,
      })
      return { refreshed: true, latestStatus: latest.status }
    } catch (error) {
      if (isInvalidSessionError(error)) setSessionError(error)
      return { refreshed: false, latestStatus: null }
    }
  }

  const refreshDetailAndList = async () => {
    const [detail, listRefreshed] = await Promise.all([
      refreshDetail(),
      refreshList(),
    ])
    return {
      latestStatus: detail.latestStatus,
      detailRefreshed: detail.refreshed,
      listRefreshed,
    }
  }

  const cancel = async () => {
    if (!actionLock.tryAcquire()) return
    if (!tryAcquireSharedAction()) {
      actionLock.release()
      return
    }
    mutation.reset()
    setFeedback(null)
    try {
      await mutation.mutateAsync()
      const recovery = await refreshDetailAndList()
      setFeedback({ kind: 'success', ...recovery })
    } catch (error) {
      if (isInvalidSessionError(error)) {
        setSessionError(error)
        return
      }
      if (error instanceof ApiError && error.code === 'ORDER_NOT_CANCELLABLE') {
        const recovery = await refreshDetailAndList()
        setFeedback({ kind: 'not-cancellable', ...recovery })
      } else if (
        error instanceof ApiError &&
        error.code === 'ORDER_NOT_FOUND'
      ) {
        setFeedback({ kind: 'not-found', listRefreshed: await refreshList() })
      } else if (
        error instanceof ApiError &&
        error.code === 'ORDER_CANCEL_FAILED'
      ) {
        const detail = await refreshDetail()
        setFeedback({
          kind: 'failed',
          error,
          detailRefreshed: detail.refreshed,
        })
      } else if (isAmbiguousCommerceMutationError(error)) {
        const recovery = await refreshDetailAndList()
        setFeedback({ kind: 'unknown', error, ...recovery })
      } else {
        const detail = await refreshDetail()
        setFeedback({
          kind: 'failed',
          error,
          detailRefreshed: detail.refreshed,
        })
      }
    } finally {
      setConfirming(false)
      onConfirmingChange(false)
      releaseSharedAction()
      actionLock.release()
    }
  }

  const suppressNewCancel =
    feedback?.kind === 'success' ||
    feedback?.kind === 'not-cancellable' ||
    feedback?.kind === 'not-found' ||
    feedback?.kind === 'unknown' ||
    (feedback?.kind === 'failed' && !feedback.detailRefreshed)
  const showCancel = order.status === 'pending' && !suppressNewCancel

  return (
    <div className="space-y-4 border-t border-border pt-5">
      {feedback ? <CancelFeedbackMessage feedback={feedback} /> : null}

      {showCancel && !confirming ? (
        <Button
          type="button"
          variant="outline"
          disabled={disabled || mutation.isPending}
          onClick={() => {
            setConfirming(true)
            onConfirmingChange(true)
          }}
        >
          取消订单
        </Button>
      ) : null}

      {showCancel && confirming ? (
        <div className="space-y-4 border-l-2 border-destructive bg-destructive/5 px-4 py-3">
          <div>
            <p className="text-sm font-semibold">确认取消此订单？</p>
            <p className="mt-1 text-sm text-muted-foreground">
              订单是否仍可取消由服务端最终判断。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              disabled={disabled || mutation.isPending}
              onClick={() => void cancel()}
            >
              {mutation.isPending ? (
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              {mutation.isPending ? '正在取消…' : '确认取消'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={disabled || mutation.isPending}
              onClick={() => {
                setConfirming(false)
                onConfirmingChange(false)
              }}
            >
              返回
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function CancelFeedbackMessage({ feedback }: { feedback: CancelFeedback }) {
  if (feedback.kind === 'not-found') {
    return (
      <div
        className="border-l-2 border-destructive bg-destructive/5 px-4 py-3"
        role="alert"
      >
        <p className="text-sm">该订单不存在或已不可用。</p>
        {!feedback.listRefreshed ? (
          <p className="mt-1 text-sm text-muted-foreground">
            订单列表暂时无法重新读取，请稍后刷新页面。
          </p>
        ) : null}
      </div>
    )
  }

  if (feedback.kind === 'failed') {
    return (
      <div
        className="border-l-2 border-destructive bg-destructive/5 px-4 py-3"
        role="alert"
      >
        <p className="text-sm">取消操作未完成。</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {feedback.detailRefreshed
            ? '已刷新订单详情，请核对最新状态后再决定是否重试。'
            : '订单详情暂时无法刷新，请关闭后稍后重新查看。'}
        </p>
      </div>
    )
  }

  const latestStatus = feedback.latestStatus
    ? orderStatusLabels[feedback.latestStatus]
    : null

  if (feedback.kind === 'success') {
    return (
      <div
        className="border-l-2 border-primary bg-primary/5 px-4 py-3"
        role="status"
      >
        <p className="text-sm font-semibold">订单取消请求已完成。</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {latestStatus
            ? `最新订单状态为：${latestStatus}`
            : '最新订单状态暂时无法读取，请稍后重新查看。'}
        </p>
      </div>
    )
  }

  if (feedback.kind === 'not-cancellable') {
    return (
      <div
        className="border-l-2 border-foreground/40 bg-muted px-4 py-3"
        role="alert"
      >
        <p className="text-sm">该订单当前已不能取消。</p>
        {latestStatus ? (
          <p className="mt-1 text-sm text-muted-foreground">
            最新订单状态为：{latestStatus}
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            最新订单状态暂时无法读取，请稍后重新查看。
          </p>
        )}
      </div>
    )
  }

  return (
    <div
      className="border-l-2 border-foreground/40 bg-muted px-4 py-3"
      role="alert"
    >
      <p className="text-sm font-semibold">取消请求结果无法直接确认。</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {latestStatus
          ? `以下为当前服务端最新订单状态：${latestStatus}`
          : '订单详情暂时无法重新读取，请稍后重新查看，暂时不要重复取消。'}
      </p>
      {!feedback.listRefreshed ? (
        <p className="mt-1 text-sm text-muted-foreground">
          订单列表也暂时无法重新读取。
        </p>
      ) : null}
    </div>
  )
}
