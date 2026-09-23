import { useQuery } from '@tanstack/react-query'
import { supportWidgetApi } from './support-widget-api'

export const supportWidgetQueryKey = ['support-widget', 'public'] as const

export function useSupportWidgetConfig() {
  return useQuery({
    queryKey: supportWidgetQueryKey,
    queryFn: supportWidgetApi.getConfig,
    retry: false,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  })
}
