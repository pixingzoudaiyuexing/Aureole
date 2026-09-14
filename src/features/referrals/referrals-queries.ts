import { queryOptions, useQuery } from '@tanstack/react-query'
import { referralsApi } from './referrals-api'

export const COMMISSION_PAGE_SIZE = 20

export const referralsQueryKeys = {
  overview: ['referrals', 'overview'] as const,
  commissions: (page: number) =>
    ['referrals', 'commissions', page, COMMISSION_PAGE_SIZE] as const,
  withdrawalOptions: ['referrals', 'withdrawal-options'] as const,
}

export const referralsMutationKeys = {
  createCode: ['referrals', 'create-code'] as const,
  commissionTransfer: ['referrals', 'commission-transfer'] as const,
}

export function referralOverviewOptions(accessToken: string) {
  return queryOptions({
    queryKey: referralsQueryKeys.overview,
    queryFn: () => referralsApi.getOverview(accessToken),
    refetchOnMount: 'always',
  })
}

export function referralCommissionsOptions(accessToken: string, page: number) {
  return queryOptions({
    queryKey: referralsQueryKeys.commissions(page),
    queryFn: () =>
      referralsApi.getCommissions(accessToken, page, COMMISSION_PAGE_SIZE),
  })
}

export function referralWithdrawalOptions(accessToken: string) {
  return queryOptions({
    queryKey: referralsQueryKeys.withdrawalOptions,
    queryFn: () => referralsApi.getWithdrawalOptions(accessToken),
  })
}

export function useReferralOverview(accessToken: string) {
  return useQuery(referralOverviewOptions(accessToken))
}

export function useReferralCommissions(accessToken: string, page: number) {
  return useQuery(referralCommissionsOptions(accessToken, page))
}

export function useReferralWithdrawalOptions(accessToken: string) {
  return useQuery(referralWithdrawalOptions(accessToken))
}

export function referralCodeCreateMutationOptions(accessToken: string) {
  return {
    mutationKey: referralsMutationKeys.createCode,
    mutationFn: () => referralsApi.createCode(accessToken),
    retry: false as const,
  }
}

export function commissionTransferMutationOptions(accessToken: string) {
  return {
    mutationKey: referralsMutationKeys.commissionTransfer,
    mutationFn: (amountMinor: number) =>
      referralsApi.transferCommission(accessToken, { amountMinor }),
    retry: false as const,
  }
}
