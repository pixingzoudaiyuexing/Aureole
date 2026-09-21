import { queryOptions, useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-context'
import { useAuthSessionStore } from '@/lib/auth/session-store'
import { announcementsApi } from './announcements-api'

export const announcementsQueryKeys = {
  public: ['announcements', 'public'] as const,
  authenticated: ['announcements', 'authenticated'] as const,
}

export function announcementsQueryOptions(
  scope: 'public' | 'authenticated',
  accessToken?: string,
) {
  return queryOptions({
    queryKey: announcementsQueryKeys[scope],
    queryFn: () => announcementsApi.getAnnouncements(accessToken),
  })
}

export function useAnnouncements() {
  const { status } = useAuth()
  const authenticated = status === 'authenticated'
  const accessToken = useAuthSessionStore((state) => state.accessToken)
  const scope = authenticated ? 'authenticated' : 'public'

  return useQuery({
    ...announcementsQueryOptions(
      scope,
      authenticated ? (accessToken ?? undefined) : undefined,
    ),
    enabled:
      status === 'unauthenticated' ||
      (status === 'authenticated' && accessToken !== null),
  })
}
