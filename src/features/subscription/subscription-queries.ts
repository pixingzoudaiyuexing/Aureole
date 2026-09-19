import { queryOptions, useQuery } from '@tanstack/react-query'
import { subscriptionApi } from './subscription-api'

export const subscriptionQueryKeys = {
  deliveryOptions: ['subscription', 'delivery-options'] as const,
  overview: ['subscription', 'overview'] as const,
}

export const subscriptionMutationKeys = {
  rotateAccess: ['subscription', 'rotate-access'] as const,
  advancePeriod: ['subscription', 'advance-period'] as const,
}

export function subscriptionDeliveryOptionsQueryOptions(accessToken: string) {
  return queryOptions({
    queryKey: subscriptionQueryKeys.deliveryOptions,
    queryFn: ({ signal }) =>
      subscriptionApi.getDeliveryOptions(accessToken, signal),
  })
}

export function subscriptionOverviewQueryOptions(accessToken: string) {
  return queryOptions({
    queryKey: subscriptionQueryKeys.overview,
    queryFn: () => subscriptionApi.getOverview(accessToken),
  })
}

export function rotateSubscriptionAccessMutationOptions(accessToken: string) {
  return {
    mutationKey: subscriptionMutationKeys.rotateAccess,
    mutationFn: async () => {
      await subscriptionApi.rotateAccess(accessToken)
      return { rotated: true as const }
    },
    retry: false as const,
  }
}

export function advanceSubscriptionPeriodMutationOptions(accessToken: string) {
  return {
    mutationKey: subscriptionMutationKeys.advancePeriod,
    mutationFn: () => subscriptionApi.advancePeriod(accessToken),
    retry: false as const,
  }
}

export function useSubscriptionDeliveryOptions(accessToken: string) {
  return useQuery(subscriptionDeliveryOptionsQueryOptions(accessToken))
}

export function useSubscriptionOverview(accessToken: string) {
  return useQuery(subscriptionOverviewQueryOptions(accessToken))
}
