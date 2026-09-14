import {
  useIsMutating,
  type MutationKey,
  type QueryClient,
} from '@tanstack/react-query'

export function hasExactPendingMutation(
  queryClient: QueryClient,
  mutationKey: MutationKey,
) {
  return (
    queryClient.getMutationCache().findAll({
      mutationKey,
      exact: true,
      status: 'pending',
    }).length > 0
  )
}

export function useHasExactPendingMutation(mutationKey: MutationKey) {
  return useIsMutating({ mutationKey, exact: true }) > 0
}
