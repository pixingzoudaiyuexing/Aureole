import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, LoaderCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { useExitOnInvalidSessionError } from '@/features/auth/use-exit-on-invalid-session-error'
import { ApiError } from '@/lib/api/errors'
import type { SubscriptionOverview } from './subscription-api'
import { isAmbiguousSubscriptionAdvanceError } from './subscription-errors'
import type { SubscriptionMutationCoordinator } from './subscription-mutation-coordinator'
import {
  advanceSubscriptionPeriodMutationOptions,
  subscriptionOverviewQueryOptions,
  subscriptionQueryKeys,
} from './subscription-queries'

type AdvanceFeedbackKind =
  | 'success'
  | 'disabled'
  | 'traffic-not-exhausted'
  | 'unavailable'
  | 'failed'
  | 'unknown'

interface AdvanceFeedback {
  kind: AdvanceFeedbackKind
  reconciled: boolean | null
}

export function SubscriptionPeriodAdvancePanel({
  accessToken,
  overview,
  mutationCoordinator,
}: {
  accessToken: string
  overview: SubscriptionOverview
  mutationCoordinator: SubscriptionMutationCoordinator
}) {
  const queryClient = useQueryClient()
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [requiresResubmitAcknowledgement, setRequiresResubmitAcknowledgement] =
    useState(false)
  const [feedback, setFeedback] = useState<AdvanceFeedback | null>(null)
  const [sessionError, setSessionError] = useState<unknown>(null)
  const [recovering, setRecovering] = useState(false)
  const sessionInvalidatedRef = useRef(false)
  const mutation = useMutation(
    advanceSubscriptionPeriodMutationOptions(accessToken),
  )

  const invalidSessionError = isInvalidSessionError(mutation.error)
    ? mutation.error
    : isInvalidSessionError(sessionError)
      ? sessionError
      : null
  useExitOnInvalidSessionError(invalidSessionError)

  if (invalidSessionError) return null

  const closeConfirmation = () => {
    if (mutation.isPending) return
    setConfirmationOpen(false)
    setAcknowledged(false)
  }

  const refreshOverview = async () => {
    await queryClient.invalidateQueries({
      queryKey: subscriptionQueryKeys.overview,
      refetchType: 'none',
    })
    try {
      await queryClient.fetchQuery({
        ...subscriptionOverviewQueryOptions(accessToken),
        retry: false,
        staleTime: 0,
      })
      return true
    } catch (error) {
      if (isInvalidSessionError(error)) {
        sessionInvalidatedRef.current = true
        setSessionError(error)
      }
      return false
    }
  }

  const recoverOverview = async () => {
    const feedbackKind = feedback?.kind
    if (!feedbackKind) return
    setRecovering(true)
    const reconciled = await refreshOverview()
    setRecovering(false)
    if (!reconciled) return
    mutationCoordinator.setRecoveryBlocked(false)
    setRequiresResubmitAcknowledgement(feedbackKind === 'unknown')
    setFeedback({ kind: feedbackKind, reconciled: true })
  }

  const setRecoveredFeedback = (
    kind: Exclude<AdvanceFeedbackKind, 'success'>,
    reconciled: boolean,
  ) => {
    if (!reconciled) mutationCoordinator.setRecoveryBlocked(true)
    setRequiresResubmitAcknowledgement(kind === 'unknown' && reconciled)
    setFeedback({ kind, reconciled })
  }

  const advance = async () => {
    if (!acknowledged || !mutationCoordinator.tryAcquire('advance-period'))
      return
    sessionInvalidatedRef.current = false
    mutation.reset()
    setFeedback(null)
    try {
      await mutation.mutateAsync()
      setConfirmationOpen(false)
      setAcknowledged(false)
      setFeedback({ kind: 'success', reconciled: null })
      const reconciled = await refreshOverview()
      if (!reconciled) mutationCoordinator.setRecoveryBlocked(true)
      setRequiresResubmitAcknowledgement(false)
      setFeedback({ kind: 'success', reconciled })
    } catch (error) {
      if (isInvalidSessionError(error)) {
        sessionInvalidatedRef.current = true
        setSessionError(error)
        return
      }

      const reconciled = await refreshOverview()
      if (error instanceof ApiError) {
        if (error.code === 'SUBSCRIPTION_PERIOD_ADVANCE_DISABLED') {
          setRecoveredFeedback('disabled', reconciled)
        } else if (error.code === 'SUBSCRIPTION_TRAFFIC_NOT_EXHAUSTED') {
          setRecoveredFeedback('traffic-not-exhausted', reconciled)
        } else if (error.code === 'SUBSCRIPTION_PERIOD_ADVANCE_UNAVAILABLE') {
          setRecoveredFeedback('unavailable', reconciled)
        } else if (error.code === 'SUBSCRIPTION_PERIOD_ADVANCE_FAILED') {
          setRecoveredFeedback('failed', reconciled)
        } else if (isAmbiguousSubscriptionAdvanceError(error)) {
          setRecoveredFeedback('unknown', reconciled)
        } else {
          setRecoveredFeedback('failed', reconciled)
        }
      } else {
        setRecoveredFeedback('unknown', reconciled)
      }
    } finally {
      setConfirmationOpen(false)
      setAcknowledged(false)
      if (sessionInvalidatedRef.current) {
        mutationCoordinator.releaseAfterSessionInvalidation()
      } else {
        mutationCoordinator.release()
      }
    }
  }

  const recoveryFailed = feedback?.reconciled === false
  const actionBusy = mutationCoordinator.activeAction !== null
  const canStartAdvance =
    overview.renewalAllowed &&
    !recoveryFailed &&
    !mutationCoordinator.recoveryBlocked

  return (
    <div className="space-y-4 border-t border-border pt-5">
      <div>
        <p className="text-sm font-semibold">提前进入下一周期</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          此操作不是延长订阅。进入下一周期后，本周期流量使用记录会按服务端规则重置，到期时间也可能提前。
        </p>
      </div>

      {!overview.renewalAllowed && feedback?.kind !== 'disabled' ? (
        <p className="text-sm text-muted-foreground">
          当前未开启提前进入下一周期。
        </p>
      ) : null}

      {feedback ? <AdvanceFeedbackMessage feedback={feedback} /> : null}

      {recoveryFailed ? (
        <Button
          type="button"
          variant="outline"
          disabled={recovering}
          onClick={() => void recoverOverview()}
        >
          {recovering ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {recovering ? '正在重新读取…' : '重新读取订阅状态'}
        </Button>
      ) : null}

      <Dialog
        open={confirmationOpen}
        onOpenChange={(open) => {
          if (open) setConfirmationOpen(true)
          else closeConfirmation()
        }}
      >
        {canStartAdvance ? (
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              disabled={actionBusy}
              onClick={() => setAcknowledged(false)}
            >
              <CalendarClock className="size-4" aria-hidden="true" />
              {requiresResubmitAcknowledgement
                ? '再次进入下一周期'
                : '提前进入下一周期'}
            </Button>
          </DialogTrigger>
        ) : null}
        <DialogContent
          className="max-w-lg"
          closeLabel="关闭周期确认"
          onEscapeKeyDown={(event) => {
            if (mutation.isPending) event.preventDefault()
          }}
          onInteractOutside={(event) => {
            if (mutation.isPending) event.preventDefault()
          }}
        >
          <div className="overflow-y-auto px-5 pb-5 pt-6 sm:px-6 sm:pb-6">
            <DialogTitle className="pr-12 text-lg font-semibold">
              确认进入下一周期
            </DialogTitle>
            <DialogDescription className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
              <span className="block font-medium text-foreground">
                此操作不是延长订阅。
              </span>
              <span className="block">
                执行后，本周期流量使用量会按服务端规则重置，到期时间可能提前。
              </span>
            </DialogDescription>

            <label className="mt-5 flex cursor-pointer items-start gap-3 border-l-2 border-destructive bg-destructive/5 px-4 py-3 text-sm leading-6">
              <input
                type="checkbox"
                className="mt-1 size-4 shrink-0 accent-[var(--destructive)]"
                checked={acknowledged}
                disabled={mutation.isPending}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              <span>
                {requiresResubmitAcknowledgement
                  ? '我已核对当前订阅状态，仍要再次进入下一周期'
                  : '我已理解此操作可能重置当前周期流量并使到期时间提前'}
              </span>
            </label>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={mutation.isPending}
                onClick={closeConfirmation}
              >
                返回
              </Button>
              <Button
                type="button"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={!acknowledged || mutation.isPending}
                onClick={() => void advance()}
              >
                {mutation.isPending ? (
                  <LoaderCircle
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                {mutation.isPending ? '正在进入…' : '确认进入下一周期'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AdvanceFeedbackMessage({ feedback }: { feedback: AdvanceFeedback }) {
  if (feedback.kind === 'success') {
    return (
      <div
        className="border-l-2 border-primary bg-primary/5 px-4 py-3"
        role="status"
      >
        <p className="text-sm font-semibold">
          {feedback.reconciled === null
            ? '已进入下一周期，正在重新读取最新订阅状态。'
            : feedback.reconciled
              ? '已进入下一周期，已重新读取最新订阅状态。'
              : '操作已提交成功，但暂时无法读取最新订阅状态。请先重新读取订阅状态。'}
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
        <p className="text-sm font-semibold">操作结果暂时无法确认。</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {feedback.reconciled
            ? '已重新读取当前订阅状态。请先核对当前状态，避免重复操作。'
            : '当前订阅状态也暂时无法重新读取。请先重新读取订阅状态，避免重复操作。'}
        </p>
      </div>
    )
  }

  const messages: Record<
    Exclude<AdvanceFeedbackKind, 'success' | 'unknown'>,
    string
  > = {
    disabled: '当前未开启提前进入下一周期。',
    'traffic-not-exhausted': '当前周期仍有可用流量，暂时不能提前进入下一周期。',
    unavailable: '当前订阅状态暂时不能提前进入下一周期。',
    failed: '提前进入下一周期未完成。',
  }

  return (
    <div
      className={
        feedback.kind === 'failed'
          ? 'border-l-2 border-destructive bg-destructive/5 px-4 py-3'
          : 'border-l-2 border-foreground/40 bg-muted px-4 py-3'
      }
      role="alert"
    >
      <p className="text-sm">{messages[feedback.kind]}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {feedback.reconciled
          ? '已重新读取当前订阅状态。'
          : '当前订阅状态暂时无法重新读取，请先恢复读取后再尝试。'}
      </p>
    </div>
  )
}
