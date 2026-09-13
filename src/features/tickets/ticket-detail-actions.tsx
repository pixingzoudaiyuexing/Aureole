import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, RefreshCw } from 'lucide-react'
import { useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { FieldError } from '@/features/auth/form-feedback'
import { useExitOnInvalidSessionError } from '@/features/auth/use-exit-on-invalid-session-error'
import { ApiError } from '@/lib/api/errors'
import {
  replyTicketRequestSchema,
  type ReplyTicketInput,
  type TicketDetail,
  type TicketStatus,
} from './tickets-api'
import { useTicketMutationCoordinator } from './ticket-mutation-coordinator'
import { isAmbiguousTicketMutationError } from './ticket-mutation-errors'
import {
  ticketCloseMutationOptions,
  ticketDetailOptions,
  ticketReplyMutationOptions,
  ticketsListOptions,
  ticketsQueryKeys,
} from './tickets-queries'

type ReconciledFeedbackKind =
  | 'reply-success'
  | 'reply-failed'
  | 'reply-unknown'
  | 'close-success'
  | 'close-failed'
  | 'close-unknown'

type DetailFeedback =
  | {
      kind: ReconciledFeedbackKind
      detailReconciled: boolean | null
      listReconciled: boolean | null
      latestStatus: TicketStatus | null
    }
  | { kind: 'reply-validation' }
  | { kind: 'not-found'; listReconciled: boolean | null }

const defaultReply: ReplyTicketInput = { message: '' }

export function TicketDetailActions({
  accessToken,
  authorityReady,
  detail,
  onBusyChange,
  ticketId,
}: {
  accessToken: string
  authorityReady: boolean
  detail: TicketDetail | undefined
  onBusyChange: (busy: boolean) => void
  ticketId: string
}) {
  const queryClient = useQueryClient()
  const coordinator = useTicketMutationCoordinator()
  const sessionInvalidatedRef = useRef(false)
  const [feedback, setFeedback] = useState<DetailFeedback | null>(null)
  const [replyUnknownGuard, setReplyUnknownGuard] = useState(false)
  const [replyUnknownAcknowledged, setReplyUnknownAcknowledged] =
    useState(false)
  const [closeUnknownGuard, setCloseUnknownGuard] = useState(false)
  const [closeUnknownAcknowledged, setCloseUnknownAcknowledged] =
    useState(false)
  const [closeConfirming, setCloseConfirming] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [sessionError, setSessionError] = useState<unknown>(null)
  const replyMutation = useMutation(ticketReplyMutationOptions(accessToken))
  const closeMutation = useMutation(ticketCloseMutationOptions(accessToken))
  const {
    clearErrors,
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<ReplyTicketInput>({ defaultValues: defaultReply })
  const message = useWatch({ control, name: 'message' })

  const invalidSessionError = isInvalidSessionError(replyMutation.error)
    ? replyMutation.error
    : isInvalidSessionError(closeMutation.error)
      ? closeMutation.error
      : isInvalidSessionError(sessionError)
        ? sessionError
        : null
  useExitOnInvalidSessionError(invalidSessionError)

  const currentDetail = detail?.id === ticketId ? detail : undefined
  const currentStatus = currentDetail?.status ?? null
  const unavailable = feedback?.kind === 'not-found'
  const busy =
    coordinator.activeAction !== null ||
    isSubmitting ||
    replyMutation.isPending ||
    closeMutation.isPending
  const recoveryFailed =
    feedback !== null &&
    'detailReconciled' in feedback &&
    feedback.detailReconciled === false &&
    !authorityReady
  const visibleFeedback =
    feedback &&
    'detailReconciled' in feedback &&
    feedback.detailReconciled === false &&
    authorityReady &&
    currentStatus
      ? {
          ...feedback,
          detailReconciled: true as const,
          latestStatus: currentStatus,
        }
      : feedback

  if (invalidSessionError) return null

  const refreshList = async () => {
    await queryClient.invalidateQueries({
      queryKey: ticketsQueryKeys.list,
      exact: true,
      refetchType: 'none',
    })
    try {
      await queryClient.fetchQuery({
        ...ticketsListOptions(accessToken),
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

  const refreshDetail = async () => {
    await queryClient.invalidateQueries({
      queryKey: ticketsQueryKeys.detail(ticketId),
      exact: true,
      refetchType: 'none',
    })
    try {
      const latest = await queryClient.fetchQuery({
        ...ticketDetailOptions(accessToken, ticketId),
        staleTime: 0,
      })
      return { detailReconciled: true, latestStatus: latest.status }
    } catch (error) {
      if (isInvalidSessionError(error)) {
        sessionInvalidatedRef.current = true
        setSessionError(error)
      }
      return { detailReconciled: false, latestStatus: null }
    }
  }

  const reconcileDetailAndList = async () => {
    const [detailResult, listReconciled] = await Promise.all([
      refreshDetail(),
      refreshList(),
    ])
    return { ...detailResult, listReconciled }
  }

  const hasCurrentAuthority = () => {
    const state = queryClient.getQueryState<TicketDetail>(
      ticketsQueryKeys.detail(ticketId),
    )
    return (
      authorityReady &&
      currentStatus === 'open' &&
      !unavailable &&
      !recovering &&
      state?.status === 'success' &&
      state.fetchStatus === 'idle' &&
      state.data?.id === ticketId &&
      state.data.status === 'open'
    )
  }

  const beginAction = (action: 'reply' | 'close') => {
    if (!hasCurrentAuthority() || !coordinator.tryAcquire(action)) return false
    sessionInvalidatedRef.current = false
    onBusyChange(true)
    return true
  }

  const finishAction = () => {
    coordinator.release()
    onBusyChange(false)
  }

  const setReconciledFeedback = async (kind: ReconciledFeedbackKind) => {
    setFeedback({
      kind,
      detailReconciled: null,
      listReconciled: null,
      latestStatus: null,
    })
    const reconciled = await reconcileDetailAndList()
    if (!sessionInvalidatedRef.current) setFeedback({ kind, ...reconciled })
  }

  const markNotFound = async () => {
    setFeedback({ kind: 'not-found', listReconciled: null })
    await queryClient.invalidateQueries({
      queryKey: ticketsQueryKeys.detail(ticketId),
      exact: true,
      refetchType: 'none',
    })
    const listReconciled = await refreshList()
    if (!sessionInvalidatedRef.current) {
      setFeedback({ kind: 'not-found', listReconciled })
    }
  }

  const sendReply = async (values: ReplyTicketInput) => {
    const parsed = replyTicketRequestSchema.safeParse(values)
    if (!parsed.success) {
      setError('message', {
        type: 'validate',
        message:
          values.message.length === 0
            ? '请输入回复内容。'
            : '回复内容不能超过 10000 个字符。',
      })
      return
    }
    if (replyUnknownGuard && !replyUnknownAcknowledged) return
    if (!beginAction('reply')) return

    setFeedback(null)
    replyMutation.reset()
    try {
      await replyMutation.mutateAsync({ id: ticketId, input: parsed.data })
      reset(defaultReply)
      setReplyUnknownGuard(false)
      setReplyUnknownAcknowledged(false)
      await setReconciledFeedback('reply-success')
    } catch (error) {
      if (isInvalidSessionError(error)) {
        sessionInvalidatedRef.current = true
        setSessionError(error)
        return
      }
      if (error instanceof ApiError && error.code === 'TICKET_NOT_FOUND') {
        await markNotFound()
      } else if (
        error instanceof ApiError &&
        error.code === 'VALIDATION_ERROR'
      ) {
        setFeedback({ kind: 'reply-validation' })
      } else if (
        error instanceof ApiError &&
        error.code === 'TICKET_REPLY_FAILED'
      ) {
        await setReconciledFeedback('reply-failed')
      } else if (isAmbiguousTicketMutationError(error)) {
        setReplyUnknownGuard(true)
        setReplyUnknownAcknowledged(false)
        await setReconciledFeedback('reply-unknown')
      } else {
        await setReconciledFeedback('reply-failed')
      }
    } finally {
      finishAction()
    }
  }

  const closeTicket = async () => {
    if (closeUnknownGuard && !closeUnknownAcknowledged) return
    if (!beginAction('close')) return

    setFeedback(null)
    closeMutation.reset()
    try {
      await closeMutation.mutateAsync(ticketId)
      setCloseUnknownGuard(false)
      setCloseUnknownAcknowledged(false)
      setCloseConfirming(false)
      await setReconciledFeedback('close-success')
    } catch (error) {
      if (isInvalidSessionError(error)) {
        sessionInvalidatedRef.current = true
        setSessionError(error)
        return
      }
      setCloseConfirming(false)
      if (error instanceof ApiError && error.code === 'TICKET_NOT_FOUND') {
        await markNotFound()
      } else if (
        error instanceof ApiError &&
        error.code === 'TICKET_CLOSE_FAILED'
      ) {
        await setReconciledFeedback('close-failed')
      } else if (isAmbiguousTicketMutationError(error)) {
        setCloseUnknownGuard(true)
        setCloseUnknownAcknowledged(false)
        await setReconciledFeedback('close-unknown')
      } else {
        await setReconciledFeedback('close-failed')
      }
    } finally {
      finishAction()
    }
  }

  const manualRecovery = async () => {
    if (!recoveryFailed || recovering || busy) return
    sessionInvalidatedRef.current = false
    setRecovering(true)
    const recovered = await refreshDetail()
    setRecovering(false)
    if (sessionInvalidatedRef.current || !('detailReconciled' in feedback)) {
      return
    }
    setFeedback({ ...feedback, ...recovered })
  }

  const actionDisabled = !authorityReady || busy || recovering || unavailable
  const replyDisabled =
    actionDisabled || (replyUnknownGuard && !replyUnknownAcknowledged)
  const closeDisabled =
    actionDisabled || (closeUnknownGuard && !closeUnknownAcknowledged)
  const messageField = register('message')

  return (
    <section
      className="mt-7 space-y-5 border-t border-border pt-6"
      aria-labelledby="ticket-actions-title"
    >
      <h3 id="ticket-actions-title" className="text-base font-semibold">
        工单操作
      </h3>

      {visibleFeedback ? (
        <TicketActionFeedback feedback={visibleFeedback} />
      ) : null}

      {recoveryFailed ? (
        <Button
          type="button"
          variant="outline"
          disabled={recovering || busy}
          onClick={() => void manualRecovery()}
        >
          {recovering ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="size-4" aria-hidden="true" />
          )}
          {recovering ? '正在重新读取…' : '重新读取工单详情'}
        </Button>
      ) : null}

      {currentStatus === 'closed' ? (
        <p className="text-sm font-medium">该工单已关闭。</p>
      ) : currentStatus === 'open' && !unavailable ? (
        <>
          {!authorityReady ? (
            <p
              className="text-sm leading-6 text-muted-foreground"
              role="status"
            >
              成功读取当前工单详情后才能回复或关闭工单。
            </p>
          ) : null}

          <form
            className="space-y-3"
            onSubmit={(event) => void handleSubmit(sendReply)(event)}
            noValidate
          >
            <div className="flex items-baseline justify-between gap-4">
              <label
                className="text-sm font-medium"
                htmlFor="ticket-reply-message"
              >
                回复工单
              </label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {message.length} / 10000
              </span>
            </div>
            <textarea
              id="ticket-reply-message"
              rows={5}
              className="min-h-28 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 text-foreground outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20"
              autoComplete="off"
              disabled={actionDisabled}
              aria-invalid={Boolean(errors.message)}
              aria-describedby={
                errors.message
                  ? 'ticket-reply-help ticket-reply-error'
                  : 'ticket-reply-help'
              }
              {...messageField}
              onChange={(event) => {
                void messageField.onChange(event)
                clearErrors('message')
                if (feedback?.kind === 'reply-validation') setFeedback(null)
                if (replyUnknownGuard) setReplyUnknownAcknowledged(false)
              }}
            />
            <p
              id="ticket-reply-help"
              className="text-xs leading-5 text-muted-foreground"
            >
              请输入 1 至 10000 个字符，换行和空格会按原文提交。
            </p>
            <FieldError
              id="ticket-reply-error"
              message={errors.message?.message}
            />

            {replyUnknownGuard && authorityReady ? (
              <Acknowledgement
                checked={replyUnknownAcknowledged}
                disabled={actionDisabled}
                onChange={setReplyUnknownAcknowledged}
              >
                我已核对当前回复记录，仍需重新发送此回复。
              </Acknowledgement>
            ) : null}

            <Button type="submit" disabled={replyDisabled}>
              {coordinator.activeAction === 'reply' ? (
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              {coordinator.activeAction === 'reply' ? '正在发送…' : '发送回复'}
            </Button>
          </form>

          <div className="space-y-3 border-t border-border pt-5">
            {closeUnknownGuard && authorityReady ? (
              <Acknowledgement
                checked={closeUnknownAcknowledged}
                disabled={actionDisabled}
                onChange={setCloseUnknownAcknowledged}
              >
                我已核对当前工单仍为开启状态，仍需再次提交关闭请求。
              </Acknowledgement>
            ) : null}
            <Button
              id="ticket-close-trigger"
              type="button"
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={closeDisabled}
              onClick={() => {
                if (closeDisabled) return
                setCloseConfirming(true)
              }}
            >
              关闭工单
            </Button>
          </div>
        </>
      ) : !unavailable ? (
        <p className="text-sm leading-6 text-muted-foreground" role="status">
          正在确认工单当前状态…
        </p>
      ) : null}

      <Dialog
        open={closeConfirming && currentStatus === 'open'}
        onOpenChange={(open) => {
          if (open) setCloseConfirming(true)
          else if (!busy) setCloseConfirming(false)
        }}
      >
        <DialogContent
          className="max-w-md"
          closeLabel="关闭确认对话框"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            document.getElementById('ticket-close-trigger')?.focus()
          }}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault()
          }}
          onInteractOutside={(event) => {
            if (busy) event.preventDefault()
          }}
        >
          <div className="border-b border-border px-5 py-5 pr-16 sm:px-6">
            <DialogTitle className="text-lg font-semibold">
              确认关闭工单？
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-6 text-muted-foreground">
              关闭后可能无法继续回复。实际状态由服务端决定。
            </DialogDescription>
          </div>
          <div className="flex flex-col-reverse gap-3 px-5 py-5 sm:flex-row sm:justify-end sm:px-6">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setCloseConfirming(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={actionDisabled}
              onClick={() => void closeTicket()}
            >
              {coordinator.activeAction === 'close' ? (
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              {coordinator.activeAction === 'close'
                ? '正在关闭…'
                : '确认关闭工单'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function Acknowledgement({
  checked,
  children,
  disabled,
  onChange,
}: {
  checked: boolean
  children: string
  disabled: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-start gap-3 text-sm leading-6">
      <input
        type="checkbox"
        className="mt-1 size-4 shrink-0 accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{children}</span>
    </label>
  )
}

function TicketActionFeedback({ feedback }: { feedback: DetailFeedback }) {
  const isSuccess =
    feedback.kind === 'reply-success' || feedback.kind === 'close-success'
  const className = isSuccess
    ? 'border-primary bg-primary/5'
    : 'border-foreground/40 bg-muted'

  if (feedback.kind === 'reply-validation') {
    return (
      <div
        className="border-l-2 border-destructive bg-destructive/5 px-4 py-3"
        role="alert"
      >
        <p className="text-sm">回复内容无效，请检查后重新发送。</p>
      </div>
    )
  }

  if (feedback.kind === 'not-found') {
    return (
      <div
        className="border-l-2 border-foreground/40 bg-muted px-4 py-3"
        role="alert"
      >
        <p className="text-sm font-semibold">该工单不存在或已不可用。</p>
        {feedback.listReconciled === false ? (
          <p className="mt-2 text-sm text-muted-foreground">
            当前工单列表暂时无法重新读取。
          </p>
        ) : feedback.listReconciled === null ? (
          <p className="mt-2 text-sm text-muted-foreground">
            正在重新读取工单列表…
          </p>
        ) : null}
      </div>
    )
  }

  const titles: Record<ReconciledFeedbackKind, string> = {
    'reply-success': '回复已发送。',
    'reply-failed': '当前工单暂时无法回复，请重新读取工单状态后再试。',
    'reply-unknown': '回复结果暂时无法确认。',
    'close-success': '工单已关闭。',
    'close-failed': '工单关闭未能完成，请重新读取工单状态后再试。',
    'close-unknown': '关闭请求结果暂时无法确认。',
  }

  return (
    <div
      className={`border-l-2 px-4 py-3 ${className}`}
      role={isSuccess ? 'status' : 'alert'}
    >
      <p className="text-sm font-semibold">{titles[feedback.kind]}</p>
      {feedback.detailReconciled === null ? (
        <p className="mt-2 text-sm text-muted-foreground">
          正在重新读取工单详情…
        </p>
      ) : feedback.detailReconciled === false ? (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          工单详情暂时无法重新读取，恢复前不能再次回复或关闭工单。
        </p>
      ) : feedback.kind === 'reply-unknown' ? (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {feedback.latestStatus === 'closed'
            ? '当前工单已关闭。'
            : '已重新读取当前回复记录，但无法据此判断刚才的回复结果。'}
        </p>
      ) : feedback.kind === 'close-unknown' ? (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {feedback.latestStatus === 'closed'
            ? '当前工单状态为已关闭。'
            : '当前工单仍为开启状态，但无法据此判断刚才的关闭请求结果。'}
        </p>
      ) : null}
      {feedback.listReconciled === false ? (
        <p className="mt-2 text-sm text-muted-foreground">
          工单列表暂时无法重新读取。
        </p>
      ) : null}
    </div>
  )
}
