import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'
import { LoaderCircle, RefreshCw } from 'lucide-react'
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
import type { AccountConfig } from '@/features/account/account-api'
import { accountConfigQueryOptions } from '@/features/account/account-queries'
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { useExitOnInvalidSessionError } from '@/features/auth/use-exit-on-invalid-session-error'
import { useSynchronousActionLock } from '@/features/auth/use-synchronous-action-lock'
import {
  formatMinorMoney,
  parseMoneyInputToMinor,
} from '@/features/catalog/money-format'
import {
  walletQueryOptions,
  walletQueryKeys,
} from '@/features/wallet/wallet-queries'
import type { Wallet } from '@/features/wallet/wallet-api'
import { ApiError } from '@/lib/api/errors'
import { isAmbiguousCommissionTransferError } from './commission-transfer-errors'
import {
  getCommissionTransferAuthority,
  getCommissionTransferUncertaintyStatus,
  useCommissionTransferUncertaintyGuard,
} from './commission-transfer-guard'
import {
  commissionTransferMutationOptions,
  referralOverviewOptions,
  referralsQueryKeys,
  useReferralOverview,
} from './referrals-queries'

type TransferFeedbackKind =
  'success' | 'insufficient' | 'failed' | 'validation' | 'unknown'

interface TransferFeedback {
  kind: TransferFeedbackKind
  reconciled: boolean | null
}

interface ConfirmedTransfer {
  amountMinor: number
  formattedAmount: string
  formattedAvailableCommission: string
  formattedWalletBalance: string
  currency: string
  currencySymbol: string
}

export function CommissionTransferControl({
  accessToken,
}: {
  accessToken: string
}) {
  const queryClient = useQueryClient()
  const transferLock = useSynchronousActionLock()
  const sessionInvalidatedRef = useRef(false)
  const overview = useReferralOverview(accessToken)
  const wallet = useQuery({
    ...walletQueryOptions(accessToken),
    refetchOnMount: 'always',
  })
  const config = useQuery({
    ...accountConfigQueryOptions(accessToken),
    refetchOnMount: 'always',
  })
  const mutation = useMutation(commissionTransferMutationOptions(accessToken))
  const uncertainty = useCommissionTransferUncertaintyGuard()
  const [amountText, setAmountText] = useState('')
  const [amountError, setAmountError] = useState<string | null>(null)
  const [confirmedTransfer, setConfirmedTransfer] =
    useState<ConfirmedTransfer | null>(null)
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [actionPending, setActionPending] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [feedback, setFeedback] = useState<TransferFeedback | null>(null)
  const [keepAcknowledgementVisible, setKeepAcknowledgementVisible] =
    useState(false)
  const [safetyStorageError, setSafetyStorageError] = useState<string | null>(
    null,
  )
  const [sessionError, setSessionError] = useState<unknown>(null)

  const invalidSessionError = [
    overview.error,
    wallet.error,
    config.error,
    mutation.error,
    sessionError,
  ].find(isInvalidSessionError)
  useExitOnInvalidSessionError(invalidSessionError)

  if (invalidSessionError) return null

  const configSupported = config.data
    ? formatMinorMoney(0, config.data) !== null
    : false
  const overviewAuthorityReady = overview.isSuccess && !overview.isFetching
  const walletAuthorityReady = wallet.isSuccess && !wallet.isFetching
  const configAuthorityReady =
    config.isSuccess && !config.isFetching && configSupported
  const financialReadsReady = overviewAuthorityReady && walletAuthorityReady
  const financialAuthorityReady = financialReadsReady && configAuthorityReady
  const safetyStateReady = uncertainty.hydrated && uncertainty.storageAvailable
  const transferAuthorityReady = financialAuthorityReady && safetyStateReady
  const recoveryFailed = feedback?.reconciled === false
  const unknownGuardActive = uncertainty.status === 'active'
  const unknownAcknowledged = uncertainty.status === 'acknowledged'
  const showUnknownAcknowledgement =
    transferAuthorityReady &&
    (keepAcknowledgementVisible ||
      feedback?.kind === 'unknown' ||
      unknownGuardActive)
  const noAvailableCommission =
    overviewAuthorityReady && overview.data.stats.availableCommissionMinor === 0
  const transferDisabled =
    !transferAuthorityReady ||
    noAvailableCommission ||
    actionPending ||
    mutation.isPending ||
    recovering ||
    recoveryFailed ||
    Boolean(safetyStorageError) ||
    unknownGuardActive

  const formattedAvailableCommission =
    overview.data && config.data
      ? formatMinorMoney(
          overview.data.stats.availableCommissionMinor,
          config.data,
        )
      : null
  const formattedWalletBalance =
    wallet.data && config.data
      ? formatMinorMoney(wallet.data.balanceMinor, config.data)
      : null

  const refreshFinancialState = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: referralsQueryKeys.overview,
        exact: true,
        refetchType: 'none',
      }),
      queryClient.invalidateQueries({
        queryKey: walletQueryKeys.wallet,
        exact: true,
        refetchType: 'none',
      }),
    ])
    const results = await Promise.allSettled([
      queryClient.fetchQuery({
        ...referralOverviewOptions(accessToken),
        retry: false,
        staleTime: 0,
      }),
      queryClient.fetchQuery({
        ...walletQueryOptions(accessToken),
        retry: false,
        staleTime: 0,
      }),
    ])
    const authError = results.find(
      (result) =>
        result.status === 'rejected' && isInvalidSessionError(result.reason),
    )
    if (authError?.status === 'rejected') {
      sessionInvalidatedRef.current = true
      setSessionError(authError.reason)
      return false
    }
    return results.every((result) => result.status === 'fulfilled')
  }

  const openConfirmation = () => {
    if (transferDisabled) return
    const authority = getCommissionTransferAuthority(queryClient)
    if (
      !authority ||
      getCommissionTransferUncertaintyStatus(queryClient) === 'active'
    ) {
      setAmountError('当前资金状态正在更新，请完成重新读取后再确认。')
      return
    }
    const amountMinor = parseMoneyInputToMinor(
      amountText,
      authority.accountConfig.currency,
    )
    if (amountMinor === null) {
      setAmountError(
        `请输入大于零且符合 ${authority.accountConfig.currency} 小数位规则的金额。`,
      )
      return
    }
    if (amountMinor > authority.overview.stats.availableCommissionMinor) {
      setAmountError('划转金额不能超过当前可用佣金。')
      return
    }
    const formattedAmount = formatMinorMoney(
      amountMinor,
      authority.accountConfig,
    )
    const available = formatMinorMoney(
      authority.overview.stats.availableCommissionMinor,
      authority.accountConfig,
    )
    const balance = formatMinorMoney(
      authority.wallet.balanceMinor,
      authority.accountConfig,
    )
    if (!formattedAmount || !available || !balance) {
      setAmountError('当前金额无法安全确认，请重新读取结算币种。')
      return
    }
    setAmountError(null)
    setConfirmedTransfer({
      amountMinor,
      formattedAmount,
      formattedAvailableCommission: available,
      formattedWalletBalance: balance,
      currency: authority.accountConfig.currency,
      currencySymbol: authority.accountConfig.currencySymbol,
    })
    setConfirmationOpen(true)
  }

  const rejectStaleConfirmation = (message: string, clearInput = false) => {
    setConfirmationOpen(false)
    setConfirmedTransfer(null)
    if (clearInput) setAmountText('')
    setAmountError(message)
    transferLock.release()
  }

  const transferCommission = async () => {
    if (!confirmedTransfer || !transferLock.tryAcquire()) return

    const authority = getCommissionTransferAuthority(queryClient)
    if (
      !authority ||
      !uncertainty.hydrated ||
      !uncertainty.storageAvailable ||
      getCommissionTransferUncertaintyStatus(queryClient) === 'active'
    ) {
      rejectStaleConfirmation(
        '当前资金状态已变化，请完成重新读取后重新确认金额。',
      )
      return
    }
    if (
      authority.accountConfig.currency !== confirmedTransfer.currency ||
      authority.accountConfig.currencySymbol !==
        confirmedTransfer.currencySymbol
    ) {
      rejectStaleConfirmation(
        '结算币种已变化，请重新输入金额并再次确认。',
        true,
      )
      return
    }
    if (
      confirmedTransfer.amountMinor >
      authority.overview.stats.availableCommissionMinor
    ) {
      rejectStaleConfirmation('当前可用佣金已变化，请调整划转金额并重新确认。')
      return
    }

    if (!uncertainty.preArm()) {
      setSafetyStorageError(
        '当前无法建立资金操作安全状态，请稍后重试或检查浏览器存储设置。',
      )
      setConfirmationOpen(false)
      setConfirmedTransfer(null)
      transferLock.release()
      return
    }

    setSafetyStorageError(null)
    setKeepAcknowledgementVisible(false)
    sessionInvalidatedRef.current = false
    setActionPending(true)
    setFeedback(null)
    mutation.reset()
    const request = mutation.mutateAsync(confirmedTransfer.amountMinor)
    try {
      await request
      uncertainty.clear()
      setConfirmationOpen(false)
      setConfirmedTransfer(null)
      setAmountText('')
      setFeedback({ kind: 'success', reconciled: null })
      const reconciled = await refreshFinancialState()
      if (!sessionInvalidatedRef.current) {
        setFeedback({ kind: 'success', reconciled })
      }
    } catch (error) {
      if (isInvalidSessionError(error)) {
        sessionInvalidatedRef.current = true
        setSessionError(error)
        return
      }

      setConfirmationOpen(false)
      setConfirmedTransfer(null)
      if (isAmbiguousCommissionTransferError(error)) {
        uncertainty.retainActive()
        setKeepAcknowledgementVisible(true)
        setAmountText('')
        setAmountError(null)
        setFeedback({ kind: 'unknown', reconciled: null })
        const reconciled = await refreshFinancialState()
        if (!sessionInvalidatedRef.current) {
          setFeedback({ kind: 'unknown', reconciled })
        }
      } else {
        uncertainty.clear()
        const kind: TransferFeedbackKind =
          error instanceof ApiError &&
          error.code === 'INSUFFICIENT_COMMISSION_BALANCE'
            ? 'insufficient'
            : error instanceof ApiError && error.code === 'VALIDATION_ERROR'
              ? 'validation'
              : 'failed'
        setFeedback({ kind, reconciled: null })
        const reconciled = await refreshFinancialState()
        if (!sessionInvalidatedRef.current) {
          setFeedback({ kind, reconciled })
        }
      }
    } finally {
      setActionPending(false)
      transferLock.release()
    }
  }

  const manualRecovery = async () => {
    if (
      recovering ||
      (!recoveryFailed && !(unknownGuardActive && !financialReadsReady))
    ) {
      return
    }
    sessionInvalidatedRef.current = false
    setRecovering(true)
    const reconciled = await refreshFinancialState()
    if (sessionInvalidatedRef.current) return
    setRecovering(false)
    if (reconciled && feedback) {
      setFeedback({ ...feedback, reconciled: true })
    }
  }

  const retrySafetyStorage = () => {
    if (uncertainty.retryHydration()) setSafetyStorageError(null)
  }

  return (
    <section
      className="border-t border-border py-8"
      aria-labelledby="commission-transfer-title"
    >
      <h3 id="commission-transfer-title" className="text-base font-semibold">
        佣金划转
      </h3>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        将可用佣金划转到当前账户余额。最终资金状态以服务端重新读取结果为准。
      </p>

      <div className="mt-5 max-w-2xl space-y-5">
        {!uncertainty.hydrated ? (
          <p className="text-sm text-muted-foreground" role="status">
            正在检查资金操作安全状态…
          </p>
        ) : !uncertainty.storageAvailable || safetyStorageError ? (
          <div className="space-y-3" role="alert">
            <p className="text-sm text-destructive">
              {safetyStorageError ??
                '当前无法读取资金操作安全状态，佣金划转已停用。'}
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

        <FinancialAuthorityState
          overview={overview}
          wallet={wallet}
          config={config}
          configSupported={configSupported}
        />

        <dl className="grid grid-cols-1 gap-x-8 border-y border-border sm:grid-cols-2">
          <FinancialValue
            label="当前可用佣金"
            value={formattedAvailableCommission}
          />
          <FinancialValue label="当前账户余额" value={formattedWalletBalance} />
        </dl>

        {feedback ? (
          <TransferFeedbackMessage feedback={feedback} />
        ) : unknownGuardActive ? (
          <PersistedUnknownFeedback authorityReady={transferAuthorityReady} />
        ) : null}

        {recoveryFailed || (unknownGuardActive && !financialReadsReady) ? (
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
            {recovering ? '正在重新读取…' : '重新读取佣金和账户余额'}
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
                setKeepAcknowledgementVisible(true)
                const persisted = event.target.checked
                  ? uncertainty.acknowledge()
                  : uncertainty.activate()
                if (!persisted) {
                  setSafetyStorageError(
                    '当前无法更新资金操作安全状态，请稍后重试或检查浏览器存储设置。',
                  )
                } else {
                  setSafetyStorageError(null)
                }
              }}
            />
            <span>我已核对当前可用佣金和账户余额，仍需再次提交佣金划转。</span>
          </label>
        ) : null}

        <div className="space-y-2">
          <label
            className="text-sm font-medium"
            htmlFor="commission-transfer-amount"
          >
            划转金额
          </label>
          <div className="flex min-w-0 items-center gap-3">
            <span className="shrink-0 text-sm font-medium" aria-hidden="true">
              {configSupported ? config.data?.currencySymbol : '—'}
            </span>
            <Input
              id="commission-transfer-amount"
              className="min-w-0 tabular-nums"
              inputMode="decimal"
              autoComplete="off"
              maxLength={32}
              placeholder="例如 100"
              value={amountText}
              disabled={transferDisabled}
              aria-invalid={Boolean(amountError)}
              aria-describedby={
                amountError
                  ? 'commission-transfer-help commission-transfer-error'
                  : 'commission-transfer-help'
              }
              onChange={(event) => {
                setAmountText(event.target.value)
                setAmountError(null)
                if (feedback?.kind !== 'unknown') setFeedback(null)
                mutation.reset()
              }}
            />
            <span className="shrink-0 text-sm text-muted-foreground">
              {configSupported ? config.data?.currency : '币种不可用'}
            </span>
          </div>
          <p
            id="commission-transfer-help"
            className="text-xs leading-5 text-muted-foreground"
          >
            请输入明确金额；服务端仍会最终确认当前可用佣金。
          </p>
          {amountError ? (
            <p
              id="commission-transfer-error"
              className="text-sm text-destructive"
              role="alert"
            >
              {amountError}
            </p>
          ) : null}
          {noAvailableCommission ? (
            <p className="text-sm text-muted-foreground">
              当前没有可用于划转的佣金。
            </p>
          ) : null}
        </div>

        <Button
          id="commission-transfer-trigger"
          type="button"
          disabled={transferDisabled}
          onClick={openConfirmation}
        >
          佣金划转
        </Button>
      </div>

      <Dialog
        open={confirmationOpen}
        onOpenChange={(open) => {
          if (open) setConfirmationOpen(true)
          else if (!actionPending) setConfirmationOpen(false)
        }}
      >
        <DialogContent
          className="max-w-lg"
          closeLabel="关闭佣金划转确认"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            document.getElementById('commission-transfer-trigger')?.focus()
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
              确认佣金划转
            </DialogTitle>
            <DialogDescription className="mt-3 text-sm leading-6 text-muted-foreground">
              将提交真实佣金划转操作。请确认金额，避免重复提交。
            </DialogDescription>
            <dl className="mt-5 space-y-3 border-y border-border py-4 text-sm">
              <ConfirmationValue
                label="划转金额"
                value={confirmedTransfer?.formattedAmount}
                emphasize
              />
              <ConfirmationValue
                label="当前可用佣金"
                value={confirmedTransfer?.formattedAvailableCommission}
              />
              <ConfirmationValue
                label="当前账户余额"
                value={confirmedTransfer?.formattedWalletBalance}
              />
            </dl>
            {!transferAuthorityReady ? (
              <p
                className="mt-5 text-sm leading-6 text-muted-foreground"
                role="status"
              >
                当前资金状态正在重新读取，成功后需要重新确认金额。
              </p>
            ) : null}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={actionPending}
                onClick={() => setConfirmationOpen(false)}
              >
                取消
              </Button>
              <Button
                type="button"
                disabled={
                  !confirmedTransfer ||
                  !transferAuthorityReady ||
                  actionPending ||
                  unknownGuardActive
                }
                onClick={() => void transferCommission()}
              >
                {actionPending ? (
                  <LoaderCircle
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                {actionPending ? '正在划转…' : '确认划转'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function FinancialAuthorityState({
  overview,
  wallet,
  config,
  configSupported,
}: {
  overview: ReturnType<typeof useReferralOverview>
  wallet: UseQueryResult<Wallet>
  config: UseQueryResult<AccountConfig>
  configSupported: boolean
}) {
  if (overview.isError) {
    return (
      <ReadError
        message="暂时无法读取当前可用佣金，不能进行佣金划转。"
        error={overview.error}
        retry={() => void overview.refetch()}
      />
    )
  }
  if (wallet.isError) {
    return (
      <ReadError
        message="暂时无法读取当前账户余额，不能进行佣金划转。"
        error={wallet.error}
        retry={() => void wallet.refetch()}
      />
    )
  }
  if (config.isError) {
    return (
      <ReadError
        message="暂时无法读取结算币种，不能安全确认划转金额。"
        error={config.error}
        retry={() => void config.refetch()}
      />
    )
  }
  if (overview.isPending || wallet.isPending || config.isPending) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        正在读取佣金、账户余额和结算币种…
      </p>
    )
  }
  if (overview.isFetching || wallet.isFetching || config.isFetching) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        正在重新读取最新资金状态…
      </p>
    )
  }
  if (!configSupported) {
    return (
      <p className="text-sm text-destructive" role="alert">
        当前结算币种无法安全处理，佣金划转已停用。
      </p>
    )
  }
  return null
}

function FinancialValue({
  label,
  value,
}: {
  label: string
  value: string | null
}) {
  return (
    <div className="min-w-0 py-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-2 min-w-0 break-words text-lg font-semibold tabular-nums [overflow-wrap:anywhere]">
        {value ?? '暂无法安全格式化'}
      </dd>
    </div>
  )
}

function ConfirmationValue({
  label,
  value,
  emphasize = false,
}: {
  label: string
  value: string | undefined
  emphasize?: boolean
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={`min-w-0 break-words text-right tabular-nums [overflow-wrap:anywhere] ${emphasize ? 'font-semibold' : ''}`}
      >
        {value ?? '无法安全格式化'}
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
      <p className="text-sm font-semibold">佣金划转结果暂时无法确认。</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {authorityReady
          ? '已重新读取当前可用佣金和账户余额。请先核对资金状态，避免重复划转。'
          : '请先重新读取当前可用佣金和账户余额，暂时不要再次划转。'}
      </p>
    </div>
  )
}

function TransferFeedbackMessage({ feedback }: { feedback: TransferFeedback }) {
  const recovering = feedback.reconciled === null
  const recoveryFailed = feedback.reconciled === false

  if (feedback.kind === 'success') {
    return (
      <div
        className="border-l-2 border-primary bg-primary/5 px-4 py-3"
        role="status"
      >
        <p className="text-sm font-semibold">佣金划转已确认。</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {recovering
            ? '正在重新读取当前可用佣金和账户余额…'
            : recoveryFailed
              ? '佣金划转已确认，但暂时无法完整读取最新资金状态。'
              : '已重新读取当前可用佣金和账户余额。'}
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
        <p className="text-sm font-semibold">佣金划转结果暂时无法确认。</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {recovering
            ? '正在重新读取当前可用佣金和账户余额…'
            : recoveryFailed
              ? '当前资金状态暂时无法完整读取。请先恢复读取，暂时不要再次划转。'
              : '已重新读取当前可用佣金和账户余额。请先核对资金状态，避免重复划转。'}
        </p>
      </div>
    )
  }

  const title =
    feedback.kind === 'insufficient'
      ? '当前可用佣金不足，请重新读取最新佣金后调整划转金额。'
      : feedback.kind === 'validation'
        ? '当前划转请求无效，请调整金额后重新确认。'
        : '佣金划转未能完成，请重新读取当前资金状态后再试。'

  return (
    <div
      className="border-l-2 border-foreground/40 bg-muted px-4 py-3"
      role="alert"
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {recovering
          ? '正在重新读取当前可用佣金和账户余额…'
          : recoveryFailed
            ? '当前资金状态暂时无法完整读取。恢复读取前不能再次划转。'
            : '已重新读取当前可用佣金和账户余额。再次提交前需要重新确认金额。'}
      </p>
    </div>
  )
}
