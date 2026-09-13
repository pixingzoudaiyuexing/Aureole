import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, Plus, RefreshCw } from 'lucide-react'
import { useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { FieldError, MutationFeedback } from '@/features/auth/form-feedback'
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { useExitOnInvalidSessionError } from '@/features/auth/use-exit-on-invalid-session-error'
import { useSynchronousActionLock } from '@/features/auth/use-synchronous-action-lock'
import { ApiError } from '@/lib/api/errors'
import {
  createTicketRequestSchema,
  type CreateTicketInput,
} from './tickets-api'
import {
  getTicketCreateErrorMessage,
  isAmbiguousTicketCreateError,
} from './ticket-create-errors'
import {
  ticketCreateMutationOptions,
  ticketsListOptions,
  ticketsQueryKeys,
} from './tickets-queries'

const defaultValues: CreateTicketInput = {
  subject: '',
  priority: 'normal',
  message: '',
}

type CreateFeedback =
  | { kind: 'success'; reconciled: boolean | null }
  | { kind: 'unavailable'; reconciled: boolean | null }
  | { kind: 'unknown'; reconciled: boolean | null }

export function TicketCreateControl({ accessToken }: { accessToken: string }) {
  const queryClient = useQueryClient()
  const sessionInvalidatedRef = useRef(false)
  const createLock = useSynchronousActionLock()
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
  const mutation = useMutation(ticketCreateMutationOptions(accessToken))
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateTicketInput>({ defaultValues })
  const subject = useWatch({ control, name: 'subject' })
  const message = useWatch({ control, name: 'message' })

  const invalidSessionError = isInvalidSessionError(mutation.error)
    ? mutation.error
    : isInvalidSessionError(sessionError)
      ? sessionError
      : null
  useExitOnInvalidSessionError(invalidSessionError)

  if (invalidSessionError) return null

  const busy = actionPending || isSubmitting || mutation.isPending
  const recoveryFailed = feedback?.reconciled === false
  const unknownGuardActive =
    feedback?.kind === 'unknown' && feedback.reconciled === true
  const createDisabled =
    busy ||
    recovering ||
    recoveryFailed ||
    (unknownGuardActive && !unknownAcknowledged)

  const refreshTickets = async () => {
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

  const setValidationErrors = (values: CreateTicketInput) => {
    const parsed = createTicketRequestSchema.safeParse(values)
    if (parsed.success) return parsed.data

    for (const issue of parsed.error.issues) {
      const field = issue.path[0]
      if (field === 'subject') {
        setError('subject', {
          type: 'validate',
          message:
            values.subject.length === 0
              ? '请输入工单主题。'
              : '工单主题不能超过 255 个字符。',
        })
      } else if (field === 'message') {
        setError('message', {
          type: 'validate',
          message:
            values.message.length === 0
              ? '请输入问题描述。'
              : '问题描述不能超过 10000 个字符。',
        })
      } else if (field === 'priority') {
        setError('priority', {
          type: 'validate',
          message: '请选择有效的优先级。',
        })
      }
    }
    return null
  }

  const createTicket = async (values: CreateTicketInput) => {
    const parsed = setValidationErrors(values)
    if (!parsed || (unknownGuardActive && !unknownAcknowledged)) return
    if (!createLock.tryAcquire()) return

    sessionInvalidatedRef.current = false
    setActionPending(true)
    setDialogError(null)
    mutation.reset()
    try {
      await mutation.mutateAsync(parsed)
      reset(defaultValues)
      setUnknownAcknowledged(false)
      setDialogOpen(false)
      setFeedback({ kind: 'success', reconciled: null })
      const reconciled = await refreshTickets()
      if (!sessionInvalidatedRef.current) {
        setFeedback({ kind: 'success', reconciled })
      }
    } catch (error) {
      if (isInvalidSessionError(error)) {
        sessionInvalidatedRef.current = true
        setSessionError(error)
        return
      }

      if (error instanceof ApiError && error.code === 'TICKET_UNAVAILABLE') {
        setUnknownAcknowledged(false)
        setDialogOpen(false)
        setFeedback({ kind: 'unavailable', reconciled: null })
        const reconciled = await refreshTickets()
        if (!sessionInvalidatedRef.current) {
          setFeedback({ kind: 'unavailable', reconciled })
        }
      } else if (isAmbiguousTicketCreateError(error)) {
        setUnknownAcknowledged(false)
        setDialogOpen(false)
        setFeedback({ kind: 'unknown', reconciled: null })
        const reconciled = await refreshTickets()
        if (!sessionInvalidatedRef.current) {
          setFeedback({ kind: 'unknown', reconciled })
        }
      } else {
        setDialogError({
          error,
          message: getTicketCreateErrorMessage(error),
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
    const reconciled = await refreshTickets()
    if (sessionInvalidatedRef.current) return
    setRecovering(false)
    if (reconciled) {
      setFeedback({ ...feedback, reconciled: true })
    }
  }

  const onPayloadChange = () => {
    clearErrors()
    setDialogError(null)
    mutation.reset()
    if (unknownGuardActive) setUnknownAcknowledged(false)
  }

  const subjectField = register('subject')
  const priorityField = register('priority')
  const messageField = register('message')

  return (
    <div className="mt-5 space-y-4">
      <Button
        id="ticket-create-trigger"
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
        新建工单
      </Button>

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
          {recovering ? '正在重新读取…' : '重新读取工单列表'}
        </Button>
      ) : null}

      {unknownGuardActive ? (
        <UnknownAcknowledgement
          checked={unknownAcknowledged}
          disabled={busy || recovering}
          onChange={setUnknownAcknowledged}
        />
      ) : null}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (open) setDialogOpen(true)
          else if (!busy) setDialogOpen(false)
        }}
      >
        <DialogContent
          className="max-w-xl"
          closeLabel="关闭新建工单"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            document.getElementById('ticket-create-trigger')?.focus()
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
              新建工单
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm leading-6 text-muted-foreground">
              填写问题后提交给客服。是否可以创建工单由服务端最终确认。
            </DialogDescription>
          </div>

          <form
            className="min-h-0 space-y-5 overflow-y-auto px-5 py-5 sm:px-6"
            onSubmit={(event) => {
              void handleSubmit(createTicket)(event)
            }}
            noValidate
          >
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-4">
                <label className="text-sm font-medium" htmlFor="ticket-subject">
                  主题
                </label>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {subject.length} / 255
                </span>
              </div>
              <Input
                id="ticket-subject"
                autoComplete="off"
                disabled={busy}
                aria-invalid={Boolean(errors.subject)}
                aria-describedby={
                  errors.subject
                    ? 'ticket-subject-help ticket-subject-error'
                    : 'ticket-subject-help'
                }
                {...subjectField}
                onChange={(event) => {
                  void subjectField.onChange(event)
                  onPayloadChange()
                }}
              />
              <p
                id="ticket-subject-help"
                className="text-xs leading-5 text-muted-foreground"
              >
                请输入 1 至 255 个字符，内容会按原文提交。
              </p>
              <FieldError
                id="ticket-subject-error"
                message={errors.subject?.message}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="ticket-priority">
                优先级
              </label>
              <select
                id="ticket-priority"
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-200 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive"
                disabled={busy}
                aria-invalid={Boolean(errors.priority)}
                aria-describedby={
                  errors.priority ? 'ticket-priority-error' : undefined
                }
                {...priorityField}
                onChange={(event) => {
                  void priorityField.onChange(event)
                  onPayloadChange()
                }}
              >
                <option value="low">低</option>
                <option value="normal">普通</option>
                <option value="high">高</option>
              </select>
              <FieldError
                id="ticket-priority-error"
                message={errors.priority?.message}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-4">
                <label className="text-sm font-medium" htmlFor="ticket-message">
                  问题描述
                </label>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {message.length} / 10000
                </span>
              </div>
              <textarea
                id="ticket-message"
                rows={8}
                className="min-h-40 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 text-foreground outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20"
                autoComplete="off"
                disabled={busy}
                aria-invalid={Boolean(errors.message)}
                aria-describedby={
                  errors.message
                    ? 'ticket-message-help ticket-message-error'
                    : 'ticket-message-help'
                }
                {...messageField}
                onChange={(event) => {
                  void messageField.onChange(event)
                  onPayloadChange()
                }}
              />
              <p
                id="ticket-message-help"
                className="text-xs leading-5 text-muted-foreground"
              >
                请输入 1 至 10000 个字符，换行和空格会按原文提交。
              </p>
              <FieldError
                id="ticket-message-error"
                message={errors.message?.message}
              />
            </div>

            {dialogError ? (
              <MutationFeedback
                error={dialogError.error}
                message={dialogError.message}
              />
            ) : null}

            {unknownGuardActive && !unknownAcknowledged ? (
              <UnknownAcknowledgement
                checked={unknownAcknowledged}
                disabled={busy}
                onChange={setUnknownAcknowledged}
              />
            ) : null}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setDialogOpen(false)}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={busy || (unknownGuardActive && !unknownAcknowledged)}
              >
                {busy ? (
                  <LoaderCircle
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                {busy ? '正在提交…' : '提交工单'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function UnknownAcknowledgement({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex max-w-2xl items-start gap-3 text-sm leading-6">
      <input
        type="checkbox"
        className="mt-1 size-4 shrink-0 accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>我已检查当前工单列表，确认仍需重新提交工单。</span>
    </label>
  )
}

function CreateFeedbackMessage({ feedback }: { feedback: CreateFeedback }) {
  if (feedback.kind === 'success') {
    return (
      <div
        className="max-w-2xl border-l-2 border-primary bg-primary/5 px-4 py-3"
        role="status"
      >
        <p className="text-sm font-semibold">工单已提交。</p>
        {feedback.reconciled === false ? (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            工单已提交，但暂时无法读取最新工单列表。
          </p>
        ) : feedback.reconciled === null ? (
          <p className="mt-2 text-sm text-muted-foreground">
            正在重新读取工单列表…
          </p>
        ) : null}
      </div>
    )
  }

  if (feedback.kind === 'unavailable') {
    return (
      <div
        className="max-w-2xl border-l-2 border-foreground/40 bg-muted px-4 py-3"
        role="alert"
      >
        <p className="text-sm font-semibold">
          当前暂时无法创建新工单，请检查已有工单或账户状态。
        </p>
        {feedback.reconciled === false ? (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            当前工单列表暂时无法重新读取。请先恢复列表，再尝试创建工单。
          </p>
        ) : feedback.reconciled === null ? (
          <p className="mt-2 text-sm text-muted-foreground">
            正在重新读取工单列表…
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
      <p className="text-sm font-semibold">工单提交结果暂时无法确认。</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {feedback.reconciled === true
          ? '已重新读取当前工单列表。请先检查列表，避免重复提交。'
          : feedback.reconciled === false
            ? '当前工单列表暂时无法重新读取。请先恢复列表，暂时不要再次提交工单。'
            : '正在重新读取工单列表…'}
      </p>
    </div>
  )
}
