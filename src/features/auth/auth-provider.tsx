import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, type ReactNode } from 'react'
import { useAuthSessionStore } from '@/lib/auth/session-store'
import { authApi as defaultAuthApi, type AuthApi } from './auth-api'
import {
  AuthContext,
  type AuthContextValue,
  type AuthStatus,
} from './auth-context'
import { isInvalidSessionError } from './auth-errors'
import { authQueryKeys } from './auth-query-keys'

export function AuthProvider({
  children,
  api = defaultAuthApi,
}: {
  children: ReactNode
  api?: AuthApi
}) {
  const queryClient = useQueryClient()
  const accessToken = useAuthSessionStore((state) => state.accessToken)
  const hydrated = useAuthSessionStore((state) => state.hydrated)
  const hydrate = useAuthSessionStore((state) => state.hydrate)
  const setAccessToken = useAuthSessionStore((state) => state.setAccessToken)
  const clearAccessToken = useAuthSessionStore(
    (state) => state.clearAccessToken,
  )

  useEffect(() => {
    hydrate()
  }, [hydrate])

  const currentUserQuery = useQuery({
    queryKey: authQueryKeys.me,
    queryFn: () => api.getCurrentUser(accessToken!),
    enabled: hydrated && accessToken !== null,
  })

  const clearSession = useCallback(() => {
    queryClient.clear()
    clearAccessToken()
  }, [clearAccessToken, queryClient])

  useEffect(() => {
    if (
      accessToken &&
      currentUserQuery.isError &&
      isInvalidSessionError(currentUserQuery.error)
    ) {
      clearSession()
    }
  }, [
    accessToken,
    clearSession,
    currentUserQuery.error,
    currentUserQuery.isError,
  ])

  const signIn = useCallback(
    async (input: Parameters<AuthContextValue['signIn']>[0]) => {
      const loginResult = await api.login(input)

      queryClient.clear()
      setAccessToken(loginResult.accessToken)

      try {
        return await queryClient.fetchQuery({
          queryKey: authQueryKeys.me,
          queryFn: () => api.getCurrentUser(loginResult.accessToken),
        })
      } catch (error) {
        if (isInvalidSessionError(error)) {
          clearSession()
        }
        throw error
      }
    },
    [api, clearSession, queryClient, setAccessToken],
  )

  let status: AuthStatus
  if (!hydrated) {
    status = 'unknown'
  } else if (!accessToken) {
    status = 'unauthenticated'
  } else if (currentUserQuery.isSuccess) {
    status = 'authenticated'
  } else if (
    currentUserQuery.isError &&
    !isInvalidSessionError(currentUserQuery.error)
  ) {
    status = 'error'
  } else {
    status = 'bootstrapping'
  }

  const value: AuthContextValue = {
    status,
    currentUser: currentUserQuery.data ?? null,
    bootstrapError: currentUserQuery.error,
    signIn,
    retryBootstrap: () => {
      void currentUserQuery.refetch()
    },
    logout: clearSession,
  }

  return <AuthContext value={value}>{children}</AuthContext>
}
