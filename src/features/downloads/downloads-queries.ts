import { queryOptions, useQuery } from '@tanstack/react-query'
import { downloadsApi } from './downloads-api'

export const downloadsQueryKey = ['downloads'] as const

export function downloadsQueryOptions() {
  return queryOptions({
    queryKey: downloadsQueryKey,
    queryFn: () => downloadsApi.getDownloads(),
  })
}

export function useDownloads() {
  return useQuery(downloadsQueryOptions())
}
