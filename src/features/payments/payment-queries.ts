import { queryOptions, useQuery } from '@tanstack/react-query'
import { paymentApi } from './payment-api'

export const paymentQueryKeys = {
  methods: ['billing', 'methods'] as const,
}

export function paymentMethodsOptions(accessToken: string) {
  return queryOptions({
    queryKey: paymentQueryKeys.methods,
    queryFn: () => paymentApi.getMethods(accessToken),
  })
}

export function usePaymentMethods(accessToken: string, enabled: boolean) {
  return useQuery({
    ...paymentMethodsOptions(accessToken),
    enabled,
  })
}

export function checkoutMutationOptions(accessToken: string, orderId: string) {
  return {
    mutationFn: (paymentMethodId: string) =>
      paymentApi.checkout(accessToken, orderId, { paymentMethodId }),
    retry: false as const,
  }
}
