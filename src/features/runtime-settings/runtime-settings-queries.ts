import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query'
import { runtimeSettingsApi } from './runtime-settings-api'

export const runtimeSettingsQueryKey = ['runtime-settings'] as const

export const runtimeSettingsQueryOptions = queryOptions({
  queryKey: runtimeSettingsQueryKey,
  queryFn: () => runtimeSettingsApi.getRuntimeSettings(),
})

export function useRuntimeSettingsQuery(queryClient?: QueryClient) {
  return useQuery(runtimeSettingsQueryOptions, queryClient)
}
