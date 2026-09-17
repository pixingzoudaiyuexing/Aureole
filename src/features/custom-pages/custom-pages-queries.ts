import { queryOptions, useQuery } from '@tanstack/react-query'
import { customPagesApi } from './custom-pages-api'

export const customPagesQueryKey = ['custom-pages'] as const

export function customPagesQueryOptions(accessToken: string) {
  return queryOptions({
    queryKey: customPagesQueryKey,
    queryFn: () => customPagesApi.getList(accessToken),
  })
}

export function useCustomPages(accessToken: string | null) {
  return useQuery({
    ...customPagesQueryOptions(accessToken ?? ''),
    enabled: accessToken !== null,
  })
}
