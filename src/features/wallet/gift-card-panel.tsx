import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, Gift, LoaderCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { AccountConfig } from '@/features/account/account-api'
import { authQueryKeys } from '@/features/auth/auth-query-keys'
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { useExitOnInvalidSessionError } from '@/features/auth/use-exit-on-invalid-session-error'
import { formatSignedMinorMoney } from '@/features/catalog/money-format'
import {
  subscriptionOverviewQueryOptions,
  subscriptionQueryKeys,
} from '@/features/subscription/subscription-queries'
import type { GiftCardEffect } from './gift-card-api'
import {
  getGiftCardErrorMessage,
  isAmbiguousGiftCardError,
} from './gift-card-errors'
import {
  giftCardMutationKeys,
  giftCardRedeemMutationOptions,
} from './gift-card-queries'
import type { WalletMutationCoordinator } from './wallet-mutation-coordinator'
import { walletQueryKeys, walletQueryOptions } from './wallet-queries'

type GiftCardFeedback =
  | {
      kind: 'success'
      effect: GiftCardEffect
      reconciled: boolean | null
    }
  | { kind: 'unknown'; reconciled: boolean | null }
  | { kind: 'error'; message: string }

function maskGiftCardCode(code: string) {
  if (code.length <= 8) return '•'.repeat(Math.max(code.length, 4))
  return `${code.slice(0, 2)}••••••${code.slice(-2)}`
}

export function GiftCardPanel({
  accessToken,
  accountConfig,
  mutationCoordinator,
}: {
  accessToken: string
  accountConfig: AccountConfig | null
  mutationCoordinator: WalletMutationCoordinator
}) {
  const queryClient = useQueryClient()
  const sessionInvalidatedRef = useRef(false)
  const [code, setCode] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [confirmationCode, setConfirmationCode] = useState<string | null>(null)
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [confirmationAcknowledged, setConfirmationAcknowledged] =
    useState(false)
  const [unknownAcknowledged, setUnknownAcknowledged] = useState(false)
  const [actionPending, setActionPending] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [feedback, setFeedback] = useState<GiftCardFeedback | null>(null)
  const [sessionError, setSessionError] = useState<unknown>(null)
  const mutation = useMutation(giftCardRedeemMutationOptions(accessToken))

  const invalidSessionError = isInvalidSessionError(sessionError)
    ? sessionError
    : null
  useExitOnInvalidSessionError(invalidSessionError)

  if (invalidSessionError) return null

  const reconcileAccount = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: walletQueryKeys.wallet,
        refetchType: 'none',
      }),
      queryClient.invalidateQueries({
        queryKey: subscriptionQueryKeys.overview,
        refetchType: 'none',
      }),
      queryClient.invalidateQueries({
        queryKey: subscriptionQueryKeys.deliveryOptions,
        refetchType: 'none',
      }),
    ])

    const reads = await Promise.allSettled([
      queryClient.fetchQuery({
        ...walletQueryOptions(accessToken),
        retry: false,
        staleTime: 0,
      }),
      queryClient.refetchQueries(
        { queryKey: authQueryKeys.me, exact: true, type: 'active' },
        { cancelRefetch: false, throwOnError: true },
      ),
      queryClient.fetchQuery({
        ...subscriptionOverviewQueryOptions(accessToken),
        retry: false,
        staleTime: 0,
      }),
    ])

    for (const read of reads) {
      if (read.status === 'rejected' && isInvalidSessionError(read.reason)) {
        sessionInvalidatedRef.current = true
        setSessionError(read.reason)
      }
    }
    return reads.every((read) => read.status === 'fulfilled')
  }

  const recoveryIncomplete =
    (feedback?.kind === 'success' || feedback?.kind === 'unknown') &&
    feedback.reconciled === false
  const requiresUnknownAcknowledgement =
    feedback?.kind === 'unknown' && feedback.reconciled === true
  const walletActionBusy = mutationCoordinator.activeAction !== null

  const openConfirmation = () => {
    if (
      walletActionBusy ||
      recoveryIncomplete ||
      (requiresUnknownAcknowledgement && !unknownAcknowledged)
    ) {
      return
    }
    if (code.length < 1 || code.length > 255) {
      setFieldError('请输入 1 至 255 个字符的礼品卡兑换码。')
      return
    }
    setFieldError(null)
    setConfirmationCode(code)
    setConfirmationAcknowledged(false)
    setConfirmationOpen(true)
  }

  const redeem = async () => {
    if (
      !confirmationCode ||
      !confirmationAcknowledged ||
      !mutationCoordinator.tryAcquire('gift-card-redeem')
    ) {
      return
    }
    sessionInvalidatedRef.current = false
    setActionPending(true)
    setFeedback(null)
    mutation.reset()
    try {
      const result = await mutation.mutateAsync(confirmationCode)
      setCode('')
      setRevealed(false)
      setUnknownAcknowledged(false)
      setConfirmationOpen(false)
      setConfirmationCode(null)
      setConfirmationAcknowledged(false)
      setFeedback({ kind: 'success', effect: result.effect, reconciled: null })
      const reconciled = await reconcileAccount()
      setFeedback({ kind: 'success', effect: result.effect, reconciled })
    } catch (error) {
      setConfirmationOpen(false)
      setConfirmationCode(null)
      setConfirmationAcknowledged(false)
      setUnknownAcknowledged(false)
      if (isInvalidSessionError(error)) {
        sessionInvalidatedRef.current = true
        setSessionError(error)
        return
      }
      if (isAmbiguousGiftCardError(error)) {
        setFeedback({ kind: 'unknown', reconciled: null })
        const reconciled = await reconcileAccount()
        setFeedback({ kind: 'unknown', reconciled })
      } else {
        setFeedback({
          kind: 'error',
          message: getGiftCardErrorMessage(error),
        })
      }
    } finally {
      mutation.reset()
      const mutationCache = queryClient.getMutationCache()
      mutationCache
        .findAll({ mutationKey: giftCardMutationKeys.redeem })
        .forEach((entry) => mutationCache.remove(entry))
      setActionPending(false)
      if (sessionInvalidatedRef.current) {
        mutationCoordinator.releaseAfterSessionInvalidation()
      } else {
        mutationCoordinator.release()
      }
    }
  }

  const recoverAccount = async () => {
    if (!recoveryIncomplete) return
    const current = feedback
    setRecovering(true)
    const reconciled = await reconcileAccount()
    setRecovering(false)
    if (!reconciled || !current) return
    if (current.kind === 'success') {
      setFeedback({ ...current, reconciled: true })
    } else if (current.kind === 'unknown') {
      setFeedback({ kind: 'unknown', reconciled: true })
    }
  }

  return (
    <section
      className="border-t border-border py-8"
      aria-labelledby="gift-card-title"
    >
      <h3 id="gift-card-title" className="text-base font-semibold">
        兑换礼品卡
      </h3>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        礼品卡可能改变余额、订阅有效期、流量或套餐状态。
      </p>

      <div className="mt-5 max-w-xl space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="gift-card-code">
            礼品卡兑换码
          </label>
          <div className="flex min-w-0 gap-2">
            <Input
              id="gift-card-code"
              type={revealed ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              maxLength={256}
              value={code}
              disabled={walletActionBusy || recoveryIncomplete}
              aria-invalid={Boolean(fieldError)}
              aria-describedby={
                fieldError
                  ? 'gift-card-code-help gift-card-code-error'
                  : 'gift-card-code-help'
              }
              onChange={(event) => {
                setCode(event.target.value)
                setFieldError(null)
                if (feedback?.kind !== 'unknown') setFeedback(null)
                mutation.reset()
              }}
            />
            <Button
              id="gift-card-reveal"
              type="button"
              variant="outline"
              size="icon"
              disabled={walletActionBusy || recoveryIncomplete}
              aria-label={revealed ? '隐藏礼品卡兑换码' : '显示礼品卡兑换码'}
              onClick={() => setRevealed((current) => !current)}
            >
              {revealed ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </Button>
          </div>
          <p
            id="gift-card-code-help"
            className="text-xs leading-5 text-muted-foreground"
          >
            兑换码会按输入原样提交，不会自动修改大小写、空格或连字符。
          </p>
          {fieldError ? (
            <p id="gift-card-code-error" className="text-sm text-destructive">
              {fieldError}
            </p>
          ) : null}
        </div>

        {feedback ? (
          <GiftCardFeedbackMessage
            feedback={feedback}
            accountConfig={accountConfig}
          />
        ) : null}

        {recoveryIncomplete ? (
          <Button
            type="button"
            variant="outline"
            disabled={recovering || walletActionBusy}
            onClick={() => void recoverAccount()}
          >
            {recovering ? (
              <LoaderCircle
                className="size-4 animate-spin"
                aria-hidden="true"
              />
            ) : null}
            {recovering ? '正在重新读取…' : '重新读取账户状态'}
          </Button>
        ) : null}

        {requiresUnknownAcknowledgement ? (
          <label className="flex items-start gap-3 text-sm leading-6">
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0 accent-primary"
              checked={unknownAcknowledged}
              disabled={walletActionBusy}
              onChange={(event) => setUnknownAcknowledged(event.target.checked)}
            />
            <span>我已核对当前账户状态，仍需再次提交此礼品卡</span>
          </label>
        ) : null}

        <Button
          id="gift-card-redeem"
          type="button"
          disabled={
            walletActionBusy ||
            recoveryIncomplete ||
            (requiresUnknownAcknowledgement && !unknownAcknowledged)
          }
          onClick={openConfirmation}
        >
          <Gift className="size-4" aria-hidden="true" />
          兑换礼品卡
        </Button>
      </div>

      <Dialog
        open={confirmationOpen}
        onOpenChange={(open) => {
          if (open) setConfirmationOpen(true)
          else if (!actionPending) {
            setConfirmationOpen(false)
            setConfirmationCode(null)
            setConfirmationAcknowledged(false)
          }
        }}
      >
        <DialogContent
          className="max-w-lg"
          closeLabel="关闭礼品卡兑换确认"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            document.getElementById('gift-card-redeem')?.focus()
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
              确认兑换礼品卡
            </DialogTitle>
            <DialogDescription className="mt-3 text-sm leading-6 text-muted-foreground">
              兑换后可能改变余额、订阅有效期、流量或套餐状态。兑换结果由服务端决定，操作不可撤销。
            </DialogDescription>
            <dl className="mt-5 border-y border-border py-4 text-sm">
              <div className="flex min-w-0 items-start justify-between gap-4">
                <dt className="shrink-0 text-muted-foreground">礼品卡</dt>
                <dd className="min-w-0 break-all text-right font-mono font-medium">
                  {confirmationCode
                    ? maskGiftCardCode(confirmationCode)
                    : '已隐藏'}
                </dd>
              </div>
            </dl>
            <label className="mt-5 flex cursor-pointer items-start gap-3 border-l-2 border-foreground/40 bg-muted px-4 py-3 text-sm leading-6">
              <input
                type="checkbox"
                className="mt-1 size-4 shrink-0 accent-primary"
                checked={confirmationAcknowledged}
                disabled={actionPending}
                onChange={(event) =>
                  setConfirmationAcknowledged(event.target.checked)
                }
              />
              <span>我确认兑换此礼品卡，并理解账户状态可能立即发生变化</span>
            </label>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={actionPending}
                onClick={() => {
                  setConfirmationOpen(false)
                  setConfirmationCode(null)
                  setConfirmationAcknowledged(false)
                }}
              >
                返回
              </Button>
              <Button
                type="button"
                disabled={
                  !confirmationCode ||
                  !confirmationAcknowledged ||
                  actionPending ||
                  (mutationCoordinator.activeAction !== null &&
                    mutationCoordinator.activeAction !== 'gift-card-redeem')
                }
                onClick={() => void redeem()}
              >
                {actionPending ? (
                  <LoaderCircle
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                {actionPending ? '正在兑换…' : '确认兑换礼品卡'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function GiftCardFeedbackMessage({
  accountConfig,
  feedback,
}: {
  accountConfig: AccountConfig | null
  feedback: GiftCardFeedback
}) {
  if (feedback.kind === 'error') {
    return (
      <div
        className="border-l-2 border-destructive bg-destructive/5 px-4 py-3"
        role="alert"
      >
        <p className="text-sm">{feedback.message}</p>
      </div>
    )
  }

  if (feedback.kind === 'unknown') {
    return (
      <div
        className="border-l-2 border-foreground/40 bg-muted px-4 py-3"
        role="alert"
      >
        <p className="text-sm font-semibold">兑换结果暂时无法确认。</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {feedback.reconciled === null
            ? '正在重新读取当前账户状态，请勿重复兑换。'
            : feedback.reconciled
              ? '已重新读取当前账户状态。请核对账户状态，避免重复兑换。'
              : '暂时无法完整读取当前账户状态，请先重新读取账户状态，避免重复兑换。'}
        </p>
      </div>
    )
  }

  return (
    <div
      className="border-l-2 border-primary bg-primary/5 px-4 py-3"
      role="status"
    >
      <p className="text-sm font-semibold">礼品卡已兑换</p>
      <GiftCardEffectMessage
        effect={feedback.effect}
        accountConfig={accountConfig}
      />
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {feedback.reconciled === null
          ? '正在重新读取最新账户状态。'
          : feedback.reconciled
            ? '已重新读取最新账户状态，请以当前页面和订阅页面显示为准。'
            : '暂时无法完整读取最新账户状态，请先重新读取账户状态。'}
      </p>
    </div>
  )
}

function GiftCardEffectMessage({
  accountConfig,
  effect,
}: {
  accountConfig: AccountConfig | null
  effect: GiftCardEffect
}) {
  switch (effect.type) {
    case 'balance': {
      const formatted = accountConfig
        ? formatSignedMinorMoney(effect.amountMinor, accountConfig)
        : null
      return (
        <p className="mt-2 break-words text-sm tabular-nums">
          余额变动：
          {formatted ?? `${effect.amountMinor} 最小货币单位`}
        </p>
      )
    }
    case 'validity':
      return (
        <p className="mt-2 break-words text-sm tabular-nums">
          有效期变动：{effect.days} 天
        </p>
      )
    case 'traffic':
      return (
        <p className="mt-2 break-words text-sm tabular-nums">
          流量变动：{effect.gigabytes} GiB
        </p>
      )
    case 'trafficReset':
      return <p className="mt-2 text-sm">流量已按服务端规则重置</p>
    case 'plan':
      return (
        <p className="mt-2 break-words text-sm tabular-nums">
          {effect.durationDays === null
            ? '套餐已按服务端规则变更，未提供固定持续天数'
            : `套餐持续时间变动：${effect.durationDays} 天`}
        </p>
      )
  }
}
