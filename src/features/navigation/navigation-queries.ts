import { queryOptions, useQuery } from '@tanstack/react-query'
import { navigationApi } from './navigation-api'

export const navigationQueryKey = ['navigation'] as const

export function navigationQueryOptions(accessToken: string) {
  return queryOptions({
    queryKey: navigationQueryKey,
    queryFn: () => navigationApi.getList(accessToken),
  })
}

export function useNavigation(accessToken: string | null) {
  return useQuery({
    ...navigationQueryOptions(accessToken ?? ''),
    enabled: accessToken !== null,
  })
}
