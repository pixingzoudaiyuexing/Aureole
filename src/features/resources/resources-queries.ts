import { queryOptions, useQuery } from '@tanstack/react-query'
import { resourcesApi } from './resources-api'

export const resourcesQueryKeys = {
  list: ['resources'] as const,
}

export function resourcesQueryOptions(accessToken: string) {
  return queryOptions({
    queryKey: resourcesQueryKeys.list,
    queryFn: () => resourcesApi.getResources(accessToken),
  })
}

export function useResources(accessToken: string) {
  return useQuery(resourcesQueryOptions(accessToken))
}
