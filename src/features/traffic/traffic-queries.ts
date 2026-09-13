import { queryOptions, useQuery } from '@tanstack/react-query'
import { trafficApi } from './traffic-api'

export const trafficQueryKeys = {
  logs: ['traffic', 'logs'] as const,
}

export function trafficLogsQueryOptions(accessToken: string) {
  return queryOptions({
    queryKey: trafficQueryKeys.logs,
    queryFn: () => trafficApi.getLogs(accessToken),
  })
}

export function useTrafficLogs(accessToken: string) {
  return useQuery(trafficLogsQueryOptions(accessToken))
}
