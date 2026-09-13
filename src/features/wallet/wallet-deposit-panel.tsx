import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { LoaderCircle } from 'lucide-react'
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
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { useExitOnInvalidSessionError } from '@/features/auth/use-exit-on-invalid-session-error'
import {
  formatMinorMoney,
  parseMoneyInputToMinor,
} from '@/features/catalog/money-format'
import { isAmbiguousCommerceMutationError } from '@/features/orders/commerce-errors'
import {
  ordersListOptions,
  ordersQueryKeys,
} from '@/features/orders/orders-queries'
import { ApiError } from '@/lib/api/errors'
import { walletDepositMutationOptions } from './wallet-queries'
import type { WalletMutationCoordinator } from './wallet-mutation-coordinator'

type DepositFeedback =
  | { kind: 'unavailable'; ordersRefreshed: boolean }
  | { kind: 'amount-invalid' }
  | { kind: 'create-failed'; ordersRefreshed: boolean }
  | { kind: 'unknown'; ordersRefreshed: boolean }

interface ConfirmedAmount {
  amountMinor: number
  formatted: string
}

export function WalletDepositPanel({
  accessToken,
  accountConfig,
  configError,
  configPending,
  mutationCoordinator,
  retryConfig,
}: {
  accessToken: string
  accountConfig: AccountConfig | null
  configError: unknown
  configPending: boolean
  mutationCoordinator: WalletMutationCoordinator
  retryConfig: () => void
}) {
  const queryClient = useQueryClient()
  const sessionInvalidatedRef = useRef(false)
  const [amountText, setAmountText] = useState('')
  const [amountError, setAmountError] = useState<string | null>(null)
  const [confirmedAmount, setConfirmedAmount] =
    useState<ConfirmedAmount | null>(null)
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [actionPending, setActionPending] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [feedback, setFeedback] = useState<DepositFeedback | null>(null)
  const [createdOrder, setCreatedOrder] = useState<{
    id: string
    ordersRefreshed: boolean
  } | null>(null)
  const [unknownAcknowledged, setUnknownAcknowledged] = useState(false)
  const [sessionError, setSessionError] = useState<unknown>(null)
  const mutation = useMutation(walletDepositMutationOptions(accessToken))

  const invalidSessionError = isInvalidSessionError(mutation.error)
    ? mutation.error
    : isInvalidSessionError(sessionError)
      ? sessionError
      : null
  useExitOnInvalidSessionError(invalidSessionError)

  if (invalidSessionError) return null

  const refreshOrders = async () => {
    await queryClient.invalidateQueries({
      queryKey: ordersQueryKeys.list,
      refetchType: 'none',
    })
    try {
      await queryClient.fetchQuery({
        ...ordersListOptions(accessToken),
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

  const requiresUnknownAcknowledgement = feedback?.kind === 'unknown'
  const unknownRecoveryFailed =
    feedback?.kind === 'unknown' && !feedback.ordersRefreshed

  const openConfirmation = () => {
    if (
      !accountConfig ||
      actionPending ||
      mutationCoordinator.activeAction !== null ||
      unknownRecoveryFailed ||
      (requiresUnknownAcknowledgement && !unknownAcknowledged)
    ) {
      return
    }
    const amountMinor = parseMoneyInputToMinor(
      amountText,
      accountConfig.currency,
    )
    if (amountMinor === null) {
      setAmountError(
        `请输入大于零且符合 ${accountConfig.currency} 小数位规则的金额。`,
      )
      return
    }
    const formatted = formatMinorMoney(amountMinor, accountConfig)
    if (!formatted) {
      setAmountError('当前金额无法安全确认，请重新读取结算币种。')
      return
    }
    setAmountError(null)
    setConfirmedAmount({ amountMinor, formatted })
    setConfirmationOpen(true)
  }

  const createDeposit = async () => {
    if (!confirmedAmount || !mutationCoordinator.tryAcquire('deposit-create'))
      return
    sessionInvalidatedRef.current = false
    setActionPending(true)
    setFeedback(null)
    mutation.reset()
    try {
      const result = await mutation.mutateAsync(confirmedAmount.amountMinor)
      const ordersRefreshed = await refreshOrders()
      setUnknownAcknowledged(false)
      setCreatedOrder({ id: result.id, ordersRefreshed })
    } catch (error) {
      if (isInvalidSessionError(error)) {
        sessionInvalidatedRef.current = true
        setSessionError(error)
        return
      }
      setUnknownAcknowledged(false)
      if (
        error instanceof ApiError &&
        error.code === 'WALLET_DEPOSIT_UNAVAILABLE'
      ) {
        setFeedback({
          kind: 'unavailable',
          ordersRefreshed: await refreshOrders(),
        })
      } else if (
        error instanceof ApiError &&
        error.code === 'WALLET_DEPOSIT_AMOUNT_INVALID'
      ) {
        setFeedback({ kind: 'amount-invalid' })
      } else if (
        error instanceof ApiError &&
        error.code === 'WALLET_DEPOSIT_CREATE_FAILED'
      ) {
        setFeedback({
          kind: 'create-failed',
          ordersRefreshed: await refreshOrders(),
        })
      } else if (isAmbiguousCommerceMutationError(error)) {
        setFeedback({
          kind: 'unknown',
          ordersRefreshed: await refreshOrders(),
        })
      } else {
        setFeedback({
          kind: 'create-failed',
          ordersRefreshed: await refreshOrders(),
        })
      }
    } finally {
      setConfirmationOpen(false)
      setConfirmedAmount(null)
      setActionPending(false)
      if (sessionInvalidatedRef.current) {
        mutationCoordinator.releaseAfterSessionInvalidation()
      } else {
        mutationCoordinator.release()
      }
    }
  }

  const recoverOrders = async () => {
    if (feedback?.kind !== 'unknown' || feedback.ordersRefreshed) return
    setRecovering(true)
    const ordersRefreshed = await refreshOrders()
    if (sessionInvalidatedRef.current) return
    setRecovering(false)
    if (ordersRefreshed) {
      setFeedback({ kind: 'unknown', ordersRefreshed: true })
    }
  }

  return (
    <section
      className="border-t border-border py-8"
      aria-labelledby="wallet-deposit-title"
    >
      <h3 id="wallet-deposit-title" className="text-base font-semibold">
        充值余额
      </h3>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        创建充值订单后仍需完成支付，订单创建成功不代表余额已经到账。
      </p>

      {createdOrder ? (
        <div className="mt-5 space-y-4" role="status">
          <div className="border-l-2 border-primary bg-primary/5 px-4 py-3">
            <p className="text-sm font-semibold">充值订单已创建</p>
            <p className="mt-2 break-all font-mono text-sm">
              订单编号：{createdOrder.id}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              完成支付后，余额才会按服务端状态更新。订单创建不会立即改变余额。
              {!createdOrder.ordersRefreshed
                ? ' 订单列表暂时无法重新读取，请在订单页面手动检查。'
                : ''}
            </p>
          </div>
          <Button asChild>
            <Link to="/orders">前往订单支付</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-5 max-w-xl space-y-4">
          {configPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              正在读取结算币种…
            </p>
          ) : configError ? (
            <ReadError
              message="暂时无法读取结算币种，不能安全创建充值订单。"
              error={configError}
              retry={retryConfig}
            />
          ) : null}

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="deposit-amount">
              充值金额
            </label>
            <div className="flex min-w-0 items-center gap-3">
              <span className="shrink-0 text-sm font-medium" aria-hidden="true">
                {accountConfig?.currencySymbol ?? '—'}
              </span>
              <Input
                id="deposit-amount"
                className="min-w-0 tabular-nums"
                inputMode="decimal"
                autoComplete="off"
                maxLength={32}
                placeholder="例如 100"
                value={amountText}
                disabled={
                  !accountConfig ||
                  actionPending ||
                  mutationCoordinator.activeAction !== null
                }
                aria-invalid={Boolean(amountError)}
                aria-describedby={
                  amountError
                    ? 'deposit-amount-help deposit-amount-error'
                    : 'deposit-amount-help'
                }
                onChange={(event) => {
                  setAmountText(event.target.value)
                  setAmountError(null)
                  if (feedback?.kind !== 'unknown') setFeedback(null)
                  mutation.reset()
                }}
              />
              <span className="shrink-0 text-sm text-muted-foreground">
                {accountConfig?.currency ?? '币种未知'}
              </span>
            </div>
            <p
              id="deposit-amount-help"
              className="text-xs leading-5 text-muted-foreground"
            >
              仅创建充值订单；具体金额是否可用由服务端最终确认。
            </p>
            {amountError ? (
              <p id="deposit-amount-error" className="text-sm text-destructive">
                {amountError}
              </p>
            ) : null}
          </div>

          {feedback ? <DepositFeedbackMessage feedback={feedback} /> : null}

          {unknownRecoveryFailed ? (
            <Button
              type="button"
              variant="outline"
              disabled={recovering}
              onClick={() => void recoverOrders()}
            >
              {recovering ? (
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              {recovering ? '正在重新读取…' : '重新读取订单'}
            </Button>
          ) : null}

          {requiresUnknownAcknowledgement && !unknownRecoveryFailed ? (
            <label className="flex items-start gap-3 text-sm leading-6">
              <input
                type="checkbox"
                className="mt-1 size-4 shrink-0 accent-primary"
                checked={unknownAcknowledged}
                disabled={actionPending}
                onChange={(event) =>
                  setUnknownAcknowledged(event.target.checked)
                }
              />
              <span>我已检查当前订单列表，确认仍需重新创建充值订单。</span>
            </label>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button
              id="wallet-deposit-create"
              type="button"
              disabled={
                !accountConfig ||
                actionPending ||
                mutationCoordinator.activeAction !== null ||
                unknownRecoveryFailed ||
                (requiresUnknownAcknowledgement && !unknownAcknowledged)
              }
              onClick={openConfirmation}
            >
              创建充值订单
            </Button>
            {feedback?.kind === 'unavailable' ||
            feedback?.kind === 'create-failed' ||
            feedback?.kind === 'unknown' ? (
              <Button asChild variant="outline">
                <Link to="/orders">前往订单检查</Link>
              </Button>
            ) : null}
          </div>
        </div>
      )}

      <Dialog
        open={confirmationOpen}
        onOpenChange={(open) => {
          if (open) setConfirmationOpen(true)
          else if (!actionPending) setConfirmationOpen(false)
        }}
      >
        <DialogContent
          className="max-w-lg"
          closeLabel="关闭充值订单确认"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            document.getElementById('wallet-deposit-create')?.focus()
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
              确认创建充值订单
            </DialogTitle>
            <DialogDescription className="mt-3 text-sm leading-6 text-muted-foreground">
              确认后将创建一张充值订单。订单创建后仍需完成支付，当前余额不会立即变化。
            </DialogDescription>
            <dl className="mt-5 border-y border-border py-4 text-sm">
              <div className="flex min-w-0 items-start justify-between gap-4">
                <dt className="text-muted-foreground">充值金额</dt>
                <dd className="min-w-0 break-all text-right font-semibold tabular-nums">
                  {confirmedAmount?.formatted ?? '无法安全格式化'}
                </dd>
              </div>
            </dl>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={actionPending}
                onClick={() => setConfirmationOpen(false)}
              >
                返回
              </Button>
              <Button
                type="button"
                disabled={
                  !confirmedAmount ||
                  actionPending ||
                  (mutationCoordinator.activeAction !== null &&
                    mutationCoordinator.activeAction !== 'deposit-create')
                }
                onClick={() => void createDeposit()}
              >
                {actionPending ? (
                  <LoaderCircle
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                {actionPending ? '正在创建…' : '确认创建充值订单'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function DepositFeedbackMessage({ feedback }: { feedback: DepositFeedback }) {
  if (feedback.kind === 'amount-invalid') {
    return (
      <div
        className="border-l-2 border-destructive bg-destructive/5 px-4 py-3"
        role="alert"
      >
        <p className="text-sm">该充值金额当前不可用，请调整金额后重试。</p>
      </div>
    )
  }

  if (feedback.kind === 'unknown') {
    return (
      <div
        className="border-l-2 border-foreground/40 bg-muted px-4 py-3"
        role="alert"
      >
        <p className="text-sm font-semibold">充值订单创建结果暂时无法确认。</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {feedback.ordersRefreshed
            ? '已重新读取当前订单。请先检查订单列表，避免重复创建。'
            : '当前订单暂时无法重新读取。请先重新读取订单，暂时不要再次创建充值订单。'}
        </p>
      </div>
    )
  }

  if (feedback.kind === 'unavailable') {
    return (
      <div
        className="border-l-2 border-foreground/40 bg-muted px-4 py-3"
        role="alert"
      >
        <p className="text-sm">
          当前已有待支付或处理中的订单，暂时不能创建新的充值订单。
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {feedback.ordersRefreshed
            ? '已重新读取当前订单，请前往订单页面检查。'
            : '订单列表暂时无法重新读取，请前往订单页面手动检查。'}
        </p>
      </div>
    )
  }

  return (
    <div
      className="border-l-2 border-destructive bg-destructive/5 px-4 py-3"
      role="alert"
    >
      <p className="text-sm">充值订单未能创建，请重新确认后再试。</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {feedback.ordersRefreshed
          ? '已重新读取当前订单。'
          : '订单列表暂时无法重新读取，请前往订单页面手动检查。'}
      </p>
    </div>
  )
}
