import { queryOptions, useQuery } from '@tanstack/react-query'
import { appleIdApi } from './apple-id-api'

export const appleIdListKey = ['apple-ids'] as const

export function useAppleIds(accessToken: string) {
  return useQuery(
    queryOptions({
      queryKey: appleIdListKey,
      queryFn: () => appleIdApi.list(accessToken),
    }),
  )
}
