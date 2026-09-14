import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { useState } from 'react'
import type { AccountConfig } from '@/features/account/account-api'
import { accountQueryKeys } from '@/features/account/account-queries'
import { formatMinorMoney } from '@/features/catalog/money-format'
import type { Wallet } from '@/features/wallet/wallet-api'
import { walletQueryKeys } from '@/features/wallet/wallet-queries'
import {
  clearSessionSafetyMarker,
  readSessionSafetyMarker,
  sessionSafetyStorageKeys,
  writeSessionSafetyMarker,
} from '@/lib/auth/session-safety-storage'
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

const persistentKey = sessionSafetyStorageKeys.commissionTransferUncertainty

function uncertaintyGuardOptions(
  initialData: CommissionTransferUncertaintyStatus,
) {
  return {
    queryKey: commissionTransferLocalGuardKeys.uncertainty,
    queryFn: async (): Promise<CommissionTransferUncertaintyStatus> => null,
    enabled: false,
    initialData,
    staleTime: Infinity,
    gcTime: Infinity,
  }
}

export function useCommissionTransferUncertaintyGuard() {
  const queryClient = useQueryClient()
  const [persistentRead, setPersistentRead] = useState(() =>
    readSessionSafetyMarker(persistentKey),
  )
  const query = useQuery(uncertaintyGuardOptions(persistentRead.value))

  const persistStatus = (
    status: Exclude<CommissionTransferUncertaintyStatus, null>,
  ) => {
    if (!writeSessionSafetyMarker(persistentKey, status)) return false
    queryClient.setQueryData(
      commissionTransferLocalGuardKeys.uncertainty,
      status,
    )
    return true
  }

  return {
    status: query.data,
    hydrated: true,
    storageAvailable: persistentRead.ok,
    preArm: () => persistStatus('active'),
    retainActive: () =>
      queryClient.setQueryData(
        commissionTransferLocalGuardKeys.uncertainty,
        'active' satisfies CommissionTransferUncertaintyStatus,
      ),
    activate: () => persistStatus('active'),
    acknowledge: () => persistStatus('acknowledged'),
    clear: () => {
      const cleared = clearSessionSafetyMarker(persistentKey)
      queryClient.setQueryData(
        commissionTransferLocalGuardKeys.uncertainty,
        null satisfies CommissionTransferUncertaintyStatus,
      )
      return cleared
    },
    retryHydration: () => {
      const next = readSessionSafetyMarker(persistentKey)
      setPersistentRead(next)
      queryClient.setQueryData(
        commissionTransferLocalGuardKeys.uncertainty,
        next.value,
      )
      return next.ok
    },
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
