import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { useState } from 'react'
import {
  clearSessionSafetyMarker,
  readSessionSafetyMarker,
  sessionSafetyStorageKeys,
  writeSessionSafetyMarker,
} from '@/lib/auth/session-safety-storage'
import type { WithdrawalOptions } from './referrals-api'
import { referralsQueryKeys } from './referrals-queries'

export type WithdrawalRequestUncertaintyStatus =
  'active' | 'acknowledged' | null

export const withdrawalRequestLocalGuardKeys = {
  uncertainty: ['referrals', 'withdrawal-request-uncertainty'] as const,
}

const persistentKey = sessionSafetyStorageKeys.withdrawalRequestUncertainty

function uncertaintyGuardOptions(
  initialData: WithdrawalRequestUncertaintyStatus,
) {
  return {
    queryKey: withdrawalRequestLocalGuardKeys.uncertainty,
    queryFn: async (): Promise<WithdrawalRequestUncertaintyStatus> => null,
    enabled: false,
    initialData,
    staleTime: Infinity,
    gcTime: Infinity,
  }
}

export function useWithdrawalRequestUncertaintyGuard() {
  const queryClient = useQueryClient()
  const [persistentRead, setPersistentRead] = useState(() =>
    readSessionSafetyMarker(persistentKey),
  )
  const query = useQuery(uncertaintyGuardOptions(persistentRead.value))

  const persistStatus = (
    status: Exclude<WithdrawalRequestUncertaintyStatus, null>,
  ) => {
    if (!writeSessionSafetyMarker(persistentKey, status)) return false
    queryClient.setQueryData(
      withdrawalRequestLocalGuardKeys.uncertainty,
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
        withdrawalRequestLocalGuardKeys.uncertainty,
        'active' satisfies WithdrawalRequestUncertaintyStatus,
      ),
    activate: () => persistStatus('active'),
    acknowledge: () => persistStatus('acknowledged'),
    clear: () => {
      const cleared = clearSessionSafetyMarker(persistentKey)
      queryClient.setQueryData(
        withdrawalRequestLocalGuardKeys.uncertainty,
        (cleared
          ? null
          : 'active') satisfies WithdrawalRequestUncertaintyStatus,
      )
      return cleared
    },
    retryHydration: () => {
      const next = readSessionSafetyMarker(persistentKey)
      setPersistentRead(next)
      queryClient.setQueryData(
        withdrawalRequestLocalGuardKeys.uncertainty,
        next.value,
      )
      return next.ok
    },
  }
}

export function getWithdrawalRequestUncertaintyStatus(
  queryClient: QueryClient,
) {
  return (
    queryClient.getQueryData<WithdrawalRequestUncertaintyStatus>(
      withdrawalRequestLocalGuardKeys.uncertainty,
    ) ?? null
  )
}

export function getWithdrawalOptionsAuthority(
  queryClient: QueryClient,
): WithdrawalOptions | null {
  const state = queryClient.getQueryState<WithdrawalOptions>(
    referralsQueryKeys.withdrawalOptions,
  )
  if (
    state?.status !== 'success' ||
    state.fetchStatus !== 'idle' ||
    state.data === undefined
  ) {
    return null
  }
  return state.data
}
