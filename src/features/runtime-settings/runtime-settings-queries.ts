import { queryOptions, useQuery } from '@tanstack/react-query'
import { runtimeSettingsApi } from './runtime-settings-api'

export const runtimeSettingsQueryKey = ['runtime-settings'] as const

export const runtimeSettingsQueryOptions = queryOptions({
  queryKey: runtimeSettingsQueryKey,
  queryFn: () => runtimeSettingsApi.getRuntimeSettings(),
})

export function useRuntimeSettingsQuery() {
  return useQuery(runtimeSettingsQueryOptions)
}
