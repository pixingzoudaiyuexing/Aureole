import { queryOptions, useQuery } from '@tanstack/react-query'
import { accountApi } from './account-api'

export const accountQueryKeys = {
  preferences: ['account', 'preferences'] as const,
  stats: ['account', 'stats'] as const,
  config: ['config', 'account'] as const,
}

export function accountPreferencesQueryOptions(accessToken: string) {
  return queryOptions({
    queryKey: accountQueryKeys.preferences,
    queryFn: () => accountApi.getPreferences(accessToken),
  })
}

export function accountStatsQueryOptions(accessToken: string) {
  return queryOptions({
    queryKey: accountQueryKeys.stats,
    queryFn: () => accountApi.getStats(accessToken),
  })
}

export function accountConfigQueryOptions(accessToken: string) {
  return queryOptions({
    queryKey: accountQueryKeys.config,
    queryFn: () => accountApi.getConfig(accessToken),
  })
}

export function useAccountPreferences(accessToken: string) {
  return useQuery(accountPreferencesQueryOptions(accessToken))
}

export function useAccountStats(accessToken: string) {
  return useQuery(accountStatsQueryOptions(accessToken))
}

export function useAccountConfig(accessToken: string) {
  return useQuery(accountConfigQueryOptions(accessToken))
}
