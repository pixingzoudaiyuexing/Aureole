import { useMutation } from '@tanstack/react-query'
import { LoaderCircle, RotateCcw } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ReadError } from '@/components/shared/read-error'
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
import { SubscriptionCredential } from './subscription-access'
import { isAmbiguousSubscriptionRotationError } from './subscription-errors'
import type { SubscriptionMutationCoordinator } from './subscription-mutation-coordinator'
import { rotateSubscriptionAccessMutationOptions } from './subscription-queries'

type RotationFeedback =
  | { kind: 'success'; reconciled: boolean }
  | { kind: 'unavailable'; reconciled: boolean }
  | { kind: 'failed'; reconciled: boolean }
  | { kind: 'unknown'; reconciled: boolean }

export function SubscriptionAccessPanel({
  accessUrl,
  accessPending,
  accessUnavailable,
  accessError,
  accessToken,
  mutationCoordinator,
  refreshAccess,
}: {
  accessUrl: string | null
  accessPending: boolean
  accessUnavailable: boolean
  accessError: unknown
  accessToken: string
  mutationCoordinator: SubscriptionMutationCoordinator
  refreshAccess: () => Promise<void>
}) {
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [requiresResubmitAcknowledgement, setRequiresResubmitAcknowledgement] =
    useState(false)
  const [feedback, setFeedback] = useState<RotationFeedback | null>(null)
  const [sessionError, setSessionError] = useState<unknown>(null)
  const [recovering, setRecovering] = useState(false)
  const sessionInvalidatedRef = useRef(false)
  const mutation = useMutation(
    rotateSubscriptionAccessMutationOptions(accessToken),
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

  const reconcileSelectedAccess = async () => {
    try {
      await refreshAccess()
      return true
    } catch (error) {
      if (isInvalidSessionError(error)) {
        sessionInvalidatedRef.current = true
        setSessionError(error)
      }
      return false
    }
  }

  const recoverCurrentAccess = async () => {
    const feedbackKind = feedback?.kind
    if (!feedbackKind) return
    setRecovering(true)
    const reconciled = await reconcileSelectedAccess()
    setRecovering(false)
    if (!reconciled) return
    mutationCoordinator.setRecoveryBlocked(false)
    setRequiresResubmitAcknowledgement(feedbackKind === 'unknown')
    setFeedback({ kind: feedbackKind, reconciled: true })
  }

  const rotate = async () => {
    if (!acknowledged || !mutationCoordinator.tryAcquire('rotate-access'))
      return
    sessionInvalidatedRef.current = false
    mutation.reset()
    setFeedback(null)
    try {
      await mutation.mutateAsync()
      const reconciled = await reconcileSelectedAccess()
      if (!reconciled && !sessionInvalidatedRef.current) {
        mutationCoordinator.setRecoveryBlocked(true)
      }
      setRequiresResubmitAcknowledgement(false)
      setFeedback({ kind: 'success', reconciled })
    } catch (error) {
      if (isInvalidSessionError(error)) {
        sessionInvalidatedRef.current = true
        setSessionError(error)
        return
      }

      const reconciled = await reconcileSelectedAccess()
      if (!reconciled && !sessionInvalidatedRef.current) {
        mutationCoordinator.setRecoveryBlocked(true)
      }
      if (
        error instanceof ApiError &&
        error.code === 'SUBSCRIPTION_ACCESS_UNAVAILABLE'
      ) {
        setRequiresResubmitAcknowledgement(false)
        setFeedback({ kind: 'unavailable', reconciled })
      } else if (
        error instanceof ApiError &&
        error.code === 'SUBSCRIPTION_ROTATION_FAILED'
      ) {
        setRequiresResubmitAcknowledgement(false)
        setFeedback({ kind: 'failed', reconciled })
      } else if (isAmbiguousSubscriptionRotationError(error)) {
        setRequiresResubmitAcknowledgement(reconciled)
        setFeedback({ kind: 'unknown', reconciled })
      } else {
        setRequiresResubmitAcknowledgement(false)
        setFeedback({ kind: 'failed', reconciled })
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

  const recoveryFailed = feedback !== null && !feedback.reconciled
  const canStartRotation = accessUrl !== null && !recoveryFailed

  return (
    <div className="space-y-5">
      {accessUrl ? (
        <SubscriptionCredential key={accessUrl} accessUrl={accessUrl} />
      ) : accessPending ? (
        <p className="text-sm text-muted-foreground" role="status">
          正在读取订阅地址…
        </p>
      ) : accessUnavailable ? (
        <p className="text-sm text-muted-foreground">
          当前没有可展示的订阅地址。
        </p>
      ) : accessError && feedback === null ? (
        <ReadError
          message="暂时无法读取订阅地址。"
          error={accessError}
          retry={() => void reconcileSelectedAccess()}
        />
      ) : null}

      {feedback ? <RotationFeedbackMessage feedback={feedback} /> : null}

      {recoveryFailed ? (
        <Button
          type="button"
          variant="outline"
          disabled={recovering}
          onClick={() => void recoverCurrentAccess()}
        >
          {recovering ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {recovering ? '正在重新读取…' : '重新读取订阅地址'}
        </Button>
      ) : null}

      <Dialog
        open={confirmationOpen}
        onOpenChange={(open) => {
          if (open) setConfirmationOpen(true)
          else closeConfirmation()
        }}
      >
        {canStartRotation ? (
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              disabled={
                mutation.isPending ||
                mutationCoordinator.activeAction !== null ||
                mutationCoordinator.recoveryBlocked
              }
              onClick={() => setAcknowledged(false)}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              {requiresResubmitAcknowledgement
                ? '再次重置订阅地址'
                : '重置订阅地址'}
            </Button>
          </DialogTrigger>
        ) : null}
        <DialogContent
          className="max-w-lg"
          closeLabel="关闭重置确认"
          onEscapeKeyDown={(event) => {
            if (mutation.isPending) event.preventDefault()
          }}
          onInteractOutside={(event) => {
            if (mutation.isPending) event.preventDefault()
          }}
        >
          <div className="overflow-y-auto px-5 pb-5 pt-6 sm:px-6 sm:pb-6">
            <DialogTitle className="pr-12 text-lg font-semibold">
              确认重置订阅地址
            </DialogTitle>
            <DialogDescription className="mt-3 text-sm leading-6 text-muted-foreground">
              重置后，当前订阅地址会失效。已导入客户端的旧节点凭据也可能失效，需要使用新的订阅地址重新获取订阅。
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
                  ? '我已确认并保存当前订阅地址，仍要再次重置'
                  : '我已理解旧订阅地址和旧节点凭据可能失效'}
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
                onClick={() => void rotate()}
              >
                {mutation.isPending ? (
                  <LoaderCircle
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                {mutation.isPending ? '正在重置…' : '确认重置'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RotationFeedbackMessage({ feedback }: { feedback: RotationFeedback }) {
  if (feedback.kind === 'success') {
    return (
      <div
        className="border-l-2 border-primary bg-primary/5 px-4 py-3"
        role="status"
      >
        <p className="text-sm font-semibold">
          订阅地址已重置，请使用新地址重新获取订阅。
        </p>
        {!feedback.reconciled ? (
          <p className="mt-1 text-sm text-muted-foreground">
            新订阅地址暂时无法重新读取，请恢复读取后再使用订阅功能。
          </p>
        ) : null}
      </div>
    )
  }

  if (feedback.kind === 'unavailable') {
    return (
      <div
        className="border-l-2 border-foreground/40 bg-muted px-4 py-3"
        role="alert"
      >
        <p className="text-sm">当前账户暂时不能重置订阅地址。</p>
        <RecoveryStatus reconciled={feedback.reconciled} />
      </div>
    )
  }

  if (feedback.kind === 'failed') {
    return (
      <div
        className="border-l-2 border-destructive bg-destructive/5 px-4 py-3"
        role="alert"
      >
        <p className="text-sm">订阅地址重置未完成。</p>
        <RecoveryStatus reconciled={feedback.reconciled} />
      </div>
    )
  }

  return (
    <div
      className="border-l-2 border-foreground/40 bg-muted px-4 py-3"
      role="alert"
    >
      <p className="text-sm font-semibold">重置请求结果暂时无法确认。</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {feedback.reconciled
          ? '已重新读取当前订阅地址。请先确认并保存当前地址，避免重复重置。'
          : '当前订阅地址也暂时无法重新读取。请先重新读取成功，暂时不要再次重置。'}
      </p>
    </div>
  )
}

function RecoveryStatus({ reconciled }: { reconciled: boolean }) {
  return (
    <p className="mt-1 text-sm text-muted-foreground">
      {reconciled
        ? '已重新读取当前订阅地址，请核对后再决定是否重试。'
        : '当前订阅地址暂时无法重新读取，请先恢复读取后再重试。'}
    </p>
  )
}
