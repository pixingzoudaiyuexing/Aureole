import { queryOptions, useQuery } from '@tanstack/react-query'
import { walletApi } from './wallet-api'

export const walletQueryKeys = {
  wallet: ['wallet'] as const,
}

export function walletQueryOptions(accessToken: string) {
  return queryOptions({
    queryKey: walletQueryKeys.wallet,
    queryFn: () => walletApi.getWallet(accessToken),
  })
}

export function useWallet(accessToken: string) {
  return useQuery(walletQueryOptions(accessToken))
}
