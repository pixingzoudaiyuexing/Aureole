import { queryOptions, useQuery } from '@tanstack/react-query'
import { subscriptionApi } from './subscription-api'

export const subscriptionQueryKeys = {
  access: ['subscription', 'access'] as const,
  overview: ['subscription', 'overview'] as const,
}

export function subscriptionAccessQueryOptions(accessToken: string) {
  return queryOptions({
    queryKey: subscriptionQueryKeys.access,
    queryFn: () => subscriptionApi.getAccess(accessToken),
  })
}

export function subscriptionOverviewQueryOptions(accessToken: string) {
  return queryOptions({
    queryKey: subscriptionQueryKeys.overview,
    queryFn: () => subscriptionApi.getOverview(accessToken),
  })
}

export function useSubscriptionAccess(accessToken: string) {
  return useQuery(subscriptionAccessQueryOptions(accessToken))
}

export function useSubscriptionOverview(accessToken: string) {
  return useQuery(subscriptionOverviewQueryOptions(accessToken))
}
