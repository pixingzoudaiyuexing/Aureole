import { useAccountConfig } from '@/features/account/account-queries'
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { useExitOnInvalidSessionError } from '@/features/auth/use-exit-on-invalid-session-error'
import { formatMinorMoney } from '@/features/catalog/money-format'
import { ReadError } from '@/components/shared/read-error'
import { Button } from '@/components/ui/button'
import { useAuthSessionStore } from '@/lib/auth/session-store'
import { useWallet } from './wallet-queries'
import { WalletDepositPanel } from './wallet-deposit-panel'

export function WalletPage() {
  const accessToken = useAuthSessionStore((state) => state.accessToken)
  if (!accessToken) return null
  return <WalletContent accessToken={accessToken} />
}

function WalletContent({ accessToken }: { accessToken: string }) {
  const wallet = useWallet(accessToken)
  const config = useAccountConfig(accessToken)
  const invalid = isInvalidSessionError(wallet.error)
    ? wallet.error
    : isInvalidSessionError(config.error)
      ? config.error
      : null
  useExitOnInvalidSessionError(invalid)

  if (invalid) return null

  const formattedBalance =
    wallet.data && config.data
      ? formatMinorMoney(wallet.data.balanceMinor, config.data)
      : null

  return (
    <div className="mx-auto max-w-5xl">
      <div className="pb-8">
        <p className="text-xs font-semibold uppercase text-primary">站内余额</p>
        <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">Wallet</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          站内余额由服务端账户状态提供。
        </p>
      </div>

      <section
        className="border-t border-border py-8"
        aria-labelledby="wallet-balance-title"
      >
        <h3 id="wallet-balance-title" className="text-base font-semibold">
          当前余额
        </h3>

        <div className="mt-5 min-h-16" aria-live="polite">
          {wallet.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              正在读取余额…
            </p>
          ) : wallet.isError ? (
            <ReadError
              message="暂时无法读取站内余额。"
              error={wallet.error}
              retry={() => void wallet.refetch()}
            />
          ) : config.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              正在读取币种…
            </p>
          ) : config.isError ? (
            <ReadError
              message="暂时无法读取结算币种，余额无法安全格式化。"
              error={config.error}
              retry={() => void config.refetch()}
            />
          ) : (
            <p
              className="max-w-full break-all text-3xl font-semibold tabular-nums sm:text-4xl"
              aria-label={`当前余额：${formattedBalance ?? '暂无法安全格式化'}`}
            >
              {formattedBalance ?? '余额暂无法安全格式化'}
            </p>
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          className="mt-5"
          disabled={wallet.isFetching}
          onClick={() => void wallet.refetch()}
        >
          {wallet.isFetching && !wallet.isPending ? '正在刷新…' : '刷新余额'}
        </Button>
      </section>

      <WalletDepositPanel
        accessToken={accessToken}
        accountConfig={config.data ?? null}
        configPending={config.isPending}
        configError={config.error}
        retryConfig={() => void config.refetch()}
      />
    </div>
  )
}
