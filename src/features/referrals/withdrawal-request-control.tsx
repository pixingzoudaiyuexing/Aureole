import {
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'
import { Eye, EyeOff, LoaderCircle, RefreshCw } from 'lucide-react'
import { useRef, useState } from 'react'
import { ReadError } from '@/components/shared/read-error'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { useExitOnInvalidSessionError } from '@/features/auth/use-exit-on-invalid-session-error'
import { useSynchronousActionLock } from '@/features/auth/use-synchronous-action-lock'
import { ApiError } from '@/lib/api/errors'
import {
  captureAuthSessionGeneration,
  isCurrentAuthSessionGeneration,
} from '@/lib/auth/session-store'
import {
  hasExactPendingMutation,
  useHasExactPendingMutation,
} from './financial-mutation-pending'
import {
  financialOperationKeys,
  finishFinancialAttempt,
  hasRuntimeFinancialAttempt,
  tryBeginFinancialAttempt,
  useRuntimeFinancialAttemptPending,
} from './financial-mutation-runtime'
import { referralsApi, type WithdrawalOptions } from './referrals-api'
import { isAmbiguousWithdrawalRequestError } from './withdrawal-request-errors'
import {
  getWithdrawalOptionsAuthority,
  getWithdrawalRequestUncertaintyStatus,
  useWithdrawalRequestUncertaintyGuard,
} from './withdrawal-request-guard'
import {
  referralsMutationKeys,
  referralsQueryKeys,
  withdrawalRequestMutationOptions,
} from './referrals-queries'

type WithdrawalFeedbackKind =
  | 'success'
  | 'disabled'
  | 'unsupported'
  | 'minimum'
  | 'failed'
  | 'validation'
  | 'unknown'

interface WithdrawalFeedback {
  kind: WithdrawalFeedbackKind
  reconciled: boolean | null
}

interface ConfirmedWithdrawal {
  method: string
  account: string
}

function maskAccount(account: string) {
  return '•'.repeat(Math.min(Math.max(account.length, 6), 16))
}

export function WithdrawalRequestControl({
  accessToken,
  options,
}: {
  accessToken: string
  options: UseQueryResult<WithdrawalOptions>
}) {
  const queryClient = useQueryClient()
  const requestLock = useSynchronousActionLock()
  const sessionInvalidatedRef = useRef(false)
  const mutation = useMutation(withdrawalRequestMutationOptions(accessToken))
  const mutationCachePending = useHasExactPendingMutation(
    referralsMutationKeys.withdrawalRequest,
  )
  const runtimeAttemptPending = useRuntimeFinancialAttemptPending(
    financialOperationKeys.withdrawalRequest,
  )
  const sameRuntimeMutationPending =
    mutationCachePending || runtimeAttemptPending
  const uncertainty = useWithdrawalRequestUncertaintyGuard()
  const [selectedMethod, setSelectedMethod] = useState('')
  const [account, setAccount] = useState('')
  const [accountRevealed, setAccountRevealed] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<ConfirmedWithdrawal | null>(
    null,
  )
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [confirmationAccountRevealed, setConfirmationAccountRevealed] =
    useState(false)
  const [actionPending, setActionPending] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [feedback, setFeedback] = useState<WithdrawalFeedback | null>(null)
  const [keepAcknowledgementVisible, setKeepAcknowledgementVisible] =
    useState(false)
  const [safetyStorageError, setSafetyStorageError] = useState<string | null>(
    null,
  )
  const [sessionError, setSessionError] = useState<unknown>(null)

  const invalidSessionError = [mutation.error, sessionError].find(
    isInvalidSessionError,
  )
  useExitOnInvalidSessionError(invalidSessionError)

  if (invalidSessionError) return null

  const optionsAuthorityReady = options.isSuccess && !options.isFetching
  const requestAvailable =
    optionsAuthorityReady &&
    options.data.enabled &&
    options.data.methods.length > 0
  const safetyStateReady = uncertainty.hydrated && uncertainty.storageAvailable
  const recoveryFailed = feedback?.reconciled === false
  const unknownGuardActive = uncertainty.status === 'active'
  const unknownAcknowledged = uncertainty.status === 'acknowledged'
  const currentSelectedMethod = options.data?.methods.includes(selectedMethod)
    ? selectedMethod
    : ''
  const formDisabled =
    !requestAvailable ||
    !safetyStateReady ||
    actionPending ||
    mutation.isPending ||
    recovering ||
    recoveryFailed ||
    Boolean(safetyStorageError) ||
    unknownGuardActive ||
    sameRuntimeMutationPending
  const showUnknownAcknowledgement =
    !sameRuntimeMutationPending &&
    !recoveryFailed &&
    optionsAuthorityReady &&
    safetyStateReady &&
    (keepAcknowledgementVisible ||
      feedback?.kind === 'unknown' ||
      unknownGuardActive)

  const closeConfirmation = () => {
    setConfirmationOpen(false)
    setConfirmation(null)
    setConfirmationAccountRevealed(false)
    setAccountRevealed(false)
  }

  const clearSensitiveForm = () => {
    setAccount('')
    setAccountRevealed(false)
    setSelectedMethod('')
    closeConfirmation()
  }

  const refreshWithdrawalOptions = async (attemptGeneration: number) => {
    if (!isCurrentAuthSessionGeneration(attemptGeneration)) return false
    await queryClient.invalidateQueries({
      queryKey: referralsQueryKeys.withdrawalOptions,
      exact: true,
      refetchType: 'none',
    })
    if (!isCurrentAuthSessionGeneration(attemptGeneration)) return false
    try {
      const data = await referralsApi.getWithdrawalOptions(accessToken)
      if (!isCurrentAuthSessionGeneration(attemptGeneration)) return false
      queryClient.setQueryData(referralsQueryKeys.withdrawalOptions, data)
      return true
    } catch (error) {
      if (!isCurrentAuthSessionGeneration(attemptGeneration)) return false
      if (isInvalidSessionError(error)) {
        sessionInvalidatedRef.current = true
        setSessionError(error)
      }
      return false
    }
  }

  const openConfirmation = () => {
    if (formDisabled) return
    if (
      hasExactPendingMutation(
        queryClient,
        referralsMutationKeys.withdrawalRequest,
      ) ||
      hasRuntimeFinancialAttempt(financialOperationKeys.withdrawalRequest)
    ) {
      setFieldError(null)
      return
    }
    const authority = getWithdrawalOptionsAuthority(queryClient)
    if (
      !authority ||
      !authority.enabled ||
      authority.methods.length === 0 ||
      getWithdrawalRequestUncertaintyStatus(queryClient) === 'active'
    ) {
      setFieldError('当前提现状态正在更新，请完成重新读取后再确认。')
      return
    }
    if (!selectedMethod || !authority.methods.includes(selectedMethod)) {
      setSelectedMethod('')
      setFieldError('请选择当前服务端提供的提现方式。')
      return
    }
    if (account.length < 1 || account.length > 1024) {
      setFieldError('请输入 1 至 1024 个字符的提现账户。')
      return
    }
    setFieldError(null)
    setConfirmation({ method: selectedMethod, account })
    setConfirmationAccountRevealed(false)
    setConfirmationOpen(true)
  }

  const rejectStaleConfirmation = (message: string, clearMethod = false) => {
    closeConfirmation()
    if (clearMethod) setSelectedMethod('')
    setFieldError(message)
    requestLock.release()
  }

  const requestWithdrawal = async () => {
    if (!confirmation || !requestLock.tryAcquire()) return

    const authority = getWithdrawalOptionsAuthority(queryClient)
    if (
      !authority ||
      !authority.enabled ||
      authority.methods.length === 0 ||
      !uncertainty.hydrated ||
      !uncertainty.storageAvailable ||
      getWithdrawalRequestUncertaintyStatus(queryClient) === 'active'
    ) {
      rejectStaleConfirmation('当前提现状态已变化，请完成重新读取后重新确认。')
      return
    }
    if (!authority.methods.includes(confirmation.method)) {
      rejectStaleConfirmation(
        '当前选择的提现方式已不可用，请重新选择并确认。',
        true,
      )
      return
    }
    if (confirmation.account.length < 1 || confirmation.account.length > 1024) {
      rejectStaleConfirmation('提现账户内容已变化，请重新填写并确认。')
      return
    }
    if (
      hasExactPendingMutation(
        queryClient,
        referralsMutationKeys.withdrawalRequest,
      )
    ) {
      closeConfirmation()
      setFieldError(null)
      requestLock.release()
      return
    }

    const runtimeAttempt = tryBeginFinancialAttempt(
      financialOperationKeys.withdrawalRequest,
    )
    if (!runtimeAttempt) {
      closeConfirmation()
      setFieldError(null)
      requestLock.release()
      return
    }
    const attemptGeneration = captureAuthSessionGeneration()

    if (!uncertainty.preArm()) {
      setSafetyStorageError(
        '当前无法建立提现申请安全状态，请稍后重试或检查浏览器存储设置。',
      )
      closeConfirmation()
      requestLock.release()
      finishFinancialAttempt(runtimeAttempt)
      return
    }

    setSafetyStorageError(null)
    setKeepAcknowledgementVisible(false)
    sessionInvalidatedRef.current = false
    setActionPending(true)
    setFeedback(null)
    mutation.reset()
    const request = mutation.mutateAsync(confirmation)
    try {
      await request
      if (!isCurrentAuthSessionGeneration(attemptGeneration)) return
      clearUncertainty()
      clearSensitiveForm()
      setFeedback({ kind: 'success', reconciled: null })
      const reconciled = await refreshWithdrawalOptions(attemptGeneration)
      if (
        isCurrentAuthSessionGeneration(attemptGeneration) &&
        !sessionInvalidatedRef.current
      ) {
        setFeedback({ kind: 'success', reconciled })
      }
    } catch (error) {
      if (!isCurrentAuthSessionGeneration(attemptGeneration)) return
      clearSensitiveForm()
      if (isInvalidSessionError(error)) {
        sessionInvalidatedRef.current = true
        setSessionError(error)
        return
      }

      if (isAmbiguousWithdrawalRequestError(error)) {
        uncertainty.retainActive()
        setKeepAcknowledgementVisible(true)
        setFieldError(null)
        setFeedback({ kind: 'unknown', reconciled: null })
        const reconciled = await refreshWithdrawalOptions(attemptGeneration)
        if (
          isCurrentAuthSessionGeneration(attemptGeneration) &&
          !sessionInvalidatedRef.current
        ) {
          setFeedback({ kind: 'unknown', reconciled })
        }
      } else {
        clearUncertainty()
        const kind: WithdrawalFeedbackKind =
          error instanceof ApiError && error.code === 'WITHDRAWAL_DISABLED'
            ? 'disabled'
            : error instanceof ApiError &&
                error.code === 'WITHDRAWAL_METHOD_UNSUPPORTED'
              ? 'unsupported'
              : error instanceof ApiError &&
                  error.code === 'WITHDRAWAL_MINIMUM_NOT_MET'
                ? 'minimum'
                : error instanceof ApiError && error.code === 'VALIDATION_ERROR'
                  ? 'validation'
                  : 'failed'
        setFeedback({ kind, reconciled: null })
        const reconciled = await refreshWithdrawalOptions(attemptGeneration)
        if (
          isCurrentAuthSessionGeneration(attemptGeneration) &&
          !sessionInvalidatedRef.current
        ) {
          setFeedback({ kind, reconciled })
        }
      }
    } finally {
      if (isCurrentAuthSessionGeneration(attemptGeneration)) {
        mutation.reset()
        const mutationCache = queryClient.getMutationCache()
        mutationCache
          .findAll({
            mutationKey: referralsMutationKeys.withdrawalRequest,
            exact: true,
          })
          .filter((entry) => entry.state.status !== 'pending')
          .forEach((entry) => mutationCache.remove(entry))
        setActionPending(false)
      }
      requestLock.release()
      finishFinancialAttempt(runtimeAttempt)
    }
  }

  const manualRecovery = async () => {
    const recoveryGeneration = captureAuthSessionGeneration()
    if (
      recovering ||
      hasExactPendingMutation(
        queryClient,
        referralsMutationKeys.withdrawalRequest,
      ) ||
      hasRuntimeFinancialAttempt(financialOperationKeys.withdrawalRequest) ||
      (!recoveryFailed && !(unknownGuardActive && !optionsAuthorityReady))
    ) {
      return
    }
    sessionInvalidatedRef.current = false
    setRecovering(true)
    const reconciled = await refreshWithdrawalOptions(recoveryGeneration)
    if (
      !isCurrentAuthSessionGeneration(recoveryGeneration) ||
      sessionInvalidatedRef.current
    ) {
      return
    }
    setRecovering(false)
    if (reconciled && feedback) setFeedback({ ...feedback, reconciled: true })
  }

  const retrySafetyStorage = () => {
    if (uncertainty.retryHydration()) setSafetyStorageError(null)
  }

  const clearUncertainty = () => {
    const cleared = uncertainty.clear()
    if (!cleared) {
      setSafetyStorageError(
        '申请结果已确认，但无法清除提现申请安全状态；下一笔申请已停用。',
      )
    }
    return cleared
  }

  return (
    <section
      className="border-t border-border py-8"
      aria-labelledby="withdrawal-request-title"
    >
      <h3 id="withdrawal-request-title" className="text-base font-semibold">
        提现状态与申请
      </h3>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        提交提现方式和账户信息。具体提现规则与后续人工处理由服务端决定。
      </p>

      <div className="mt-5 max-w-2xl space-y-5">
        {!uncertainty.hydrated ? (
          <p className="text-sm text-muted-foreground" role="status">
            正在检查提现申请安全状态…
          </p>
        ) : !uncertainty.storageAvailable || safetyStorageError ? (
          <div className="space-y-3" role="alert">
            <p className="text-sm text-destructive">
              {safetyStorageError ??
                '当前无法读取提现申请安全状态，提现申请已停用。'}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={retrySafetyStorage}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              重新检查浏览器安全存储
            </Button>
          </div>
        ) : null}

        {options.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">
            正在读取提现状态…
          </p>
        ) : options.isError ? (
          <ReadError
            message="暂时无法读取提现状态，不能提交提现申请。"
            error={options.error}
            retry={() => void options.refetch()}
          />
        ) : options.isFetching ? (
          <p role="status" className="text-sm text-muted-foreground">
            正在重新读取当前提现状态…
          </p>
        ) : !options.data.enabled ? (
          <p className="text-sm text-muted-foreground">当前暂未开放提现。</p>
        ) : options.data.methods.length === 0 ? (
          <p className="text-sm text-muted-foreground">当前未提供提现方式。</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            当前可提交提现申请。请选择服务端提供的方式并填写账户。
          </p>
        )}

        {fieldError && !requestAvailable ? (
          <p className="text-sm text-destructive" role="alert">
            {fieldError}
          </p>
        ) : null}

        {sameRuntimeMutationPending ? (
          <div
            className="border-l-2 border-foreground/40 bg-muted px-4 py-3"
            role="status"
          >
            <p className="text-sm font-semibold">
              上一笔提现申请仍在处理中，请等待结果，暂不能再次提交。
            </p>
          </div>
        ) : feedback ? (
          <WithdrawalFeedbackMessage feedback={feedback} />
        ) : unknownGuardActive ? (
          <PersistedUnknownFeedback authorityReady={optionsAuthorityReady} />
        ) : null}

        {!sameRuntimeMutationPending &&
        (recoveryFailed || (unknownGuardActive && !optionsAuthorityReady)) ? (
          <Button
            type="button"
            variant="outline"
            disabled={recovering}
            onClick={() => void manualRecovery()}
          >
            {recovering ? (
              <LoaderCircle
                className="size-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <RefreshCw className="size-4" aria-hidden="true" />
            )}
            {recovering ? '正在重新读取…' : '重新读取提现状态'}
          </Button>
        ) : null}

        {showUnknownAcknowledgement ? (
          <label className="flex items-start gap-3 text-sm leading-6">
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0 accent-primary"
              checked={unknownAcknowledged}
              disabled={actionPending || recovering}
              onChange={(event) => {
                if (
                  hasExactPendingMutation(
                    queryClient,
                    referralsMutationKeys.withdrawalRequest,
                  )
                ) {
                  return
                }
                setKeepAcknowledgementVisible(true)
                const persisted = event.target.checked
                  ? uncertainty.acknowledge()
                  : uncertainty.activate()
                if (!persisted) {
                  setSafetyStorageError(
                    '当前无法更新提现申请安全状态，请稍后重试或检查浏览器存储设置。',
                  )
                } else {
                  setSafetyStorageError(null)
                }
              }}
            />
            <span>
              我了解上一笔提现申请结果无法确认，仍需再次提交新的提现申请。
            </span>
          </label>
        ) : null}

        {requestAvailable ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <label
                className="text-sm font-medium"
                htmlFor="withdrawal-request-method"
              >
                提现方式
              </label>
              <select
                id="withdrawal-request-method"
                className="h-11 min-w-0 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-200 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive"
                value={currentSelectedMethod}
                disabled={formDisabled}
                aria-invalid={Boolean(fieldError && !currentSelectedMethod)}
                onChange={(event) => {
                  setSelectedMethod(event.target.value)
                  setFieldError(null)
                  if (feedback?.kind !== 'unknown') setFeedback(null)
                  mutation.reset()
                }}
              >
                <option value="">请选择提现方式</option>
                {options.data.methods.map((method, index) => (
                  <option key={`${method}-${index}`} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label
                className="text-sm font-medium"
                htmlFor="withdrawal-request-account"
              >
                提现账户
              </label>
              <div className="flex min-w-0 gap-2">
                <Input
                  id="withdrawal-request-account"
                  type={accountRevealed ? 'text' : 'password'}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={1025}
                  value={account}
                  disabled={formDisabled}
                  aria-invalid={Boolean(fieldError)}
                  aria-describedby={
                    fieldError
                      ? 'withdrawal-account-help withdrawal-account-error'
                      : 'withdrawal-account-help'
                  }
                  onChange={(event) => {
                    setAccount(event.target.value)
                    setFieldError(null)
                    if (feedback?.kind !== 'unknown') setFeedback(null)
                    mutation.reset()
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={formDisabled}
                  aria-label={accountRevealed ? '隐藏提现账户' : '显示提现账户'}
                  onClick={() => setAccountRevealed((current) => !current)}
                >
                  {accountRevealed ? (
                    <EyeOff className="size-4" aria-hidden="true" />
                  ) : (
                    <Eye className="size-4" aria-hidden="true" />
                  )}
                </Button>
              </div>
              <p
                id="withdrawal-account-help"
                className="text-xs leading-5 text-muted-foreground"
              >
                请输入 1 至 1024 个字符；内容会按输入原样提交，不会自动修改。
              </p>
              {fieldError ? (
                <p
                  id="withdrawal-account-error"
                  className="text-sm text-destructive"
                  role="alert"
                >
                  {fieldError}
                </p>
              ) : null}
            </div>

            <Button
              id="withdrawal-request-trigger"
              type="button"
              disabled={formDisabled}
              onClick={openConfirmation}
            >
              提交提现申请
            </Button>
          </div>
        ) : null}
      </div>

      <Dialog
        open={confirmationOpen}
        onOpenChange={(open) => {
          if (open) setConfirmationOpen(true)
          else if (!actionPending) closeConfirmation()
        }}
      >
        <DialogContent
          className="max-w-lg"
          closeLabel="关闭提现申请确认"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            document.getElementById('withdrawal-request-trigger')?.focus()
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
              确认提交提现申请
            </DialogTitle>
            <DialogDescription className="mt-3 text-sm leading-6 text-muted-foreground">
              这是提交提现申请，不代表提现到账。本请求只提交提现方式和账户信息；具体提现规则和人工处理由服务端决定。
            </DialogDescription>
            <dl className="mt-5 space-y-4 border-y border-border py-4 text-sm">
              <ConfirmationValue
                label="提现方式"
                value={confirmation?.method ?? ''}
              />
              <div className="min-w-0">
                <div className="flex min-w-0 items-start justify-between gap-4">
                  <dt className="shrink-0 text-muted-foreground">提现账户</dt>
                  <dd className="min-w-0 break-all text-right font-mono font-medium [overflow-wrap:anywhere]">
                    {confirmation
                      ? confirmationAccountRevealed
                        ? confirmation.account
                        : maskAccount(confirmation.account)
                      : '已隐藏'}
                  </dd>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={actionPending || !confirmation}
                    aria-label={
                      confirmationAccountRevealed
                        ? '隐藏确认中的提现账户'
                        : '显示确认中的提现账户'
                    }
                    onClick={() =>
                      setConfirmationAccountRevealed((current) => !current)
                    }
                  >
                    {confirmationAccountRevealed ? (
                      <EyeOff className="size-4" aria-hidden="true" />
                    ) : (
                      <Eye className="size-4" aria-hidden="true" />
                    )}
                    {confirmationAccountRevealed ? '隐藏' : '显示'}
                  </Button>
                </div>
              </div>
            </dl>
            {!requestAvailable ? (
              <p
                className="mt-5 text-sm leading-6 text-muted-foreground"
                role="status"
              >
                当前提现状态正在重新读取，成功后需要重新确认。
              </p>
            ) : null}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={actionPending}
                onClick={closeConfirmation}
              >
                返回
              </Button>
              <Button
                type="button"
                disabled={
                  !confirmation ||
                  !requestAvailable ||
                  actionPending ||
                  unknownGuardActive ||
                  sameRuntimeMutationPending
                }
                onClick={() => void requestWithdrawal()}
              >
                {actionPending ? (
                  <LoaderCircle
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                {actionPending ? '正在提交…' : '确认提交申请'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function ConfirmationValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium [overflow-wrap:anywhere]">
        {value}
      </dd>
    </div>
  )
}

function PersistedUnknownFeedback({
  authorityReady,
}: {
  authorityReady: boolean
}) {
  return (
    <div
      className="border-l-2 border-foreground/40 bg-muted px-4 py-3"
      role="alert"
    >
      <p className="text-sm font-semibold">
        上一笔提现申请结果暂时无法确认。请避免重复提交。
      </p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {authorityReady
          ? '已重新读取当前提现状态，但无法据此确认上一笔申请结果。'
          : '请先重新读取当前提现状态；这仍不能确认上一笔申请结果。'}
      </p>
    </div>
  )
}

function WithdrawalFeedbackMessage({
  feedback,
}: {
  feedback: WithdrawalFeedback
}) {
  const reconciling = feedback.reconciled === null
  const recoveryFailed = feedback.reconciled === false

  if (feedback.kind === 'success') {
    return (
      <div
        className="border-l-2 border-primary bg-primary/5 px-4 py-3"
        role="status"
      >
        <p className="text-sm font-semibold">提现申请已提交。</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {reconciling
            ? '正在重新读取当前提现状态…'
            : recoveryFailed
              ? '申请已提交，但暂时无法读取最新提现状态。下一笔申请已停用。'
              : '已重新读取当前提现状态。'}
        </p>
      </div>
    )
  }

  if (feedback.kind === 'unknown') {
    return (
      <PersistedUnknownFeedback authorityReady={feedback.reconciled === true} />
    )
  }

  const title =
    feedback.kind === 'disabled'
      ? '当前服务端不开放提现申请。'
      : feedback.kind === 'unsupported'
        ? '当前选择的提现方式已不可用。'
        : feedback.kind === 'minimum'
          ? '当前未达到系统提现要求。'
          : feedback.kind === 'validation'
            ? '当前提现申请内容无效，请重新填写并确认。'
            : '暂时无法提交提现申请。'

  return (
    <div
      className="border-l-2 border-foreground/40 bg-muted px-4 py-3"
      role="alert"
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {reconciling
          ? '正在重新读取当前提现状态…'
          : recoveryFailed
            ? '当前提现状态暂时无法读取。恢复读取前不能再次提交申请。'
            : '已重新读取当前提现状态。再次提交需要重新选择方式、填写账户并确认。'}
      </p>
    </div>
  )
}
