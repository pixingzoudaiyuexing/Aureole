import { useQuery } from '@tanstack/react-query'
import { publicAccountApi } from './public-account-api'

export const onboardingQueryKey = ['auth', 'onboarding'] as const

export function useOnboardingConfig() {
  return useQuery({
    queryKey: onboardingQueryKey,
    queryFn: () => publicAccountApi.getOnboardingConfig(),
    staleTime: 0,
  })
}
