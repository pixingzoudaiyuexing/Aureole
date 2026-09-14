import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import type { AccountConfig } from '@/features/account/account-api'
import { accountQueryKeys } from '@/features/account/account-queries'
import { formatMinorMoney } from '@/features/catalog/money-format'
import type { Wallet } from '@/features/wallet/wallet-api'
import { walletQueryKeys } from '@/features/wallet/wallet-queries'
import type { ReferralOverview } from './referrals-api'
import { referralsQueryKeys } from './referrals-queries'

export type CommissionTransferUncertaintyStatus =
  'active' | 'acknowledged' | null

export const commissionTransferLocalGuardKeys = {
  uncertainty: ['referrals', 'commission-transfer-uncertainty'] as const,
}

export interface CommissionTransferAuthority {
  accountConfig: AccountConfig
  overview: ReferralOverview
  wallet: Wallet
}

function uncertaintyGuardOptions() {
  return {
    queryKey: commissionTransferLocalGuardKeys.uncertainty,
    queryFn: async (): Promise<CommissionTransferUncertaintyStatus> => null,
    enabled: false,
    initialData: null as CommissionTransferUncertaintyStatus,
    staleTime: Infinity,
    gcTime: Infinity,
  }
}

export function useCommissionTransferUncertaintyGuard() {
  const queryClient = useQueryClient()
  const query = useQuery(uncertaintyGuardOptions())

  return {
    status: query.data,
    activate: () =>
      queryClient.setQueryData(
        commissionTransferLocalGuardKeys.uncertainty,
        'active' satisfies CommissionTransferUncertaintyStatus,
      ),
    acknowledge: () =>
      queryClient.setQueryData(
        commissionTransferLocalGuardKeys.uncertainty,
        'acknowledged' satisfies CommissionTransferUncertaintyStatus,
      ),
    clear: () =>
      queryClient.setQueryData(
        commissionTransferLocalGuardKeys.uncertainty,
        null satisfies CommissionTransferUncertaintyStatus,
      ),
  }
}

export function getCommissionTransferUncertaintyStatus(
  queryClient: QueryClient,
) {
  return (
    queryClient.getQueryData<CommissionTransferUncertaintyStatus>(
      commissionTransferLocalGuardKeys.uncertainty,
    ) ?? null
  )
}

function currentQueryData<T>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
) {
  const state = queryClient.getQueryState<T>(queryKey)
  if (
    state?.status !== 'success' ||
    state.fetchStatus !== 'idle' ||
    state.data === undefined
  ) {
    return null
  }
  return state.data
}

export function getCommissionTransferAuthority(
  queryClient: QueryClient,
): CommissionTransferAuthority | null {
  const overview = currentQueryData<ReferralOverview>(
    queryClient,
    referralsQueryKeys.overview,
  )
  const wallet = currentQueryData<Wallet>(queryClient, walletQueryKeys.wallet)
  const accountConfig = currentQueryData<AccountConfig>(
    queryClient,
    accountQueryKeys.config,
  )
  if (
    !overview ||
    !wallet ||
    !accountConfig ||
    formatMinorMoney(0, accountConfig) === null
  ) {
    return null
  }
  return { accountConfig, overview, wallet }
}
