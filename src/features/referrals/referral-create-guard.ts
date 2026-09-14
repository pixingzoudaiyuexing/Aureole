import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import type { ReferralOverview } from './referrals-api'
import { referralsQueryKeys } from './referrals-queries'

export type ReferralCreateUncertaintyStatus = 'active' | 'acknowledged' | null

export const referralCreateLocalGuardKeys = {
  uncertainty: ['referrals', 'create-code-uncertainty'] as const,
}

function uncertaintyGuardOptions() {
  return {
    queryKey: referralCreateLocalGuardKeys.uncertainty,
    queryFn: async (): Promise<ReferralCreateUncertaintyStatus> => null,
    enabled: false,
    initialData: null as ReferralCreateUncertaintyStatus,
    staleTime: Infinity,
    gcTime: Infinity,
  }
}

export function useReferralCreateUncertaintyGuard() {
  const queryClient = useQueryClient()
  const query = useQuery(uncertaintyGuardOptions())

  return {
    status: query.data,
    activate: () =>
      queryClient.setQueryData(
        referralCreateLocalGuardKeys.uncertainty,
        'active' satisfies ReferralCreateUncertaintyStatus,
      ),
    acknowledge: () =>
      queryClient.setQueryData(
        referralCreateLocalGuardKeys.uncertainty,
        'acknowledged' satisfies ReferralCreateUncertaintyStatus,
      ),
    clear: () =>
      queryClient.setQueryData(
        referralCreateLocalGuardKeys.uncertainty,
        null satisfies ReferralCreateUncertaintyStatus,
      ),
  }
}

export function getReferralCreateUncertaintyStatus(queryClient: QueryClient) {
  return (
    queryClient.getQueryData<ReferralCreateUncertaintyStatus>(
      referralCreateLocalGuardKeys.uncertainty,
    ) ?? null
  )
}

export function isReferralOverviewAuthorityReady(queryClient: QueryClient) {
  const state = queryClient.getQueryState<ReferralOverview>(
    referralsQueryKeys.overview,
  )
  return (
    state?.status === 'success' &&
    state.fetchStatus === 'idle' &&
    state.data !== undefined
  )
}
