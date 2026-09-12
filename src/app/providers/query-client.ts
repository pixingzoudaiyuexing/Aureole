import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/lib/api/errors'

function shouldRetryQuery(failureCount: number, error: unknown) {
  if (failureCount >= 1 || !(error instanceof ApiError)) {
    return false
  }

  return error.status === 0 || error.status === 408 || error.status >= 500
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
      mutations: {
        retry: false,
      },
    },
  })
}
