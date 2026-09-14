import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, Plus, RefreshCw } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { MutationFeedback } from '@/features/auth/form-feedback'
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { useExitOnInvalidSessionError } from '@/features/auth/use-exit-on-invalid-session-error'
import { useSynchronousActionLock } from '@/features/auth/use-synchronous-action-lock'
import { ApiError } from '@/lib/api/errors'
import {
  getReferralCodeCreateErrorMessage,
  isAmbiguousReferralCodeCreateError,
} from './referral-create-errors'
import {
  referralCodeCreateMutationOptions,
  referralOverviewOptions,
  referralsQueryKeys,
} from './referrals-queries'

type CreateFeedback =
  | { kind: 'success'; reconciled: boolean | null }
  | { kind: 'limit'; reconciled: boolean | null }
  | { kind: 'unknown'; reconciled: boolean | null }

export function ReferralCreateControl({
  accessToken,
  overviewAuthorityReady,
}: {
  accessToken: string
  overviewAuthorityReady: boolean
}) {
  const queryClient = useQueryClient()
  const createLock = useSynchronousActionLock()
  const sessionInvalidatedRef = useRef(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [actionPending, setActionPending] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [feedback, setFeedback] = useState<CreateFeedback | null>(null)
  const [dialogError, setDialogError] = useState<{
    error: unknown
    message: string
  } | null>(null)
  const [unknownAcknowledged, setUnknownAcknowledged] = useState(false)
  const [sessionError, setSessionError] = useState<unknown>(null)
  const mutation = useMutation(referralCodeCreateMutationOptions(accessToken))

  const invalidSessionError = isInvalidSessionError(mutation.error)
    ? mutation.error
    : isInvalidSessionError(sessionError)
      ? sessionError
      : null
  useExitOnInvalidSessionError(invalidSessionError)

  if (invalidSessionError) return null

  const recoveryFailed = feedback?.reconciled === false
  const unknownGuardActive =
    feedback?.kind === 'unknown' && feedback.reconciled === true
  const createDisabled =
    !overviewAuthorityReady ||
    actionPending ||
    mutation.isPending ||
    recovering ||
    recoveryFailed ||
    (unknownGuardActive && !unknownAcknowledged)

  const refreshOverview = async () => {
    await queryClient.invalidateQueries({
      queryKey: referralsQueryKeys.overview,
      exact: true,
      refetchType: 'none',
    })
    try {
      await queryClient.fetchQuery({
        ...referralOverviewOptions(accessToken),
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

  const createCode = async () => {
    if (
      !overviewAuthorityReady ||
      recoveryFailed ||
      (unknownGuardActive && !unknownAcknowledged)
    ) {
      return
    }
    if (!createLock.tryAcquire()) return

    sessionInvalidatedRef.current = false
    setActionPending(true)
    setDialogError(null)
    mutation.reset()
    try {
      await mutation.mutateAsync()
      setUnknownAcknowledged(false)
      setDialogOpen(false)
      setFeedback({ kind: 'success', reconciled: null })
      const reconciled = await refreshOverview()
      if (!sessionInvalidatedRef.current) {
        setFeedback({ kind: 'success', reconciled })
      }
    } catch (error) {
      if (isInvalidSessionError(error)) {
        sessionInvalidatedRef.current = true
        setSessionError(error)
        return
      }

      if (
        error instanceof ApiError &&
        error.code === 'REFERRAL_CODE_LIMIT_REACHED'
      ) {
        setUnknownAcknowledged(false)
        setDialogOpen(false)
        setFeedback({ kind: 'limit', reconciled: null })
        const reconciled = await refreshOverview()
        if (!sessionInvalidatedRef.current) {
          setFeedback({ kind: 'limit', reconciled })
        }
      } else if (isAmbiguousReferralCodeCreateError(error)) {
        setUnknownAcknowledged(false)
        setDialogOpen(false)
        setFeedback({ kind: 'unknown', reconciled: null })
        const reconciled = await refreshOverview()
        if (!sessionInvalidatedRef.current) {
          setFeedback({ kind: 'unknown', reconciled })
        }
      } else {
        setDialogError({
          error,
          message: getReferralCodeCreateErrorMessage(error),
        })
      }
    } finally {
      setActionPending(false)
      createLock.release()
    }
  }

  const manualRecovery = async () => {
    if (!feedback || feedback.reconciled !== false || recovering) return
    sessionInvalidatedRef.current = false
    setRecovering(true)
    const reconciled = await refreshOverview()
    if (sessionInvalidatedRef.current) return
    setRecovering(false)
    if (reconciled) setFeedback({ ...feedback, reconciled: true })
  }

  return (
    <div className="mt-5 space-y-4">
      <Button
        id="referral-create-trigger"
        type="button"
        disabled={createDisabled}
        onClick={() => {
          if (createDisabled) return
          if (feedback?.kind !== 'unknown') setFeedback(null)
          setDialogError(null)
          setDialogOpen(true)
        }}
      >
        <Plus className="size-4" aria-hidden="true" />
        创建邀请码
      </Button>

      {!overviewAuthorityReady ? (
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          成功读取当前邀请码列表后才能创建，以避免重复操作。
        </p>
      ) : null}

      {feedback ? <CreateFeedbackMessage feedback={feedback} /> : null}

      {recoveryFailed ? (
        <Button
          type="button"
          variant="outline"
          disabled={recovering}
          onClick={() => void manualRecovery()}
        >
          {recovering ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="size-4" aria-hidden="true" />
          )}
          {recovering ? '正在重新读取…' : '重新读取邀请码列表'}
        </Button>
      ) : null}

      {unknownGuardActive ? (
        <label className="flex max-w-2xl items-start gap-3 text-sm leading-6">
          <input
            type="checkbox"
            className="mt-1 size-4 shrink-0 accent-primary"
            checked={unknownAcknowledged}
            disabled={actionPending || recovering}
            onChange={(event) => setUnknownAcknowledged(event.target.checked)}
          />
          <span>我已检查当前邀请码列表，仍需再次创建一个邀请码。</span>
        </label>
      ) : null}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (open) setDialogOpen(true)
          else if (!actionPending) setDialogOpen(false)
        }}
      >
        <DialogContent
          className="max-w-lg"
          closeLabel="关闭创建邀请码确认"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            document.getElementById('referral-create-trigger')?.focus()
          }}
          onEscapeKeyDown={(event) => {
            if (actionPending) event.preventDefault()
          }}
          onInteractOutside={(event) => {
            if (actionPending) event.preventDefault()
          }}
        >
          <div className="overflow-y-auto px-5 pb-5 pt-6 sm:px-6 sm:pb-6">
            <DialogTitle className="pr-12 text-lg font-semibold">
              创建邀请码
            </DialogTitle>
            <DialogDescription className="mt-3 text-sm leading-6 text-muted-foreground">
              将创建一个新的邀请码。Aureole 当前版本不提供邀请码删除操作。
            </DialogDescription>

            {dialogError ? (
              <div className="mt-5">
                <MutationFeedback
                  error={dialogError.error}
                  message={dialogError.message}
                />
              </div>
            ) : null}

            {!overviewAuthorityReady ? (
              <p
                className="mt-5 text-sm leading-6 text-muted-foreground"
                role="status"
              >
                当前邀请码列表正在重新读取，成功后才能创建。
              </p>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={actionPending}
                onClick={() => setDialogOpen(false)}
              >
                取消
              </Button>
              <Button
                type="button"
                disabled={!overviewAuthorityReady || actionPending}
                onClick={() => void createCode()}
              >
                {actionPending ? (
                  <LoaderCircle
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                {actionPending ? '正在创建…' : '确认创建'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CreateFeedbackMessage({ feedback }: { feedback: CreateFeedback }) {
  if (feedback.kind === 'success') {
    return (
      <div
        className="max-w-2xl border-l-2 border-primary bg-primary/5 px-4 py-3"
        role="status"
      >
        <p className="text-sm font-semibold">邀请码已创建。</p>
        {feedback.reconciled === false ? (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            邀请码已创建，但暂时无法读取最新邀请码列表。
          </p>
        ) : feedback.reconciled === null ? (
          <p className="mt-2 text-sm text-muted-foreground">
            正在重新读取邀请码列表…
          </p>
        ) : null}
      </div>
    )
  }

  if (feedback.kind === 'limit') {
    return (
      <div
        className="max-w-2xl border-l-2 border-foreground/40 bg-muted px-4 py-3"
        role="alert"
      >
        <p className="text-sm font-semibold">邀请码数量已达到当前上限。</p>
        {feedback.reconciled === false ? (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            当前邀请码列表暂时无法重新读取。请先恢复列表，再尝试创建。
          </p>
        ) : feedback.reconciled === null ? (
          <p className="mt-2 text-sm text-muted-foreground">
            正在重新读取邀请码列表…
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div
      className="max-w-2xl border-l-2 border-foreground/40 bg-muted px-4 py-3"
      role="alert"
    >
      <p className="text-sm font-semibold">邀请码创建结果暂时无法确认。</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {feedback.reconciled === true
          ? '已重新读取当前邀请码列表。请先核对列表，避免重复创建。'
          : feedback.reconciled === false
            ? '当前邀请码列表暂时无法重新读取。请先恢复列表，暂时不要再次创建。'
            : '正在重新读取邀请码列表…'}
      </p>
    </div>
  )
}
